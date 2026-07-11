import type { PublicUser } from "./user";
import type { Message } from "./message";

export interface GroupMember {
  id: string;
  userId: string;
  user: PublicUser;
  role: "admin" | "member";
  joinedAt: string;
}

export interface GroupInfo {
  id: string;
  name: string;
  iconUrl?: string | null;
  createdBy: string;
  memberCount: number;
  members?: GroupMember[];
  myRole?: "admin" | "member";
}

export interface Conversation {
  id: string;
  type: "direct" | "group";
  // direct conversations
  participant?: PublicUser;
  // group conversations
  group?: GroupInfo;
  lastMessage: Message | null;
  unreadCount: number;
  createdAt: string;
}
