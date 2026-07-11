import type { FastifyInstance } from "fastify";
import { eq, or, and, desc, notInArray, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations, groups, groupMembers, messages, messageDeletions, pinnedMessages, starredMessages, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/conversations", { preHandler: [requireAuth] }, async (req, reply) => {
    // Direct conversations the user is part of
    const directConvs = await db
      .select({ id: conversations.id, type: conversations.type, participantA: conversations.participantA, participantB: conversations.participantB, createdAt: conversations.createdAt })
      .from(conversations)
      .where(
        and(
          eq(conversations.type, "direct"),
          or(eq(conversations.participantA, req.userId), eq(conversations.participantB, req.userId))
        )
      );

    // Group conversations the user is a member of
    const groupConvs = await db
      .select({ id: conversations.id, type: conversations.type, createdAt: conversations.createdAt })
      .from(conversations)
      .innerJoin(groups, eq(groups.conversationId, conversations.id))
      .innerJoin(groupMembers, and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, req.userId)))
      .where(eq(conversations.type, "group"));

    const result = await Promise.all([
      ...directConvs.map(async (conv) => {
        const otherId = conv.participantA === req.userId ? conv.participantB : conv.participantA;
        const [other] = await db
          .select({ id: users.id, name: users.name, email: users.email, image: users.image, status: users.status, lastSeen: users.lastSeen })
          .from(users).where(eq(users.id, otherId!)).limit(1);

        const [lastMessage] = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(desc(messages.createdAt)).limit(1);

        return {
          id: conv.id, type: "direct" as const,
          participant: other ?? null,
          lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
          unreadCount: 0,
          createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : conv.createdAt,
        };
      }),
      ...groupConvs.map(async (conv) => {
        const [group] = await db.select().from(groups).where(eq(groups.conversationId, conv.id)).limit(1);
        const [myMembership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, req.userId))).limit(1);
        const memberCount = (await db.select({ id: groupMembers.id }).from(groupMembers).where(eq(groupMembers.groupId, group.id))).length;
        const [lastMessage] = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(desc(messages.createdAt)).limit(1);

        return {
          id: conv.id, type: "group" as const,
          group: {
            id: group.id, name: group.name, iconUrl: group.iconUrl,
            createdBy: group.createdBy, memberCount,
            myRole: myMembership?.role ?? "member",
          },
          lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
          unreadCount: 0,
          createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : conv.createdAt,
        };
      }),
    ]);

    // Sort by last message time (most recent first)
    result.sort((a, b) => {
      const at = String(a.lastMessage?.createdAt ?? a.createdAt);
      const bt = String(b.lastMessage?.createdAt ?? b.createdAt);
      return new Date(bt).getTime() - new Date(at).getTime();
    });

    return reply.send(result);
  });

  app.post("/conversations", { preHandler: [requireAuth] }, async (req, reply) => {
    const { participantId } = req.body as { participantId: string };

    const [existing] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.type, "direct"),
          or(
            and(eq(conversations.participantA, req.userId), eq(conversations.participantB, participantId)),
            and(eq(conversations.participantA, participantId), eq(conversations.participantB, req.userId))
          )
        )
      )
      .limit(1);

    if (existing) return reply.send(existing);

    const id = crypto.randomUUID();
    const [conv] = await db
      .insert(conversations)
      .values({ id, type: "direct", participantA: req.userId, participantB: participantId })
      .returning();

    return reply.status(201).send(conv);
  });

  app.get("/conversations/:id/messages", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { limit = "50" } = req.query as { limit?: string };

    // Check membership: direct participant OR group member
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return reply.status(404).send({ error: "Conversation not found" });

    if (conv.type === "direct") {
      if (conv.participantA !== req.userId && conv.participantB !== req.userId)
        return reply.status(403).send({ error: "Access denied" });
    } else {
      const [group] = await db.select().from(groups).where(eq(groups.conversationId, id)).limit(1);
      if (!group) return reply.status(404).send({ error: "Group not found" });
      const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, req.userId))).limit(1);
      if (!membership) return reply.status(403).send({ error: "Access denied" });
    }

    // IDs deleted for this user
    const deletedForMe = await db.select({ messageId: messageDeletions.messageId })
      .from(messageDeletions).where(eq(messageDeletions.userId, req.userId));
    const deletedIds = deletedForMe.map((d) => d.messageId);

    const baseWhere = deletedIds.length > 0
      ? and(eq(messages.conversationId, id), notInArray(messages.id, deletedIds))
      : eq(messages.conversationId, id);

    const rows = await db.select().from(messages).where(baseWhere).orderBy(desc(messages.createdAt)).limit(Math.min(parseInt(limit), 100));

    // Fetch starred + pinned for this user/conversation
    const msgIds = rows.map((m) => m.id);
    const [starredRows, pinnedRow] = await Promise.all([
      msgIds.length > 0 ? db.select({ messageId: starredMessages.messageId }).from(starredMessages).where(and(eq(starredMessages.userId, req.userId), inArray(starredMessages.messageId, msgIds))) : Promise.resolve([]),
      db.select().from(pinnedMessages).where(eq(pinnedMessages.conversationId, id)).limit(1),
    ]);
    const starredSet = new Set(starredRows.map((s) => s.messageId));
    const pinnedId = pinnedRow[0]?.messageId ?? null;

    // Fetch replyTo previews for messages that have replyToId
    const replyIds = [...new Set(rows.filter((m) => m.replyToId).map((m) => m.replyToId!))];
    const replyMap: Record<string, any> = {};
    if (replyIds.length > 0) {
      const replyMsgs = await db.select({ id: messages.id, senderId: messages.senderId, content: messages.content, type: messages.type })
        .from(messages).where(inArray(messages.id, replyIds));
      const senderIds = [...new Set(replyMsgs.map((m) => m.senderId))];
      const senderRows = senderIds.length > 0
        ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, senderIds))
        : [];
      const senderNameMap: Record<string, string> = {};
      for (const s of senderRows) senderNameMap[s.id] = s.name;
      for (const m of replyMsgs) {
        replyMap[m.id] = { id: m.id, senderId: m.senderId, senderName: senderNameMap[m.senderId] ?? "Unknown", content: m.content, type: m.type };
      }
    }

    return reply.send(
      rows.reverse().map((m) => ({
        ...serializeMessage(m),
        isStarred: starredSet.has(m.id),
        isPinned: m.id === pinnedId,
        replyTo: m.replyToId ? (replyMap[m.replyToId] ?? null) : null,
      }))
    );
  });

  // Media gallery — all non-text messages in a conversation
  app.get("/conversations/:id/media", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return reply.status(404).send({ error: "Not found" });

    if (conv.type === "direct") {
      if (conv.participantA !== req.userId && conv.participantB !== req.userId)
        return reply.status(403).send({ error: "Access denied" });
    } else {
      const [group] = await db.select().from(groups).where(eq(groups.conversationId, id)).limit(1);
      if (!group) return reply.status(404).send({ error: "Not found" });
      const [membership] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, req.userId))).limit(1);
      if (!membership) return reply.status(403).send({ error: "Access denied" });
    }

    const rows = await db.select().from(messages)
      .where(and(eq(messages.conversationId, id), inArray(messages.type, ["image", "video", "audio", "pdf", "file"]), eq(messages.isDeleted, false)))
      .orderBy(desc(messages.createdAt));

    return reply.send(rows.map(serializeMessage));
  });
}

function serializeMessage(m: Record<string, unknown>) {
  return {
    ...m,
    fileSize: m.fileSize ? Number(m.fileSize) : null,
    createdAt: m.createdAt instanceof Date ? (m.createdAt as Date).toISOString() : m.createdAt,
    updatedAt: m.updatedAt instanceof Date ? (m.updatedAt as Date).toISOString() : m.updatedAt,
  };
}
