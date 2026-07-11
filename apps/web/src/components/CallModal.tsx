import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallStore } from "@/store/call";
import { useSession } from "@/lib/auth-client";
import type { RemoteParticipant } from "@/store/call";

interface Props {
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => Promise<void>;
}

// Plays audio from a remote stream (used for audio-only calls and as fallback)
function AudioPlayer({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

function VideoTile({ stream, name, muted, small }: { stream: MediaStream | null; name: string; muted?: boolean; small?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className={cn("relative rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center", small ? "w-32 h-24 shadow-lg" : "flex-1 min-h-[180px]")}>
      <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
          <div className="w-16 h-16 rounded-full bg-gray-500 flex items-center justify-center text-2xl font-bold text-white">
            {name[0]?.toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-white text-xs font-medium bg-black/50 rounded-md px-2 py-0.5 backdrop-blur-sm">
        {name}
      </div>
    </div>
  );
}

function ControlBtn({ onClick, active, danger, icon: Icon, title }: { onClick: () => void; active?: boolean; danger?: boolean; icon: any; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
        danger ? "bg-red-500 hover:bg-red-600 text-white"
          : active ? "bg-white text-gray-900 hover:bg-gray-200"
          : "bg-gray-700 hover:bg-gray-600 text-white"
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function AudioAvatar({ participant }: { participant: RemoteParticipant }) {
  return (
    <>
      {/* Hidden audio element so the remote voice actually plays */}
      <AudioPlayer stream={participant.stream} />
      <div className="flex flex-col items-center gap-2">
        <div className="w-20 h-20 rounded-full bg-gray-600 flex items-center justify-center text-3xl font-bold text-white">
          {participant.userName[0]?.toUpperCase()}
        </div>
        <span className="text-white text-sm">{participant.userName}</span>
      </div>
    </>
  );
}

export default function CallModal({ onEnd, onToggleMute, onToggleCamera, onToggleScreenShare }: Props) {
  const store = useCallStore();
  const { data: session } = useSession();
  const myName = session?.user.name ?? "You";

  if (store.status === "idle" || store.status === "incoming") return null;

  const isAudio = store.type === "audio";
  const isOutgoing = store.status === "outgoing";

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col select-none">
      {/* Status */}
      <div className="shrink-0 px-6 pt-6 pb-2 text-center">
        {isOutgoing && store.participants.length === 0 ? (
          <p className="text-gray-400 text-sm animate-pulse">Calling…</p>
        ) : (
          <p className="text-green-400 text-sm">Connected</p>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 relative flex flex-col gap-2 p-4 overflow-hidden">
        {isAudio ? (
          // Audio call: avatars + hidden audio players
          <div className="flex-1 flex flex-wrap gap-6 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className={cn("w-20 h-20 rounded-full bg-primary/30 flex items-center justify-center text-3xl font-bold text-white", store.isMuted && "opacity-50")}>
                {myName[0]?.toUpperCase()}
              </div>
              <span className="text-white text-sm">{myName} (you)</span>
            </div>
            {store.participants.map((p) => (
              <AudioAvatar key={p.userId} participant={p} />
            ))}
          </div>
        ) : store.participants.length === 0 ? (
          // Video: waiting for other party
          <>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center text-4xl font-bold text-white">
                  {myName[0]?.toUpperCase()}
                </div>
                <p className="text-gray-300 text-lg">{isOutgoing ? "Waiting for answer…" : "Connecting…"}</p>
              </div>
            </div>
            <div className="absolute bottom-4 right-4">
              <VideoTile stream={store.localStream} name="You" muted small />
            </div>
          </>
        ) : store.participants.length === 1 ? (
          // 1-to-1 video
          <>
            <VideoTile stream={store.participants[0].stream} name={store.participants[0].userName} />
            <div className="absolute bottom-4 right-4">
              <VideoTile stream={store.localStream} name="You" muted small />
            </div>
          </>
        ) : (
          // Group video grid
          <div className={cn("flex-1 grid gap-2", store.participants.length <= 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2")}>
            <VideoTile stream={store.localStream} name={`${myName} (you)`} muted />
            {store.participants.map((p) => (
              <VideoTile key={p.userId} stream={p.stream} name={p.userName} />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 pb-8 flex items-center justify-center gap-4 bg-gray-900/90">
        <ControlBtn onClick={onToggleMute} active={store.isMuted} icon={store.isMuted ? MicOff : Mic} title={store.isMuted ? "Unmute" : "Mute"} />
        {!isAudio && (
          <>
            <ControlBtn onClick={onToggleCamera} active={store.isCameraOff} icon={store.isCameraOff ? VideoOff : Video} title={store.isCameraOff ? "Turn on camera" : "Turn off camera"} />
            <ControlBtn onClick={onToggleScreenShare} active={store.isScreenSharing} icon={Monitor} title={store.isScreenSharing ? "Stop sharing" : "Share screen"} />
          </>
        )}
        <ControlBtn onClick={onEnd} danger icon={PhoneOff} title="End call" />
      </div>
    </div>
  );
}
