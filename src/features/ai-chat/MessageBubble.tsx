import { useState } from "react";
import { AlertTriangle, Bot, Check, Copy, Download, Info, RotateCw, ShieldAlert } from "lucide-react";
import type { Role } from "../../types";
import { AiMarkdown } from "./AiMarkdown";
import { AiResultTable, downloadTableAsExcel } from "./AiResultTable";
import { FileCard } from "./FileCard";
import { ImageGallery } from "./ImageGallery";
import type { AiMessage } from "./types";
import { attachmentKind, copyToClipboard } from "./utils";

function splitAttachments(message: AiMessage) {
  const images = message.attachments.filter((a) => attachmentKind(a) === "image");
  const files = message.attachments.filter((a) => attachmentKind(a) !== "image");
  return { images, files };
}

function UserBubble({ message }: { message: AiMessage }) {
  const { images, files } = splitAttachments(message);
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-2 sm:max-w-[80%]">
        <ImageGallery images={images} variant="thumbnail" />
        {files.map((file, index) => (
          <FileCard key={`${file.key || file.url}-${index}`} attachment={file} />
        ))}
        {message.displayedContent && (
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-[13.5px] text-primary-foreground">
            {message.displayedContent}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3" aria-label="AI печатает">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
            style={{ animation: `aiDotPulse 1.1s ${dot * 0.15}s infinite ease-in-out` }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorBubble({ message, onRetry }: { message: AiMessage; onRetry?: () => void }) {
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3" role="alert">
        <div className="flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
          <p className="text-[13px] text-destructive">{message.error ?? "Не удалось получить ответ от AI."}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2.5 flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RotateCw size={12} /> Повторить
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({ message, role }: { message: AiMessage; role: Role }) {
  const [copied, setCopied] = useState(false);
  const { images, files } = splitAttachments(message);
  const hasTable = Boolean(message.table && message.table.length > 0);

  const handleCopy = async () => {
    if (await copyToClipboard(message.content)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      className={`flex justify-start ${message.isNew ? "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out-strong" : ""}`}
    >
      <div className="w-full max-w-[95%] rounded-xl border border-border bg-card px-4 py-3.5 sm:max-w-[85%]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Bot size={14} className="text-primary" />
            <span className="text-[12.5px] font-semibold text-primary">{message.modelUsed ?? "AI"}</span>
          </div>
          {message.confidence != null && (
            <div
              className="hidden items-center gap-1 sm:flex"
              title={`уверенность ${(message.confidence * 100).toFixed(0)}% · ${message.taskType ?? ""} · ${message.latencyMs ?? 0} мс`}
            >
              <Info size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                {(message.tokensIn ?? 0) + (message.tokensOut ?? 0)} токенов
              </span>
            </div>
          )}
        </div>

        <div className="break-words text-[13.5px] leading-relaxed text-foreground">
          <AiMarkdown content={message.displayedContent} />
        </div>

        <ImageGallery images={images} variant="inline" />

        {files.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {files.map((file, index) => (
              <FileCard key={`${file.key || file.url}-${index}`} attachment={file} />
            ))}
          </div>
        )}

        {hasTable && <AiResultTable rows={message.table!} role={role} />}

        {message.needsReview && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[12px] font-medium text-amber-700 dark:text-amber-400">
            <ShieldAlert size={13} /> Требует проверки юристом/директором
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Скопировано" : "Скопировать"}
          </button>
          {hasTable && (
            <button
              type="button"
              onClick={() => downloadTableAsExcel(message.table!, "ai-otvet")}
              className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download size={13} /> Скачать Excel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  role,
  onRetry,
}: {
  message: AiMessage;
  role: Role;
  /** Передаётся только для последнего сообщения. */
  onRetry?: () => void;
}) {
  if (message.role === "user") return <UserBubble message={message} />;
  if (message.status === "pending") return <PendingBubble />;
  if (message.status === "error") return <ErrorBubble message={message} onRetry={onRetry} />;
  return <AssistantBubble message={message} role={role} />;
}
