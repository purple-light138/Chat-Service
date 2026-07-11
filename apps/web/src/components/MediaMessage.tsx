import { FileText, Film, Mic, Download } from "lucide-react";
import type { Message } from "@chat/shared";

interface Props {
  message: Message;
  isOwn: boolean;
}

export default function MediaMessage({ message, isOwn }: Props) {
  const label = message.fileName ?? "File";
  const size = message.fileSize ? formatBytes(message.fileSize) : "";

  if (message.type === "image" && message.fileUrl) {
    return (
      <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
        <img
          src={message.fileUrl}
          alt={label}
          className="max-w-[260px] max-h-[260px] rounded-lg object-cover"
        />
      </a>
    );
  }

  if (message.type === "video" && message.fileUrl) {
    return (
      <video
        src={message.fileUrl}
        controls
        className="max-w-[280px] rounded-lg"
      />
    );
  }

  if (message.type === "audio" && message.fileUrl) {
    return (
      <div className="flex flex-col gap-1 min-w-[200px]">
        <div className="flex items-center gap-2 text-sm">
          <Mic className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <audio src={message.fileUrl} controls className="w-full h-8" />
      </div>
    );
  }

  const Icon = message.type === "pdf" ? FileText : Film;

  return (
    <a
      href={message.fileUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 min-w-[180px] hover:opacity-80 transition-opacity"
    >
      <Icon className="h-8 w-8 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {size && <p className="text-xs opacity-70">{size}</p>}
      </div>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
