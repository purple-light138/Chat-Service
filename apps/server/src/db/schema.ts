import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["available", "busy"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  status: userStatusEnum("status").notNull().default("available"),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationTypeEnum = pgEnum("conversation_type", ["direct", "group"]);

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  type: conversationTypeEnum("type").notNull().default("direct"),
  participantA: text("participant_a").notNull().references(() => users.id, { onDelete: "cascade" }),
  // null for group conversations
  participantB: text("participant_b").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMemberRoleEnum = pgEnum("group_member_role", ["admin", "member"]);

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().unique().references(() => conversations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  iconUrl: text("icon_url"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: groupMemberRoleEnum("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageTypeEnum = pgEnum("message_type", ["text", "emoji", "image", "pdf", "video", "audio"]);
export const messageStatusEnum = pgEnum("message_status", ["sent", "delivered", "read"]);

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: messageTypeEnum("type").notNull().default("text"),
  content: text("content").notNull(),
  status: messageStatusEnum("status").notNull().default("sent"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileSize: text("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
