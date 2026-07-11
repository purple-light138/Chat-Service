import { create } from "zustand";
import type { Conversation, GroupMember, Message, MessageStatus } from "@chat/shared";

interface ChatStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  setConversations: (convs: Conversation[]) => void;
  addConversation: (conv: Conversation) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (conversationId: string, msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  updateMessageStatus: (messageId: string, status: MessageStatus) => void;
  removeConversation: (id: string) => void;
  updateGroupName: (conversationId: string, name: string) => void;
  addGroupMember: (conversationId: string, member: GroupMember) => void;
  removeGroupMember: (conversationId: string, userId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  setConversations: (conversations) => set({ conversations }),
  addConversation: (conv) =>
    set((s) => ({ conversations: [conv, ...s.conversations] })),
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
  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    })),
  updateGroupName: (conversationId, name) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId && c.type === "group" && c.group
          ? { ...c, group: { ...c.group, name } }
          : c
      ),
    })),
  addGroupMember: (conversationId, member) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId && c.type === "group" && c.group
          ? {
              ...c,
              group: {
                ...c.group,
                memberCount: c.group.memberCount + 1,
                members: [...(c.group.members ?? []), member],
              },
            }
          : c
      ),
    })),
  removeGroupMember: (conversationId, userId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId && c.type === "group" && c.group
          ? {
              ...c,
              group: {
                ...c.group,
                memberCount: Math.max(0, c.group.memberCount - 1),
                members: (c.group.members ?? []).filter((m) => m.userId !== userId),
              },
            }
          : c
      ),
    })),
}));
