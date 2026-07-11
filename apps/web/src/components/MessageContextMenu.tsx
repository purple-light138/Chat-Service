import { useEffect, useRef } from "react";
import { Reply, Forward, Copy, Pencil, Trash2, Pin, PinOff, Star, StarOff } from "lucide-react";
import type { Message } from "@chat/shared";

interface Props {
  message: Message;
  isOwn: boolean;
  isPinned: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: (forEveryone: boolean) => void;
  onPin: () => void;
  onStar: () => void;
}

export default function MessageContextMenu({ message, isOwn, isPinned, x, y, onClose, onReply, onForward, onCopy, onEdit, onDelete, onPin, onStar }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust so the menu doesn't overflow the viewport
  const menuW = 180;
  const menuH = 280;
  const left = x + menuW > window.innerWidth ? x - menuW : x;
  const top = y + menuH > window.innerHeight ? y - menuH : y;

  const item = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      key={label}
      onClick={() => { action(); onClose(); }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left ${danger ? "text-destructive hover:bg-destructive/10" : ""}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-background border rounded-lg shadow-xl py-1 w-44 overflow-hidden"
      style={{ left, top }}
    >
      {!message.isDeleted && item(<Reply className="h-4 w-4" />, "Reply", onReply)}
      {!message.isDeleted && item(<Forward className="h-4 w-4" />, "Forward", onForward)}
      {!message.isDeleted && item(<Copy className="h-4 w-4" />, "Copy", onCopy)}
      {!message.isDeleted && item(message.isStarred ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />, message.isStarred ? "Unstar" : "Star", onStar)}
      {!message.isDeleted && item(isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />, isPinned ? "Unpin" : "Pin", onPin)}
      {isOwn && !message.isDeleted && message.type === "text" && item(<Pencil className="h-4 w-4" />, "Edit", onEdit)}
      {<div className="border-t my-1" />}
      {item(<Trash2 className="h-4 w-4" />, "Delete for me", () => onDelete(false), true)}
      {isOwn && !message.isDeleted && item(<Trash2 className="h-4 w-4" />, "Delete for everyone", () => onDelete(true), true)}
    </div>
  );
}
