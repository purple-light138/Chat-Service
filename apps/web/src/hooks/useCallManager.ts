import { useEffect, useRef, useCallback } from "react";
import { socket } from "@/lib/socket";
import { useSession } from "@/lib/auth-client";
import { useCallStore } from "@/store/call";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Free TURN relay for symmetric NAT / cross-network calls
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

export function useCallManager() {
  const { data: session } = useSession();
  const store = useCallStore();
  const peerConns = useRef(new Map<string, RTCPeerConnection>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceBuf = useRef(new Map<string, RTCIceCandidateInit[]>());
  const callIdRef = useRef<string | null>(null);

  useEffect(() => { callIdRef.current = store.callId; }, [store.callId]);

  async function getMedia(type: "audio" | "video") {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    localStreamRef.current = stream;
    store.setLocalStream(stream);
    return stream;
  }

  function createPC(remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const remoteStream = new MediaStream();

    for (const track of (localStreamRef.current?.getTracks() ?? [])) {
      pc.addTrack(track, localStreamRef.current!);
    }

    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
      store.updateParticipantStream(remoteUserId, remoteStream);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        (socket as any).emit("call:ice", {
          callId: callIdRef.current,
          to: remoteUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        store.removeParticipant(remoteUserId);
        peerConns.current.delete(remoteUserId);
      }
    };

    peerConns.current.set(remoteUserId, pc);
    return pc;
  }

  async function drainIceBuf(userId: string, pc: RTCPeerConnection) {
    const buf = iceBuf.current.get(userId) ?? [];
    for (const c of buf) await pc.addIceCandidate(c).catch(() => {});
    iceBuf.current.delete(userId);
  }

  function cleanup() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peerConns.current.forEach((pc) => pc.close());
    peerConns.current.clear();
    iceBuf.current.clear();
    store.reset();
  }

  const startCall = useCallback(async (conversationId: string, type: "audio" | "video") => {
    try {
      await getMedia(type);
    } catch {
      alert("Camera/microphone permission denied");
      return;
    }
    (socket as any).emit("call:invite", { conversationId, type }, (res: { callId: string }) => {
      store.setOutgoing(res.callId, conversationId, type);
    });
  }, []);

  const acceptCall = useCallback(async () => {
    const { callId, type } = store;
    if (!callId) return;
    try {
      await getMedia(type);
    } catch {
      alert("Camera/microphone permission denied");
      rejectCall();
      return;
    }
    (socket as any).emit("call:join", { callId }, async (res: { participants: { userId: string; userName: string }[] }) => {
      store.setConnected();
      for (const p of res.participants) {
        if (p.userId === session?.user.id) continue;
        store.addParticipant({ userId: p.userId, userName: p.userName, stream: null });
        const pc = createPC(p.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        (socket as any).emit("call:offer", { callId, to: p.userId, sdp: { type: offer.type, sdp: offer.sdp } });
        await drainIceBuf(p.userId, pc);
      }
    });
  }, [session, store.callId, store.type]);

  const rejectCall = useCallback(() => {
    const { callId } = store;
    if (callId) (socket as any).emit("call:reject", { callId });
    store.reset();
  }, [store.callId]);

  const endCall = useCallback(() => {
    const callId = callIdRef.current;
    if (callId) (socket as any).emit("call:leave", { callId });
    cleanup();
  }, []);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; store.toggleMute(); }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; store.toggleCamera(); }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const { isScreenSharing } = useCallStore.getState();
    if (isScreenSharing) {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
      if (!camStream) return;
      const camTrack = camStream.getVideoTracks()[0];
      for (const pc of peerConns.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(camTrack).catch(() => {});
      }
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => { t.stop(); localStreamRef.current!.removeTrack(t); });
        localStreamRef.current.addTrack(camTrack);
        store.setLocalStream(new MediaStream([...localStreamRef.current.getTracks()]));
      }
      store.toggleScreenShare();
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true }).catch(() => null);
      if (!screenStream) return;
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.onended = () => { if (useCallStore.getState().isScreenSharing) toggleScreenShare(); };
      for (const pc of peerConns.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack).catch(() => {});
      }
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => { t.stop(); localStreamRef.current!.removeTrack(t); });
        localStreamRef.current.addTrack(screenTrack);
        store.setLocalStream(new MediaStream([...localStreamRef.current.getTracks()]));
      }
      store.toggleScreenShare();
    }
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!session) return;

    const onInvite = (data: { callId: string; conversationId: string; callerId: string; callerName: string; type: "audio" | "video" }) => {
      if (useCallStore.getState().status !== "idle") return;
      store.setIncoming(data.callId, data.conversationId, data.callerId, data.callerName, data.type);
    };

    const onJoin = (data: { callId: string; userId: string; userName: string }) => {
      if (callIdRef.current !== data.callId) return;
      store.addParticipant({ userId: data.userId, userName: data.userName, stream: null });
      store.setConnected();
    };

    const onOffer = async (data: { callId: string; from: string; sdp: { type: string; sdp: string } }) => {
      if (callIdRef.current !== data.callId) return;
      let pc = peerConns.current.get(data.from);
      if (!pc) pc = createPC(data.from);
      await pc.setRemoteDescription({ type: data.sdp.type as RTCSdpType, sdp: data.sdp.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      (socket as any).emit("call:answer", { callId: data.callId, to: data.from, sdp: { type: answer.type, sdp: answer.sdp } });
      store.setConnected();
      await drainIceBuf(data.from, pc);
    };

    const onAnswer = async (data: { callId: string; from: string; sdp: { type: string; sdp: string } }) => {
      const pc = peerConns.current.get(data.from);
      if (!pc) return;
      await pc.setRemoteDescription({ type: data.sdp.type as RTCSdpType, sdp: data.sdp.sdp });
      await drainIceBuf(data.from, pc);
    };

    const onIce = async (data: { callId: string; from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConns.current.get(data.from);
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(data.candidate).catch(() => {});
      } else {
        const buf = iceBuf.current.get(data.from) ?? [];
        buf.push(data.candidate);
        iceBuf.current.set(data.from, buf);
      }
    };

    const onLeave = (data: { callId: string; userId: string }) => {
      if (callIdRef.current !== data.callId) return;
      const pc = peerConns.current.get(data.userId);
      if (pc) { pc.close(); peerConns.current.delete(data.userId); }
      store.removeParticipant(data.userId);
    };

    const onEnded = () => cleanup();
    const onRejected = (data: { callId: string }) => {
      if (callIdRef.current === data.callId) cleanup();
    };

    (socket as any).on("call:invite", onInvite);
    (socket as any).on("call:join", onJoin);
    (socket as any).on("call:offer", onOffer);
    (socket as any).on("call:answer", onAnswer);
    (socket as any).on("call:ice", onIce);
    (socket as any).on("call:leave", onLeave);
    (socket as any).on("call:ended", onEnded);
    (socket as any).on("call:rejected", onRejected);

    return () => {
      (socket as any).off("call:invite", onInvite);
      (socket as any).off("call:join", onJoin);
      (socket as any).off("call:offer", onOffer);
      (socket as any).off("call:answer", onAnswer);
      (socket as any).off("call:ice", onIce);
      (socket as any).off("call:leave", onLeave);
      (socket as any).off("call:ended", onEnded);
      (socket as any).off("call:rejected", onRejected);
    };
  }, [session]);

  return { startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, toggleScreenShare };
}
