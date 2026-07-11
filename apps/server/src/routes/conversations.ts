import type { FastifyInstance } from "fastify";
import { eq, or, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations, groups, groupMembers, messages, users } from "../db/schema.js";
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

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(parseInt(limit), 100));

    return reply.send(rows.reverse().map(serializeMessage));
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
