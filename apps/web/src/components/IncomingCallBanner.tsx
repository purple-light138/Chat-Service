import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useCallStore } from "@/store/call";

interface Props {
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallBanner({ onAccept, onReject }: Props) {
  const { status, callerName, type } = useCallStore();
  const [tick, setTick] = useState(30);

  useEffect(() => {
    if (status !== "incoming") return;
    setTick(30);
    const id = setInterval(() => {
      setTick((t) => {
        if (t <= 1) { onReject(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  if (status !== "incoming") return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 min-w-[300px] border border-gray-700 animate-in slide-in-from-top-4">
      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 animate-pulse">
        {type === "video" ? <Video className="h-5 w-5 text-primary" /> : <Phone className="h-5 w-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{callerName}</p>
        <p className="text-xs text-gray-400">Incoming {type === "video" ? "video" : "voice"} call · {tick}s</p>
      </div>
      <button
        onClick={onReject}
        className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
        title="Decline"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
      <button
        onClick={onAccept}
        className="w-9 h-9 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
        title="Accept"
      >
        <Phone className="h-4 w-4" />
      </button>
    </div>
  );
}
