import type { Message, SendMessagePayload } from "./message";
import type { GroupMember } from "./conversation";

export interface SdpData { type: string; sdp: string; }
export interface IceCandidateData { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null; }

export interface ServerToClientEvents {
  "message:new": (message: Message) => void;
  "message:status": (data: { messageId: string; status: "delivered" | "read" }) => void;
  "message:edited": (data: { messageId: string; content: string; conversationId: string }) => void;
  "message:deleted": (data: { messageId: string; conversationId: string; forEveryone: boolean }) => void;
  "message:pinned": (data: { conversationId: string; pinnedMessage: Message | null }) => void;
  "user:online": (userId: string) => void;
  "user:offline": (userId: string, lastSeen: string) => void;
  "typing:start": (data: { conversationId: string; userId: string }) => void;
  "typing:stop": (data: { conversationId: string; userId: string }) => void;
  "group:memberAdded": (data: { conversationId: string; member: GroupMember }) => void;
  "group:memberRemoved": (data: { conversationId: string; userId: string }) => void;
  "group:updated": (data: { conversationId: string; name: string }) => void;
  "group:deleted": (data: { conversationId: string }) => void;
  // Call signaling
  "call:invite": (data: { callId: string; conversationId: string; callerId: string; callerName: string; type: "audio" | "video" }) => void;
  "call:join": (data: { callId: string; userId: string; userName: string }) => void;
  "call:leave": (data: { callId: string; userId: string }) => void;
  "call:offer": (data: { callId: string; from: string; sdp: SdpData }) => void;
  "call:answer": (data: { callId: string; from: string; sdp: SdpData }) => void;
  "call:ice": (data: { callId: string; from: string; candidate: IceCandidateData }) => void;
  "call:rejected": (data: { callId: string; userId: string }) => void;
  "call:ended": (data: { callId: string }) => void;
}

export interface ClientToServerEvents {
  "message:send": (payload: SendMessagePayload, ack: (message: Message) => void) => void;
  "message:delivered": (messageId: string) => void;
  "message:read": (conversationId: string) => void;
  "typing:start": (conversationId: string) => void;
  "typing:stop": (conversationId: string) => void;
  "conversation:join": (conversationId: string) => void;
  "conversation:leave": (conversationId: string) => void;
  // Call signaling
  "call:invite": (data: { conversationId: string; type: "audio" | "video" }, ack: (res: { callId: string }) => void) => void;
  "call:join": (data: { callId: string }, ack: (res: { participants: { userId: string; userName: string }[] }) => void) => void;
  "call:leave": (data: { callId: string }) => void;
  "call:offer": (data: { callId: string; to: string; sdp: SdpData }) => void;
  "call:answer": (data: { callId: string; to: string; sdp: SdpData }) => void;
  "call:ice": (data: { callId: string; to: string; candidate: IceCandidateData }) => void;
  "call:reject": (data: { callId: string }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}
