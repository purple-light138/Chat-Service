import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages, messageDeletions, pinnedMessages, starredMessages, conversations, groups, groupMembers } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import type { Server } from "socket.io";

export async function messageRoutes(app: FastifyInstance, opts: { io: Server }) {
  const { io } = opts;

  // Edit message (own messages only)
  app.patch("/messages/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { content } = req.body as { content: string };
    if (!content?.trim()) return reply.status(400).send({ error: "Content required" });

    const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });
    if (msg.senderId !== req.userId) return reply.status(403).send({ error: "Not your message" });
    if (msg.isDeleted) return reply.status(400).send({ error: "Cannot edit deleted message" });

    await db.update(messages).set({ content: content.trim(), edited: true, updatedAt: new Date() }).where(eq(messages.id, id));
    io.to(`conversation:${msg.conversationId}`).emit("message:edited", { messageId: id, content: content.trim(), conversationId: msg.conversationId });
    return reply.send({ ok: true });
  });

  // Delete message
  app.delete("/messages/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { forEveryone } = req.query as { forEveryone?: string };

    const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });

    if (forEveryone === "true") {
      if (msg.senderId !== req.userId) return reply.status(403).send({ error: "Not your message" });
      await db.update(messages).set({ isDeleted: true, content: "", updatedAt: new Date() }).where(eq(messages.id, id));
      io.to(`conversation:${msg.conversationId}`).emit("message:deleted", { messageId: id, conversationId: msg.conversationId, forEveryone: true });
    } else {
      // Delete for me — record a per-user deletion
      const [existing] = await db.select().from(messageDeletions).where(and(eq(messageDeletions.messageId, id), eq(messageDeletions.userId, req.userId))).limit(1);
      if (!existing) {
        await db.insert(messageDeletions).values({ id: crypto.randomUUID(), messageId: id, userId: req.userId, createdAt: new Date() });
      }
    }

    return reply.send({ ok: true });
  });

  // Pin message
  app.post("/messages/:id/pin", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });

    // Check membership
    if (!await isMember(msg.conversationId, req.userId)) return reply.status(403).send({ error: "Access denied" });

    // Remove existing pin if any, then add new
    await db.delete(pinnedMessages).where(eq(pinnedMessages.conversationId, msg.conversationId));
    await db.insert(pinnedMessages).values({ id: crypto.randomUUID(), conversationId: msg.conversationId, messageId: id, pinnedBy: req.userId, pinnedAt: new Date() });

    const pinned = await buildMessagePreview(id);
    io.to(`conversation:${msg.conversationId}`).emit("message:pinned", { conversationId: msg.conversationId, pinnedMessage: pinned });
    return reply.send({ ok: true });
  });

  // Unpin message
  app.delete("/messages/:id/pin", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [pin] = await db.select().from(pinnedMessages).where(eq(pinnedMessages.messageId, id)).limit(1);
    if (!pin) return reply.status(404).send({ error: "Not pinned" });

    if (!await isMember(pin.conversationId, req.userId)) return reply.status(403).send({ error: "Access denied" });

    await db.delete(pinnedMessages).where(eq(pinnedMessages.messageId, id));
    io.to(`conversation:${pin.conversationId}`).emit("message:pinned", { conversationId: pin.conversationId, pinnedMessage: null });
    return reply.send({ ok: true });
  });

  // Star message
  app.post("/messages/:id/star", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(starredMessages).where(and(eq(starredMessages.messageId, id), eq(starredMessages.userId, req.userId))).limit(1);
    if (!existing) {
      await db.insert(starredMessages).values({ id: crypto.randomUUID(), userId: req.userId, messageId: id, createdAt: new Date() });
    }
    return reply.send({ ok: true });
  });

  // Unstar message
  app.delete("/messages/:id/star", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(starredMessages).where(and(eq(starredMessages.messageId, id), eq(starredMessages.userId, req.userId)));
    return reply.send({ ok: true });
  });

  // Get pinned message for a conversation
  app.get("/conversations/:id/pinned", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [pin] = await db.select().from(pinnedMessages).where(eq(pinnedMessages.conversationId, id)).limit(1);
    if (!pin) return reply.send(null);
    const msg = await buildMessagePreview(pin.messageId);
    return reply.send(msg);
  });
}

async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conv) return false;
  if (conv.type === "direct") return conv.participantA === userId || conv.participantB === userId;
  const [group] = await db.select().from(groups).where(eq(groups.conversationId, conversationId)).limit(1);
  if (!group) return false;
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, userId))).limit(1);
  return !!membership;
}

async function buildMessagePreview(messageId: string) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg) return null;
  return {
    ...msg,
    fileSize: msg.fileSize ? Number(msg.fileSize) : null,
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
    updatedAt: msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : msg.updatedAt,
  };
}
