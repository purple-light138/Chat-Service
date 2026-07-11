import { useState } from "react";
import { useChatStore } from "@/store/chat";
import { socket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { X, Users } from "lucide-react";
import type { Message } from "@chat/shared";

interface Props {
  message: Message;
  onClose: () => void;
}

export default function ForwardModal({ message, onClose }: Props) {
  const { conversations } = useChatStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  function toggle(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  async function forward() {
    for (const convId of selected) {
      await new Promise<void>((resolve) => {
        (socket as any).emit(
          "message:send",
          { conversationId: convId, type: message.type, content: message.content, fileUrl: message.fileUrl, fileName: message.fileName, fileSize: message.fileSize },
          () => resolve()
        );
      });
    }
    setDone(true);
    setTimeout(onClose, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-sm mx-4 flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">Forward to...</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => {
            const isGroup = conv.type === "group";
            const name = isGroup ? (conv.group?.name ?? "Group") : (conv.participant?.name ?? "");
            const initial = name[0]?.toUpperCase() ?? "?";
            const isSelected = selected.includes(conv.id);

            return (
              <button
                key={conv.id}
                onClick={() => toggle(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left ${isSelected ? "bg-accent" : ""}`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold shrink-0 ${isGroup ? "bg-emerald-500/20 text-emerald-600" : "bg-primary/20 text-primary"}`}>
                  {isGroup ? <Users className="h-4 w-4" /> : initial}
                </div>
                <span className="flex-1 text-sm font-medium truncate">{name}</span>
                {isSelected && <div className="w-4 h-4 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={forward} disabled={selected.length === 0 || done}>
            {done ? "Forwarded!" : `Forward${selected.length > 0 ? ` (${selected.length})` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
