import { useState } from "react";
import { Download, ExternalLink, File as FileIcon, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { cn } from "../../app/components/ui/utils";
import { downloadAttachment } from "./download";
import { ensureFreshUrl, isUrlStale } from "./fileUrls";
import type { AiAttachment } from "./types";
import { attachmentKind, formatFileSize, type FileKind } from "./utils";

const KIND_STYLE: Record<
  FileKind,
  { icon: React.ComponentType<{ size?: number; className?: string }>; color: string; label: string }
> = {
  pptx: { icon: Presentation, color: "bg-orange-500/10 text-orange-600", label: "Презентация" },
  docx: { icon: FileText, color: "bg-blue-500/10 text-blue-600", label: "Документ Word" },
  xlsx: { icon: FileSpreadsheet, color: "bg-emerald-500/10 text-emerald-600", label: "Таблица Excel" },
  pdf: { icon: FileText, color: "bg-red-500/10 text-red-600", label: "PDF" },
  image: { icon: FileIcon, color: "bg-violet-500/10 text-violet-600", label: "Изображение" },
  other: { icon: FileIcon, color: "bg-muted text-muted-foreground", label: "Файл" },
};

export function FileCard({ attachment, className }: { attachment: AiAttachment; className?: string }) {
  const [busy, setBusy] = useState<"download" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kind = attachmentKind(attachment);
  const { icon: Icon, color, label } = KIND_STYLE[kind];
  const canOpen = kind === "pdf" || kind === "image";
  const size = formatFileSize(attachment.size);

  const open = async () => {
    setError(null);
    setBusy("open");

    // Если url надо обновлять — вкладку открываем сразу по клику, иначе попап заблокируют после await.
    const popup = isUrlStale(attachment) ? window.open("", "_blank") : null;
    if (popup) popup.opener = null;

    try {
      const url = await ensureFreshUrl(attachment);
      if (popup) popup.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      popup?.close();
      setError("Не удалось получить ссылку на файл. Попробуйте ещё раз.");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setError(null);
    setBusy("download");
    await downloadAttachment(attachment);
    setBusy(null);
  };

  return (
    <div className={cn("w-full max-w-sm rounded-xl border border-border bg-background p-3", className)}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", color)}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground" title={attachment.name}>
            {attachment.name}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {label}
            {size ? ` · ${size}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canOpen && (
            <button
              type="button"
              onClick={() => void open()}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <ExternalLink size={12} /> Открыть
            </button>
          )}
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy !== null}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Download size={12} /> {busy === "download" ? "…" : "Скачать"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}
