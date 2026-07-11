import type { FastifyInstance } from "fastify";
import { eq, ilike, and, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, contacts } from "../db/schema.js";
import { redis } from "../lib/redis.js";
import { requireAuth } from "../middleware/auth.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/users/search", { preHandler: [requireAuth] }, async (req, reply) => {
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return reply.send([]);
    }

    const results = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.image,
        status: users.status,
        lastSeen: users.lastSeen,
      })
      .from(users)
      .where(and(ilike(users.name, `%${q}%`), ne(users.id, req.userId)))
      .limit(20);

    return reply.send(results);
  });

  app.get("/users/me", { preHandler: [requireAuth] }, async (req, reply) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1);

    if (!user) return reply.status(404).send({ error: "User not found" });

    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.image,
      status: user.status,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
    });
  });

  app.patch("/users/me", { preHandler: [requireAuth] }, async (req, reply) => {
    const { name, status } = req.body as { name?: string; status?: "available" | "busy" };

    const updated = await db
      .update(users)
      .set({
        ...(name && { name }),
        ...(status && { status }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.userId))
      .returning();

    return reply.send(updated[0]);
  });

  app.get("/contacts", { preHandler: [requireAuth] }, async (req, reply) => {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.image,
        status: users.status,
        lastSeen: users.lastSeen,
        blocked: contacts.blocked,
      })
      .from(contacts)
      .innerJoin(users, eq(contacts.contactId, users.id))
      .where(eq(contacts.userId, req.userId));

    return reply.send(rows);
  });

  app.post("/contacts", { preHandler: [requireAuth] }, async (req, reply) => {
    const { contactId } = req.body as { contactId: string };

    if (contactId === req.userId) {
      return reply.status(400).send({ error: "Cannot add yourself" });
    }

    const existing = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.userId, req.userId), eq(contacts.contactId, contactId)))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: "Contact already exists" });
    }

    const id = crypto.randomUUID();
    await db.insert(contacts).values({ id, userId: req.userId, contactId });

    return reply.status(201).send({ id });
  });

  app.get("/users/presence", { preHandler: [requireAuth] }, async (req, reply) => {
    const { userIds } = req.query as { userIds?: string };
    if (!userIds) return reply.send({});

    const ids = userIds.split(",").filter(Boolean);
    const result: Record<string, boolean> = {};

    await Promise.all(
      ids.map(async (id) => {
        const val = await redis.get(`presence:${id}`);
        result[id] = val === "online";
      })
    );

    return reply.send(result);
  });

  app.patch("/contacts/:contactId/block", { preHandler: [requireAuth] }, async (req, reply) => {
    const { contactId } = req.params as { contactId: string };
    const { blocked } = req.body as { blocked: boolean };

    await db
      .update(contacts)
      .set({ blocked })
      .where(and(eq(contacts.userId, req.userId), eq(contacts.contactId, contactId)));

    return reply.send({ ok: true });
  });
}
