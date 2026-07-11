import { Server } from "socket.io";
import { eq, and, ne, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages, conversations, groups, groupMembers, users, sessions } from "../db/schema.js";
import { redis } from "../lib/redis.js";

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;

interface ActiveCall {
  conversationId: string;
  initiatorId: string;
  type: string;
  participants: Map<string, { userId: string; userName: string }>;
}
const activeCalls = new Map<string, ActiveCall>();

export function setupSocket(io: Server) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error("Unauthorized"));

    const [row] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);

    if (!row) return next(new Error("Unauthorized"));

    (socket as any).data = { userId: row.userId };
    next();
  });

  io.on("connection", async (socket) => {
    const userId = (socket as any).data.userId as string;

    socket.join(`user:${userId}`);
    await redis.set(PRESENCE_KEY(userId), "online");
    io.emit("user:online", userId);

    socket.on("conversation:join", (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("conversation:leave", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("typing:start", (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit("typing:start", { conversationId, userId });
    });

    socket.on("typing:stop", (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit("typing:stop", { conversationId, userId });
    });

    socket.on("message:send", async (payload: any, ack: (msg: any) => void) => {
      const id = crypto.randomUUID();
      const now = new Date();

      const [message] = await db
        .insert(messages)
        .values({
          id,
          conversationId: payload.conversationId,
          senderId: userId,
          type: payload.type,
          content: payload.content,
          status: "sent",
          fileUrl: payload.fileUrl ?? null,
          fileName: payload.fileName ?? null,
          fileSize: payload.fileSize ? String(payload.fileSize) : null,
          replyToId: payload.replyToId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Fetch replyTo preview if present
      let replyTo = null;
      if (message.replyToId) {
        replyTo = await fetchReplyPreview(message.replyToId);
      }

      const outgoing = { ...serializeMessage(message), replyTo };

      socket.to(`conversation:${payload.conversationId}`).emit("message:new", outgoing);
      ack(outgoing);

      const room = io.sockets.adapter.rooms.get(`conversation:${payload.conversationId}`);
      if (room && room.size > 1) {
        await db
          .update(messages)
          .set({ status: "delivered", updatedAt: new Date() })
          .where(eq(messages.id, id));

        io.to(`user:${userId}`).emit("message:status", { messageId: id, status: "delivered" });
      }
    });

    socket.on("message:delivered", async (messageId: string) => {
      const [msg] = await db
        .update(messages)
        .set({ status: "delivered", updatedAt: new Date() })
        .where(and(eq(messages.id, messageId), ne(messages.senderId, userId)))
        .returning();

      if (msg) {
        io.to(`user:${msg.senderId}`).emit("message:status", { messageId, status: "delivered" });
      }
    });

    socket.on("message:read", async (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);

      const unread = await db
        .select({ id: messages.id, senderId: messages.senderId })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            ne(messages.senderId, userId),
            inArray(messages.status, ["sent", "delivered"])
          )
        );

      if (unread.length === 0) return;

      await db
        .update(messages)
        .set({ status: "read", updatedAt: new Date() })
        .where(
          and(
            eq(messages.conversationId, conversationId),
            ne(messages.senderId, userId),
            inArray(messages.status, ["sent", "delivered"])
          )
        );

      const senderIds = [...new Set(unread.map((m) => m.senderId))];
      for (const senderId of senderIds) {
        const messageIds = unread.filter((m) => m.senderId === senderId).map((m) => m.id);
        for (const messageId of messageIds) {
          io.to(`user:${senderId}`).emit("message:status", { messageId, status: "read" });
        }
      }
    });

    // ── Call signaling ────────────────────────────────────────────
    socket.on("call:invite", async ({ conversationId, type }: { conversationId: string; type: string }, ack: Function) => {
      const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      const callerName = user?.name ?? "Unknown";
      const callId = crypto.randomUUID();

      activeCalls.set(callId, {
        conversationId,
        initiatorId: userId,
        type,
        participants: new Map([[userId, { userId, userName: callerName }]]),
      });

      // Resolve recipients from DB so the invite reaches users regardless of which room they have open
      const [conv] = await db
        .select({ type: conversations.type, participantA: conversations.participantA, participantB: conversations.participantB })
        .from(conversations).where(eq(conversations.id, conversationId)).limit(1);

      let recipientIds: string[] = [];
      if (conv) {
        if (conv.type === "direct") {
          const other = conv.participantA === userId ? conv.participantB : conv.participantA;
          if (other) recipientIds = [other];
        } else {
          const [grp] = await db.select({ id: groups.id }).from(groups).where(eq(groups.conversationId, conversationId)).limit(1);
          if (grp) {
            const members = await db.select({ userId: groupMembers.userId })
              .from(groupMembers).where(eq(groupMembers.groupId, grp.id));
            recipientIds = members.map((m) => m.userId).filter((id) => id !== userId);
          }
        }
      }

      const payload = { callId, conversationId, callerId: userId, callerName, type: type as "audio" | "video" };
      for (const id of recipientIds) {
        io.to(`user:${id}`).emit("call:invite", payload);
      }

      // Auto-cleanup if no one joins within 60 s
      setTimeout(() => {
        const call = activeCalls.get(callId);
        if (call && call.participants.size <= 1) {
          activeCalls.delete(callId);
          for (const id of recipientIds) io.to(`user:${id}`).emit("call:ended", { callId });
        }
      }, 60_000);

      ack({ callId });
    });

    socket.on("call:join", async ({ callId }: { callId: string }, ack: Function) => {
      const call = activeCalls.get(callId);
      if (!call) return ack({ participants: [] });

      const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      const userName = user?.name ?? "Unknown";
      const existing = [...call.participants.values()];

      call.participants.set(userId, { userId, userName });
      socket.join(`call:${callId}`);

      for (const p of existing) {
        io.to(`user:${p.userId}`).emit("call:join", { callId, userId, userName });
      }

      ack({ participants: existing });
    });

    socket.on("call:leave", ({ callId }: { callId: string }) => {
      const call = activeCalls.get(callId);
      if (!call) return;

      call.participants.delete(userId);
      socket.leave(`call:${callId}`);

      for (const p of call.participants.values()) {
        io.to(`user:${p.userId}`).emit("call:leave", { callId, userId });
      }

      if (call.participants.size === 0) {
        activeCalls.delete(callId);
        io.to(`conversation:${call.conversationId}`).emit("call:ended", { callId });
      }
    });

    socket.on("call:offer", ({ callId, to, sdp }: { callId: string; to: string; sdp: any }) => {
      io.to(`user:${to}`).emit("call:offer", { callId, from: userId, sdp });
    });

    socket.on("call:answer", ({ callId, to, sdp }: { callId: string; to: string; sdp: any }) => {
      io.to(`user:${to}`).emit("call:answer", { callId, from: userId, sdp });
    });

    socket.on("call:ice", ({ callId, to, candidate }: { callId: string; to: string; candidate: any }) => {
      io.to(`user:${to}`).emit("call:ice", { callId, from: userId, candidate });
    });

    socket.on("call:reject", ({ callId }: { callId: string }) => {
      const call = activeCalls.get(callId);
      if (!call) return;
      io.to(`user:${call.initiatorId}`).emit("call:rejected", { callId, userId });
    });
    // ── End call signaling ────────────────────────────────────────

    socket.on("disconnect", async () => {
      // Leave any active calls
      for (const [callId, call] of activeCalls.entries()) {
        if (call.participants.has(userId)) {
          call.participants.delete(userId);
          for (const p of call.participants.values()) {
            io.to(`user:${p.userId}`).emit("call:leave", { callId, userId });
          }
          if (call.participants.size === 0) {
            activeCalls.delete(callId);
            io.to(`conversation:${call.conversationId}`).emit("call:ended", { callId });
          }
        }
      }

      await redis.del(PRESENCE_KEY(userId));

      const lastSeen = new Date();
      await db
        .update(users)
        .set({ lastSeen, updatedAt: lastSeen })
        .where(eq(users.id, userId));

      io.emit("user:offline", userId, lastSeen.toISOString());
    });
  });
}

async function fetchReplyPreview(messageId: string) {
  const [msg] = await db.select({ id: messages.id, senderId: messages.senderId, content: messages.content, type: messages.type })
    .from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg) return null;
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, msg.senderId)).limit(1);
  return { id: msg.id, senderId: msg.senderId, senderName: user?.name ?? "Unknown", content: msg.content, type: msg.type };
}

function serializeMessage(msg: any) {
  return {
    ...msg,
    fileSize: msg.fileSize ? Number(msg.fileSize) : null,
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
    updatedAt: msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : msg.updatedAt,
  };
}
