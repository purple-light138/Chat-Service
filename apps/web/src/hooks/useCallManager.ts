import { useEffect, useRef, useCallback } from "react";
import { socket } from "@/lib/socket";
import { useSession } from "@/lib/auth-client";
import { useCallStore } from "@/store/call";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

const log = (...args: any[]) => console.log("[WebRTC]", ...args);

export function useCallManager() {
  const { data: session } = useSession();
  const store = useCallStore();
  const peerConns = useRef(new Map<string, RTCPeerConnection>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceBuf = useRef(new Map<string, RTCIceCandidateInit[]>());
  const callIdRef = useRef<string | null>(null);
  // Audio elements managed imperatively — bypasses React rendering for reliable playback
  const audioEls = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => { callIdRef.current = store.callId; }, [store.callId]);

  async function getMedia(type: "audio" | "video") {
    log("getMedia", type);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    log("local stream tracks:", stream.getTracks().map(t => t.kind));
    localStreamRef.current = stream;
    store.setLocalStream(stream);
    return stream;
  }

  function ensureAudioEl(remoteUserId: string): HTMLAudioElement {
    let el = audioEls.current.get(remoteUserId);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      document.body.appendChild(el);
      audioEls.current.set(remoteUserId, el);
      log("created audio element for", remoteUserId);
    }
    return el;
  }

  function createPC(remoteUserId: string): RTCPeerConnection {
    log("createPC for", remoteUserId, "local tracks:", localStreamRef.current?.getTracks().map(t => t.kind));
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const remoteVideoStream = new MediaStream();

    for (const track of (localStreamRef.current?.getTracks() ?? [])) {
      pc.addTrack(track, localStreamRef.current!);
      log("added local track", track.kind);
    }

    pc.ontrack = (e) => {
      log("ontrack fired:", e.track.kind, "streams:", e.streams.length);
      const track = e.track;

      if (track.kind === "audio") {
        // Imperatively attach audio to a DOM element — never relies on React re-render
        const el = ensureAudioEl(remoteUserId);
        if (!el.srcObject) el.srcObject = new MediaStream();
        (el.srcObject as MediaStream).addTrack(track);
        log("audio track attached to DOM element");
      } else {
        remoteVideoStream.addTrack(track);
        // Create a new stream reference so React's useEffect re-runs in VideoTile
        store.updateParticipantStream(remoteUserId, new MediaStream(remoteVideoStream.getTracks()));
        log("video track passed to store");
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        log("sending ICE candidate to", remoteUserId);
        (socket as any).emit("call:ice", {
          callId: callIdRef.current,
          to: remoteUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      log("ICE state →", pc.iceConnectionState, "for", remoteUserId);
    };

    pc.onconnectionstatechange = () => {
      log("connection state →", pc.connectionState, "for", remoteUserId);
      if (pc.connectionState === "connected") {
        store.setConnected();
      } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        store.removeParticipant(remoteUserId);
        peerConns.current.delete(remoteUserId);
        const el = audioEls.current.get(remoteUserId);
        if (el) { el.srcObject = null; el.remove(); audioEls.current.delete(remoteUserId); }
      }
    };

    peerConns.current.set(remoteUserId, pc);
    return pc;
  }

  async function drainIceBuf(userId: string, pc: RTCPeerConnection) {
    const buf = iceBuf.current.get(userId) ?? [];
    if (buf.length) log("draining", buf.length, "buffered ICE candidates for", userId);
    for (const c of buf) await pc.addIceCandidate(c).catch((e) => log("addIceCandidate error", e));
    iceBuf.current.delete(userId);
  }

  function cleanup() {
    log("cleanup");
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peerConns.current.forEach((pc) => pc.close());
    peerConns.current.clear();
    iceBuf.current.clear();
    audioEls.current.forEach((el) => { el.srcObject = null; el.remove(); });
    audioEls.current.clear();
    store.reset();
  }

  const startCall = useCallback(async (conversationId: string, type: "audio" | "video") => {
    log("startCall", type, conversationId);
    try {
      await getMedia(type);
    } catch (err) {
      log("getMedia failed", err);
      alert("Camera/microphone permission denied");
      return;
    }
    (socket as any).emit("call:invite", { conversationId, type }, (res: { callId: string }) => {
      log("call:invite ack, callId:", res.callId);
      callIdRef.current = res.callId; // Set immediately, don't wait for useEffect
      store.setOutgoing(res.callId, conversationId, type);
    });
  }, []);

  const acceptCall = useCallback(async () => {
    const { callId, type } = store;
    log("acceptCall, callId:", callId, type);
    if (!callId) return;
    try {
      await getMedia(type);
    } catch (err) {
      log("getMedia failed", err);
      alert("Camera/microphone permission denied");
      rejectCall();
      return;
    }
    callIdRef.current = callId; // Set immediately
    (socket as any).emit("call:join", { callId }, async (res: { participants: { userId: string; userName: string }[] }) => {
      log("call:join ack, participants:", res.participants.map(p => p.userId));
      store.setConnected();
      for (const p of res.participants) {
        if (p.userId === session?.user.id) continue;
        store.addParticipant({ userId: p.userId, userName: p.userName, stream: null });
        const pc = createPC(p.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        log("sending offer to", p.userId);
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
      log("call:invite received from", data.callerName, data.type);
      if (useCallStore.getState().status !== "idle") return;
      store.setIncoming(data.callId, data.conversationId, data.callerId, data.callerName, data.type);
    };

    const onJoin = (data: { callId: string; userId: string; userName: string }) => {
      log("call:join event", data.userId);
      if (callIdRef.current !== data.callId) { log("callId mismatch, ignoring"); return; }
      store.addParticipant({ userId: data.userId, userName: data.userName, stream: null });
      store.setConnected();
    };

    const onOffer = async (data: { callId: string; from: string; sdp: { type: string; sdp: string } }) => {
      log("call:offer from", data.from, "callIdRef:", callIdRef.current, "dataCallId:", data.callId);
      if (callIdRef.current !== data.callId) { log("callId mismatch, ignoring offer"); return; }
      let pc = peerConns.current.get(data.from);
      if (!pc) pc = createPC(data.from);
      await pc.setRemoteDescription({ type: data.sdp.type as RTCSdpType, sdp: data.sdp.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("sending answer to", data.from);
      (socket as any).emit("call:answer", { callId: data.callId, to: data.from, sdp: { type: answer.type, sdp: answer.sdp } });
      store.setConnected();
      await drainIceBuf(data.from, pc);
    };

    const onAnswer = async (data: { callId: string; from: string; sdp: { type: string; sdp: string } }) => {
      log("call:answer from", data.from);
      const pc = peerConns.current.get(data.from);
      if (!pc) { log("no PC found for", data.from); return; }
      await pc.setRemoteDescription({ type: data.sdp.type as RTCSdpType, sdp: data.sdp.sdp });
      await drainIceBuf(data.from, pc);
    };

    const onIce = async (data: { callId: string; from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConns.current.get(data.from);
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(data.candidate).catch((e) => log("addIceCandidate error", e));
      } else {
        const buf = iceBuf.current.get(data.from) ?? [];
        buf.push(data.candidate);
        iceBuf.current.set(data.from, buf);
      }
    };

    const onLeave = (data: { callId: string; userId: string }) => {
      log("call:leave", data.userId);
      if (callIdRef.current !== data.callId) return;
      const pc = peerConns.current.get(data.userId);
      if (pc) { pc.close(); peerConns.current.delete(data.userId); }
      store.removeParticipant(data.userId);
      const el = audioEls.current.get(data.userId);
      if (el) { el.srcObject = null; el.remove(); audioEls.current.delete(data.userId); }
    };

    const onEnded = () => { log("call:ended"); cleanup(); };
    const onRejected = (data: { callId: string }) => {
      log("call:rejected");
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
