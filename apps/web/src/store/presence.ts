import { create } from "zustand";

interface PresenceStore {
  online: Set<string>;
  typing: Record<string, Set<string>>;
  setOnline: (userId: string) => void;
  setOffline: (userId: string) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  initPresence: (presenceMap: Record<string, boolean>) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  online: new Set(),
  typing: {},

  initPresence: (presenceMap) =>
    set(() => {
      const online = new Set<string>();
      for (const [id, isOnline] of Object.entries(presenceMap)) {
        if (isOnline) online.add(id);
      }
      return { online };
    }),

  setOnline: (userId) =>
    set((s) => ({ online: new Set([...s.online, userId]) })),

  setOffline: (userId) =>
    set((s) => {
      const online = new Set(s.online);
      online.delete(userId);
      return { online };
    }),

  setTyping: (conversationId, userId, isTyping) =>
    set((s) => {
      const prev = s.typing[conversationId] ?? new Set<string>();
      const next = new Set(prev);
      isTyping ? next.add(userId) : next.delete(userId);
      return { typing: { ...s.typing, [conversationId]: next } };
    }),
}));
