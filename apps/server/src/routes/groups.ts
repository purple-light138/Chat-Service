import type { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations, groups, groupMembers, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import type { Server } from "socket.io";

export async function groupRoutes(app: FastifyInstance, opts: { io: Server }) {
  const { io } = opts;

  // Create a group
  app.post("/groups", { preHandler: [requireAuth] }, async (req, reply) => {
    const { name, memberIds } = req.body as { name: string; memberIds: string[] };
    if (!name?.trim()) return reply.status(400).send({ error: "Group name is required" });
    if (!memberIds?.length) return reply.status(400).send({ error: "Select at least one member" });

    const convId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const now = new Date();

    await db.insert(conversations).values({ id: convId, type: "group", participantA: req.userId });
    await db.insert(groups).values({ id: groupId, conversationId: convId, name: name.trim(), createdBy: req.userId, createdAt: now, updatedAt: now });

    // Add creator as admin + all selected members
    const uniqueIds = [...new Set([req.userId, ...memberIds])];
    await db.insert(groupMembers).values(
      uniqueIds.map((uid) => ({
        id: crypto.randomUUID(),
        groupId,
        userId: uid,
        role: uid === req.userId ? ("admin" as const) : ("member" as const),
        joinedAt: now,
      }))
    );

    const group = await buildGroupConversation(convId, req.userId);

    // Put all members in the socket room
    for (const uid of uniqueIds) {
      io.to(`user:${uid}`).socketsJoin(`conversation:${convId}`);
    }

    return reply.status(201).send(group);
  });

  // Get group details (members list)
  app.get("/groups/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const group = await buildGroupConversation(id, req.userId);
    if (!group) return reply.status(404).send({ error: "Group not found" });
    return reply.send(group);
  });

  // Update group name
  app.patch("/groups/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = req.body as { name: string };

    const [membership] = await db.select().from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groups.conversationId, id), eq(groupMembers.userId, req.userId)))
      .limit(1);

    if (!membership || membership.group_members.role !== "admin")
      return reply.status(403).send({ error: "Admin only" });

    await db.update(groups).set({ name: name.trim(), updatedAt: new Date() }).where(eq(groups.conversationId, id));
    io.to(`conversation:${id}`).emit("group:updated", { conversationId: id, name: name.trim() });
    return reply.send({ ok: true });
  });

  // Add member (admin only)
  app.post("/groups/:id/members", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { userId } = req.body as { userId: string };

    const [membership] = await db.select().from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groups.conversationId, id), eq(groupMembers.userId, req.userId)))
      .limit(1);

    if (!membership || membership.group_members.role !== "admin")
      return reply.status(403).send({ error: "Admin only" });

    const [existing] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, membership.groups.id), eq(groupMembers.userId, userId)))
      .limit(1);
    if (existing) return reply.status(409).send({ error: "Already a member" });

    const [newMember] = await db.insert(groupMembers).values({
      id: crypto.randomUUID(), groupId: membership.groups.id, userId, role: "member", joinedAt: new Date(),
    }).returning();

    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, image: users.image, status: users.status, lastSeen: users.lastSeen }).from(users).where(eq(users.id, userId)).limit(1);

    const memberPayload = { id: newMember.id, userId, user, role: newMember.role, joinedAt: newMember.joinedAt.toISOString() };
    io.to(`conversation:${id}`).emit("group:memberAdded", { conversationId: id, member: memberPayload });
    io.to(`user:${userId}`).socketsJoin(`conversation:${id}`);
    return reply.status(201).send(memberPayload);
  });

  // Remove member (admin only, can't remove other admins)
  app.delete("/groups/:id/members/:userId", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };

    const [membership] = await db.select().from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groups.conversationId, id), eq(groupMembers.userId, req.userId)))
      .limit(1);

    if (!membership || membership.group_members.role !== "admin")
      return reply.status(403).send({ error: "Admin only" });

    const [target] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, membership.groups.id), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!target) return reply.status(404).send({ error: "Member not found" });
    if (target.role === "admin" && userId !== req.userId)
      return reply.status(403).send({ error: "Cannot remove another admin" });

    await db.delete(groupMembers).where(eq(groupMembers.id, target.id));
    io.to(`conversation:${id}`).emit("group:memberRemoved", { conversationId: id, userId });
    io.to(`user:${userId}`).socketsLeave(`conversation:${id}`);
    return reply.send({ ok: true });
  });

  // Leave group
  app.post("/groups/:id/leave", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [membership] = await db.select().from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groups.conversationId, id), eq(groupMembers.userId, req.userId)))
      .limit(1);

    if (!membership) return reply.status(404).send({ error: "Not a member" });

    await db.delete(groupMembers).where(eq(groupMembers.id, membership.group_members.id));
    io.to(`conversation:${id}`).emit("group:memberRemoved", { conversationId: id, userId: req.userId });
    io.to(`user:${req.userId}`).socketsLeave(`conversation:${id}`);

    // If no admins left and members remain, promote oldest member
    const remaining = await db.select().from(groupMembers).where(eq(groupMembers.groupId, membership.groups.id));
    if (remaining.length > 0 && !remaining.some((m) => m.role === "admin")) {
      await db.update(groupMembers).set({ role: "admin" }).where(eq(groupMembers.id, remaining[0].id));
    }

    return reply.send({ ok: true });
  });

  // Delete group (admin only)
  app.delete("/groups/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [membership] = await db.select().from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groups.conversationId, id), eq(groupMembers.userId, req.userId)))
      .limit(1);

    if (!membership || membership.group_members.role !== "admin")
      return reply.status(403).send({ error: "Admin only" });

    io.to(`conversation:${id}`).emit("group:deleted", { conversationId: id });
    // Cascade deletes group_members, messages via FK
    await db.delete(conversations).where(eq(conversations.id, id));
    return reply.send({ ok: true });
  });
}

async function buildGroupConversation(conversationId: string, requestingUserId: string) {
  const [group] = await db.select().from(groups).where(eq(groups.conversationId, conversationId)).limit(1);
  if (!group) return null;

  const [myMembership] = await db.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, requestingUserId)))
    .limit(1);
  if (!myMembership) return null;

  const memberRows = await db.select({
    id: groupMembers.id, userId: groupMembers.userId, role: groupMembers.role, joinedAt: groupMembers.joinedAt,
    userName: users.name, userEmail: users.email, userImage: users.image, userStatus: users.status, userLastSeen: users.lastSeen,
  }).from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId)).where(eq(groupMembers.groupId, group.id));

  const members = memberRows.map((m) => ({
    id: m.id,
    userId: m.userId,
    user: { id: m.userId, name: m.userName, email: m.userEmail, image: m.userImage, status: m.userStatus, lastSeen: m.userLastSeen },
    role: m.role,
    joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : m.joinedAt,
  }));

  return {
    conversationId,
    group: {
      id: group.id,
      name: group.name,
      iconUrl: group.iconUrl,
      createdBy: group.createdBy,
      memberCount: members.length,
      members,
      myRole: myMembership.role,
    },
  };
}
