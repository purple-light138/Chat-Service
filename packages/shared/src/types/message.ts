export type MessageType = "text" | "emoji" | "image" | "pdf" | "video" | "audio";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  status: MessageStatus;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessagePayload {
  conversationId: string;
  type: MessageType;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}
