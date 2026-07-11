import type { Message, SendMessagePayload } from "./message";
import type { GroupMember } from "./conversation";

export interface ServerToClientEvents {
  "message:new": (message: Message) => void;
  "message:status": (data: { messageId: string; status: "delivered" | "read" }) => void;
  "user:online": (userId: string) => void;
  "user:offline": (userId: string, lastSeen: string) => void;
  "typing:start": (data: { conversationId: string; userId: string }) => void;
  "typing:stop": (data: { conversationId: string; userId: string }) => void;
  "group:memberAdded": (data: { conversationId: string; member: GroupMember }) => void;
  "group:memberRemoved": (data: { conversationId: string; userId: string }) => void;
  "group:updated": (data: { conversationId: string; name: string }) => void;
  "group:deleted": (data: { conversationId: string }) => void;
}

export interface ClientToServerEvents {
  "message:send": (payload: SendMessagePayload, ack: (message: Message) => void) => void;
  "message:delivered": (messageId: string) => void;
  "message:read": (conversationId: string) => void;
  "typing:start": (conversationId: string) => void;
  "typing:stop": (conversationId: string) => void;
  "conversation:join": (conversationId: string) => void;
  "conversation:leave": (conversationId: string) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}
