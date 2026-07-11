import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Download, FileText, Film, Mic, File } from "lucide-react";
import ImageLightbox from "@/components/ImageLightbox";
import type { Message } from "@chat/shared";

interface Props {
  conversationId: string;
  onClose: () => void;
}

type Tab = "all" | "images" | "videos" | "docs" | "audio";

async function fetchMedia(id: string): Promise<Message[]> {
  const res = await fetch(`/api/conversations/${id}/media`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch media");
  return res.json();
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

export default function MediaGallery({ conversationId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["media", conversationId],
    queryFn: () => fetchMedia(conversationId),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "images", label: "Images" },
    { key: "videos", label: "Videos" },
    { key: "docs", label: "Docs" },
    { key: "audio", label: "Audio" },
  ];

  const filtered = data.filter((m) => {
    if (tab === "images") return m.type === "image";
    if (tab === "videos") return m.type === "video";
    if (tab === "docs") return m.type === "pdf" || m.type === "file";
    if (tab === "audio") return m.type === "audio";
    return true;
  });

  const images = filtered.filter((m) => m.type === "image");
  const lightboxImages = data.filter((m) => m.type === "image");

  return (
    <div className="w-72 border-l flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h3 className="font-semibold text-sm">Media</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && (
          <div className="flex justify-center mt-8">
            <span className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">No media yet</p>
        )}

        {/* Image grid */}
        {(tab === "all" || tab === "images") && images.length > 0 && (
          <div>
            {tab === "all" && <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Images</p>}
            <div className="grid grid-cols-3 gap-1 mb-4">
              {images.map((msg) => {
                const idx = lightboxImages.findIndex((m) => m.id === msg.id);
                return (
                  <button
                    key={msg.id}
                    onClick={() => setLightboxIndex(idx)}
                    className="aspect-square rounded overflow-hidden bg-muted hover:opacity-90 transition-opacity"
                  >
                    <img src={msg.fileUrl!} alt={msg.fileName ?? "image"} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Video list */}
        {(tab === "all" || tab === "videos") && filtered.filter((m) => m.type === "video").length > 0 && (
          <div>
            {tab === "all" && <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Videos</p>}
            <div className="space-y-2 mb-4">
              {filtered.filter((m) => m.type === "video").map((msg) => (
                <div key={msg.id} className="rounded overflow-hidden bg-muted">
                  <video src={msg.fileUrl!} controls className="w-full max-h-32 object-cover" />
                  <div className="flex items-center justify-between px-2 py-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Film className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs truncate">{msg.fileName ?? "video"}</span>
                    </div>
                    <button onClick={() => forceDownload(msg.fileUrl!, msg.fileName ?? "video")} className="text-muted-foreground hover:text-foreground shrink-0 ml-1">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio list */}
        {(tab === "all" || tab === "audio") && filtered.filter((m) => m.type === "audio").length > 0 && (
          <div>
            {tab === "all" && <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Audio</p>}
            <div className="space-y-2 mb-4">
              {filtered.filter((m) => m.type === "audio").map((msg) => (
                <div key={msg.id} className="p-2 rounded bg-muted">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs truncate">{msg.fileName ?? "audio"}</span>
                    </div>
                    <button onClick={() => forceDownload(msg.fileUrl!, msg.fileName ?? "audio")} className="text-muted-foreground hover:text-foreground shrink-0 ml-1">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <audio src={msg.fileUrl!} controls className="w-full h-7" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Docs / files list */}
        {(tab === "all" || tab === "docs") && filtered.filter((m) => m.type === "pdf" || m.type === "file").length > 0 && (
          <div>
            {tab === "all" && <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Documents</p>}
            <div className="space-y-1 mb-4">
              {filtered.filter((m) => m.type === "pdf" || m.type === "file").map((msg) => {
                const Icon = msg.type === "pdf" ? FileText : File;
                const sizeKb = msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : "";
                return (
                  <div key={msg.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent transition-colors">
                    <Icon className="h-7 w-7 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{msg.fileName ?? "file"}</p>
                      {sizeKb && <p className="text-xs text-muted-foreground">{sizeKb}</p>}
                    </div>
                    <button onClick={() => forceDownload(msg.fileUrl!, msg.fileName ?? "file")} className="text-muted-foreground hover:text-foreground shrink-0">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxImages[lightboxIndex] && (
        <ImageLightbox
          src={lightboxImages[lightboxIndex].fileUrl!}
          fileName={lightboxImages[lightboxIndex].fileName ?? "image"}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setLightboxIndex((i) => Math.min(lightboxImages.length - 1, (i ?? 0) + 1))}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < lightboxImages.length - 1}
        />
      )}
    </div>
  );
}
