import { Server } from "socket.io";
import { eq, and, ne, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages, conversations, users, sessions } from "../db/schema.js";
import { redis } from "../lib/redis.js";

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;

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

    socket.on("disconnect", async () => {
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
