import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../app/components/ui/dialog";
import { cn } from "../../app/components/ui/utils";
import { downloadAttachment } from "./download";
import { useAttachmentUrl } from "./fileUrls";
import type { AiAttachment } from "./types";

function DownloadButton({
  attachment,
  className,
  withLabel = false,
}: {
  attachment: AiAttachment;
  className?: string;
  withLabel?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (event) => {
        event.stopPropagation();
        setBusy(true);
        await downloadAttachment(attachment);
        setBusy(false);
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-md bg-black/60 text-white transition-opacity hover:bg-black/75 disabled:opacity-60",
        withLabel ? "px-2.5 py-1 text-[12px] font-medium" : "p-1.5",
        className,
      )}
      title="Скачать"
      aria-label={`Скачать ${attachment.name}`}
    >
      <Download size={withLabel ? 13 : 12} />
      {withLabel && "Скачать"}
    </button>
  );
}

/** Картинка вложения: сама обновляет протухший url (один раз по onError). */
function AttachmentImage({
  attachment,
  className,
  onClick,
}: {
  attachment: AiAttachment;
  className?: string;
  onClick?: () => void;
}) {
  const { url, handleLoadError } = useAttachmentUrl(attachment);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [attachment]);

  if (failed || !url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted text-[11.5px] text-muted-foreground",
          className,
        )}
        title={attachment.name}
      >
        <ImageOff size={14} />
        <span className="truncate">{attachment.name}</span>
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className="block cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted"
        aria-label={`Открыть изображение ${attachment.name}`}
      >
        <img
          src={url}
          alt={attachment.name}
          loading="lazy"
          onError={() => {
            void handleLoadError().then((retried) => {
              if (!retried) setFailed(true);
            });
          }}
          className={className}
        />
      </button>
      {/* На десктопе — по hover, на мобильном (нет hover) — всегда. */}
      <DownloadButton
        attachment={attachment}
        className="absolute right-1.5 top-1.5 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      />
    </div>
  );
}

function LightboxImage({ attachment }: { attachment: AiAttachment }) {
  const { url, handleLoadError } = useAttachmentUrl(attachment);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [attachment]);

  if (failed || !url) {
    return <p className="text-sm text-white/80">Не удалось загрузить изображение</p>;
  }
  return (
    <img
      src={url}
      alt={attachment.name}
      onError={() => {
        void handleLoadError().then((retried) => {
          if (!retried) setFailed(true);
        });
      }}
      className="max-h-[85vh] max-w-full rounded-lg object-contain"
    />
  );
}

export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: AiAttachment[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && images[index] !== undefined;
  const current = open ? images[index as number] : null;

  useEffect(() => {
    if (!open || images.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") onIndexChange(((index as number) - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") onIndexChange(((index as number) + 1) % images.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, images.length, onIndexChange]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        // Esc закрывает сам Radix; клик по фону — это клик по самому контейнеру, не по его детям.
        onClick={(event) => event.target === event.currentTarget && onClose()}
        className="flex max-w-[min(95vw,1200px)] flex-col items-center justify-center gap-3 border-none bg-transparent p-0 shadow-none sm:max-w-[min(95vw,1200px)] [&>button]:text-white"
      >
        <DialogTitle className="sr-only">{current?.name ?? "Изображение"}</DialogTitle>
        <DialogDescription className="sr-only">Просмотр изображения</DialogDescription>
        {current && <LightboxImage attachment={current} />}
        {current && (
          <div className="flex w-fit max-w-full items-center gap-3 rounded-lg bg-black/60 px-3 py-1.5 text-white">
            <span className="min-w-0 truncate text-[13px]" title={current.name}>
              {current.name}
            </span>
            {images.length > 1 && (
              <span className="shrink-0 text-[12px] text-white/70">
                {(index as number) + 1} / {images.length}
              </span>
            )}
            <DownloadButton attachment={current} withLabel className="shrink-0 bg-white/15 hover:bg-white/25" />
          </div>
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onIndexChange(((index as number) - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
              aria-label="Предыдущее"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange(((index as number) + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
              aria-label="Следующее"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** variant="inline" — картинки ответа ассистента; "thumbnail" — миниатюры в пузыре пользователя. */
export function ImageGallery({
  images,
  variant,
}: {
  images: AiAttachment[];
  variant: "inline" | "thumbnail";
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (images.length === 0) return null;

  const imageClass =
    variant === "inline"
      ? "max-h-[420px] w-auto max-w-full object-contain"
      : "h-[72px] w-[72px] object-cover";

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", variant === "inline" ? "mt-3" : "justify-end")}>
        {images.map((image, index) => (
          <AttachmentImage
            key={`${image.key || image.url}-${index}`}
            attachment={image}
            className={cn(imageClass, variant === "thumbnail" && "h-[72px] w-[72px]")}
            onClick={() => setOpenIndex(index)}
          />
        ))}
      </div>
      <ImageLightbox
        images={images}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
