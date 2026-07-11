export type MessageType = "text" | "emoji" | "image" | "pdf" | "video" | "audio";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ReplyPreview {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  type: MessageType;
}

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
  replyToId?: string | null;
  replyTo?: ReplyPreview | null;
  edited?: boolean;
  isDeleted?: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
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
  replyToId?: string;
}
