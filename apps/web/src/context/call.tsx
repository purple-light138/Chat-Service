import { createContext, useContext } from "react";

export interface CallActions {
  startCall: (conversationId: string, type: "audio" | "video") => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
}

const noop = async () => {};
const noopSync = () => {};

export const CallContext = createContext<CallActions>({
  startCall: noop,
  acceptCall: noop,
  rejectCall: noopSync,
  endCall: noopSync,
  toggleMute: noopSync,
  toggleCamera: noopSync,
  toggleScreenShare: noop,
});

export function useCallContext() {
  return useContext(CallContext);
}
