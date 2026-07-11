import type { PublicUser } from "./user";
import type { Message } from "./message";

export interface Conversation {
  id: string;
  participant: PublicUser;
  lastMessage: Message | null;
  unreadCount: number;
  createdAt: string;
}
