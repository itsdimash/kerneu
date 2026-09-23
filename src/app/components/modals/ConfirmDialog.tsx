import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

type ConfirmDialogProps = {
  title: string;
  description?: string;
  /** Блок с деталями (что именно подтверждается) — рисуется в рамке под описанием */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger — красная кнопка и иконка корзины; primary — обычная */
  tone?: "danger" | "primary";
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Окно подтверждения внутри ERP — вместо window.confirm(), который
 * браузер рисует своим системным окном ("localhost:5173 says").
 */
export function ConfirmDialog({
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Отмена",
  tone = "danger",
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isDanger = tone === "danger";

  // Фокус на "Отмена": случайный Enter не должен удалить данные
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [loading, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl border border-border"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDanger
                ? "bg-red-100 text-red-600 dark:bg-red-400/20 dark:text-red-300"
                : "bg-primary/10 text-primary"
            }`}
          >
            {isDanger ? <Trash2 size={18} /> : <AlertTriangle size={18} />}
          </div>

          <div className="min-w-0 flex-1">
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-foreground leading-6">
              {title}
            </h3>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>

        {children && (
          <div className="mt-4 rounded-lg border border-border bg-background/60 px-3.5 py-3">{children}</div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-400/25 dark:bg-red-400/15">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg text-foreground border border-border hover:bg-background transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {error ? "Закрыть" : cancelLabel}
          </button>
          {!error && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white shadow-sm transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 ${
                isDanger
                  ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500/40"
                  : "bg-primary hover:bg-primary/90 focus-visible:ring-primary/40"
              }`}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
