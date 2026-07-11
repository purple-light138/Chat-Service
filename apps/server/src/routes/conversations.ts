import type { FastifyInstance } from "fastify";
import { eq, or, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations, messages, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/conversations", { preHandler: [requireAuth] }, async (req, reply) => {
    const rows = await db
      .select({
        id: conversations.id,
        participantA: conversations.participantA,
        participantB: conversations.participantB,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(
        or(
          eq(conversations.participantA, req.userId),
          eq(conversations.participantB, req.userId)
        )
      );

    const result = await Promise.all(
      rows.map(async (conv) => {
        const otherId = conv.participantA === req.userId ? conv.participantB : conv.participantA;

        const [other] = await db
          .select({ id: users.id, name: users.name, avatarUrl: users.image, status: users.status, lastSeen: users.lastSeen })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);

        const [lastMessage] = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        return {
          id: conv.id,
          participant: other,
          lastMessage: lastMessage ?? null,
          createdAt: conv.createdAt,
        };
      })
    );

    return reply.send(result);
  });

  app.post("/conversations", { preHandler: [requireAuth] }, async (req, reply) => {
    const { participantId } = req.body as { participantId: string };

    const existing = await db
      .select()
      .from(conversations)
      .where(
        or(
          and(eq(conversations.participantA, req.userId), eq(conversations.participantB, participantId)),
          and(eq(conversations.participantA, participantId), eq(conversations.participantB, req.userId))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return reply.send(existing[0]);
    }

    const id = crypto.randomUUID();
    const [conv] = await db
      .insert(conversations)
      .values({ id, participantA: req.userId, participantB: participantId })
      .returning();

    return reply.status(201).send(conv);
  });

  app.get("/conversations/:id/messages", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { before, limit = "50" } = req.query as { before?: string; limit?: string };

    const [conv] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, id),
          or(eq(conversations.participantA, req.userId), eq(conversations.participantB, req.userId))
        )
      )
      .limit(1);

    if (!conv) return reply.status(404).send({ error: "Conversation not found" });

    const query = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(parseInt(limit), 100));

    const rows = await query;
    return reply.send(
      rows.reverse().map((m) => ({
        ...m,
        fileSize: m.fileSize ? Number(m.fileSize) : null,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
        updatedAt: m.updatedAt instanceof Date ? m.updatedAt.toISOString() : m.updatedAt,
      }))
    );
  });
}
