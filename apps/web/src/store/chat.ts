import { create } from "zustand";
import type { Conversation, Message, MessageStatus } from "@chat/shared";

interface ChatStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  setConversations: (convs: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (conversationId: string, msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  updateMessageStatus: (messageId: string, status: MessageStatus) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (activeConversationId) => set({ activeConversationId }),
  setMessages: (conversationId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [conversationId]: msgs } })),
  appendMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.conversationId] ?? [];
      return {
        messages: { ...s.messages, [msg.conversationId]: [...existing, msg] },
        conversations: s.conversations.map((c) =>
          c.id === msg.conversationId ? { ...c, lastMessage: msg } : c
        ),
      };
    }),
  updateMessageStatus: (messageId, status) =>
    set((s) => {
      const updated: Record<string, Message[]> = {};
      for (const [convId, msgs] of Object.entries(s.messages)) {
        updated[convId] = msgs.map((m) => (m.id === messageId ? { ...m, status } : m));
      }
      return { messages: updated };
    }),
}));
