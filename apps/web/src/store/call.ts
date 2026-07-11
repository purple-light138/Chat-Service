import { create } from "zustand";

export interface RemoteParticipant {
  userId: string;
  userName: string;
  stream: MediaStream | null;
}

export type CallStatus = "idle" | "incoming" | "outgoing" | "connected";

interface CallStore {
  callId: string | null;
  conversationId: string | null;
  type: "audio" | "video";
  status: CallStatus;
  callerId: string | null;
  callerName: string | null;
  participants: RemoteParticipant[];
  localStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;

  setIncoming: (callId: string, conversationId: string, callerId: string, callerName: string, type: "audio" | "video") => void;
  setOutgoing: (callId: string, conversationId: string, type: "audio" | "video") => void;
  setConnected: () => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addParticipant: (p: RemoteParticipant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantStream: (userId: string, stream: MediaStream) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  reset: () => void;
}

const IDLE = {
  callId: null, conversationId: null, type: "video" as const, status: "idle" as const,
  callerId: null, callerName: null, participants: [], localStream: null,
  isMuted: false, isCameraOff: false, isScreenSharing: false,
};

export const useCallStore = create<CallStore>((set) => ({
  ...IDLE,
  setIncoming: (callId, conversationId, callerId, callerName, type) =>
    set({ callId, conversationId, callerId, callerName, type, status: "incoming" }),
  setOutgoing: (callId, conversationId, type) =>
    set({ callId, conversationId, type, status: "outgoing" }),
  setConnected: () => set({ status: "connected" }),
  setLocalStream: (localStream) => set({ localStream }),
  addParticipant: (p) =>
    set((s) => ({
      participants: s.participants.some((x) => x.userId === p.userId)
        ? s.participants
        : [...s.participants, p],
    })),
  removeParticipant: (userId) =>
    set((s) => ({ participants: s.participants.filter((p) => p.userId !== userId) })),
  updateParticipantStream: (userId, stream) =>
    set((s) => ({
      participants: s.participants.map((p) => (p.userId === userId ? { ...p, stream } : p)),
    })),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleCamera: () => set((s) => ({ isCameraOff: !s.isCameraOff })),
  toggleScreenShare: () => set((s) => ({ isScreenSharing: !s.isScreenSharing })),
  reset: () => set(IDLE),
}));
