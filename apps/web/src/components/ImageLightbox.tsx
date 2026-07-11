import { useEffect, useCallback } from "react";
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  src: string;
  fileName: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export default function ImageLightbox({ src, fileName, onClose, onPrev, onNext, hasPrev, hasNext }: Props) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft" && onPrev && hasPrev) onPrev();
    if (e.key === "ArrowRight" && onNext && hasNext) onNext();
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  async function handleDownload() {
    const res = await fetch(src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        <button onClick={handleDownload} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <Download className="h-5 w-5" />
        </button>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* File name */}
      <div className="absolute top-4 left-4 text-white/70 text-sm truncate max-w-xs">{fileName}</div>

      {/* Prev / Next */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Image */}
      <img
        src={src}
        alt={fileName}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
