import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronDown, FileText, Paperclip, Send, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../app/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../app/components/ui/select";
import { cn } from "../../app/components/ui/utils";
import { DEFAULT_ACCEPT, INPUT_MAX_HEIGHT_PX, MODEL_OPTIONS } from "./config";
import type { AttachmentsApi } from "./useAttachments";
import type { AttachedDocumentItem } from "./types";
import { formatFileSize } from "./utils";

const EXTRACTED_PREVIEW_CHARS = 3000;

export interface ComposerHandle {
  openFilePicker: (accept?: string) => void;
  focus: () => void;
}

function DocumentChip({ doc, onRemove }: { doc: AttachedDocumentItem; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const uploading = doc.status === "uploading";
  const reading = uploading && doc.progress >= 100;
  const preview =
    doc.text.length > EXTRACTED_PREVIEW_CHARS ? `${doc.text.slice(0, EXTRACTED_PREVIEW_CHARS)}…` : doc.text;

  return (
    <Collapsible open={open && !uploading} onOpenChange={setOpen} className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <FileText size={14} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-[12.5px] text-foreground" title={doc.filename}>
              {doc.filename}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatFileSize(doc.size)}
              {!uploading && ` · ${doc.charCount.toLocaleString("ru-RU")} симв.${doc.truncated ? " · обрезан" : ""}`}
            </span>
          </div>
          {uploading && (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${doc.progress}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {reading ? "Читаю файл…" : `${doc.progress}%`}
              </span>
            </div>
          )}
        </div>
        {!uploading && (
          <CollapsibleTrigger className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground">
            Текст из файла
            <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Убрать файл ${doc.filename}`}
        >
          <X size={14} />
        </button>
      </div>
      <CollapsibleContent>
        <p className="px-3 pb-1 text-[11px] text-muted-foreground">
          Этот текст будет отправлен ассистенту вместе с вашим вопросом.
        </p>
        <pre className="mx-3 mb-2.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-[11.5px] leading-relaxed text-foreground">
          {preview || "Текст не извлечён."}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    input: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    isSending: boolean;
    attachments: AttachmentsApi;
    model: string;
    onModelChange: (value: string) => void;
    maxWidth: number;
    hint: string | null;
  }
>(function Composer(
  { input, onInputChange, onSend, isSending, attachments, model, onModelChange, maxWidth, hint },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    openFilePicker: (accept) => {
      const el = fileInputRef.current;
      if (!el) return;
      el.accept = accept ?? DEFAULT_ACCEPT;
      el.click();
    },
    focus: () => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    },
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [input]);

  const documents = attachments.items.filter((item): item is AttachedDocumentItem => item.kind === "document");
  const images = attachments.items.filter((item) => item.kind === "image");
  const canSend = input.trim().length > 0 && !isSending && !attachments.isUploading;

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) attachments.addFiles(files);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length > 0) {
      event.preventDefault();
      attachments.addFiles(files);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  const column = { maxWidth };

  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-4 sm:px-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={DEFAULT_ACCEPT}
        className="hidden"
        onChange={handleFileSelected}
      />

      {(documents.length > 0 || images.length > 0) && (
        <div className="mx-auto mb-2 flex flex-col gap-2" style={column}>
          {documents.map((doc) => (
            <DocumentChip key={doc.id} doc={doc} onRemove={() => attachments.remove(doc.id)} />
          ))}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.items.map((item) =>
                item.kind === "image" ? (
                  <div
                    key={item.id}
                    className="relative flex shrink-0 items-center rounded-lg border border-border bg-background p-1"
                  >
                    <img src={item.previewUrl} alt={item.file.name} className="h-12 w-12 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => attachments.remove(item.id)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                      aria-label={`Убрать изображение ${item.file.name}`}
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}

      {attachments.errors.length > 0 && (
        <div className="mx-auto mb-2 flex items-start justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2" style={column} role="alert">
          <ul className="space-y-0.5 text-[12px] text-destructive">
            {attachments.errors.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={attachments.dismissErrors}
            className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
            aria-label="Скрыть ошибки"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {hint && attachments.items.length === 0 && (
        <p className="mx-auto mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-primary" style={column}>
          <Paperclip size={13} /> {hint}
        </p>
      )}

      <div className="mx-auto flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2" style={column}>
        <button
          type="button"
          onClick={() => fileInputRef.current && ((fileInputRef.current.accept = DEFAULT_ACCEPT), fileInputRef.current.click())}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          title="Прикрепить файлы (.docx, .pdf, .xlsx) или фото (PNG, JPEG, WebP)"
          aria-label="Прикрепить файл"
        >
          <Paperclip size={16} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Спросите что угодно, вставьте файл или перетащите его в окно…"
          rows={1}
          style={{ maxHeight: `${INPUT_MAX_HEIGHT_PX}px` }}
          className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => canSend && onSend()}
          disabled={!canSend}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            input.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            "disabled:cursor-not-allowed",
          )}
          aria-label="Отправить"
        >
          <Send size={15} />
        </button>
      </div>

      <div className="mx-auto mt-2 flex items-center justify-between gap-3" style={column}>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          Вставляйте картинки из буфера (Cmd+V) или перетаскивайте файлы прямо в окно
        </p>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Модель</span>
          <Select value={model} onValueChange={onModelChange}>
            <SelectTrigger className="w-[180px] text-[13px]" aria-label="Модель для ответа">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-[13px]">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
});
