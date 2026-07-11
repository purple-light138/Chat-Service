import { useState } from "react";
import { FileText, Film, Mic, Download, File, ExternalLink } from "lucide-react";
import ImageLightbox from "@/components/ImageLightbox";
import type { Message } from "@chat/shared";

interface Props {
  message: Message;
  isOwn: boolean;
}

async function forceDownload(url: string, fileName: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export default function MediaMessage({ message, isOwn }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const label = message.fileName ?? "File";
  const size = message.fileSize ? formatBytes(message.fileSize) : "";

  if (message.type === "image" && message.fileUrl) {
    return (
      <>
        <button onClick={() => setLightboxOpen(true)} className="block hover:opacity-90 transition-opacity">
          <img
            src={message.fileUrl}
            alt={label}
            className="max-w-[260px] max-h-[260px] rounded-lg object-cover"
          />
        </button>
        {lightboxOpen && (
          <ImageLightbox
            src={message.fileUrl}
            fileName={label}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    );
  }

  if (message.type === "video" && message.fileUrl) {
    return (
      <div className="space-y-1">
        <video src={message.fileUrl} controls className="max-w-[280px] rounded-lg" />
        <button
          onClick={() => forceDownload(message.fileUrl!, label)}
          className={`flex items-center gap-1 text-xs opacity-70 hover:opacity-100 ${isOwn ? "text-primary-foreground" : "text-foreground"}`}
        >
          <Download className="h-3 w-3" /> Download
        </button>
      </div>
    );
  }

  if (message.type === "audio" && message.fileUrl) {
    return (
      <div className="flex flex-col gap-1 min-w-[200px]">
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-1.5 min-w-0">
            <Mic className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <button onClick={() => forceDownload(message.fileUrl!, label)} className="shrink-0 opacity-70 hover:opacity-100">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
        <audio src={message.fileUrl} controls className="w-full h-8" />
      </div>
    );
  }

  if (message.type === "pdf" && message.fileUrl) {
    return (
      <>
        <div className="flex items-center gap-2 min-w-[200px]">
          <FileText className="h-8 w-8 shrink-0 text-red-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{label}</p>
            {size && <p className="text-xs opacity-70">{size}</p>}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={() => setPdfOpen(true)} title="Preview" className="opacity-70 hover:opacity-100">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => forceDownload(message.fileUrl!, label)} title="Download" className="opacity-70 hover:opacity-100">
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {pdfOpen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={() => setPdfOpen(false)}>
            <div className="flex items-center justify-between px-4 py-2 bg-background/90 shrink-0" onClick={(e) => e.stopPropagation()}>
              <span className="text-sm font-medium truncate">{label}</span>
              <div className="flex gap-2">
                <button onClick={() => forceDownload(message.fileUrl!, label)} className="text-sm text-primary hover:opacity-70">Download</button>
                <button onClick={() => setPdfOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Close</button>
              </div>
            </div>
            <iframe
              src={`${message.fileUrl}#toolbar=0`}
              className="flex-1 w-full"
              title={label}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  // Generic file (zip, etc.)
  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <File className="h-8 w-8 shrink-0 text-blue-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {size && <p className="text-xs opacity-70">{size}</p>}
      </div>
      <button onClick={() => forceDownload(message.fileUrl ?? "", label)} className="opacity-70 hover:opacity-100 shrink-0">
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
