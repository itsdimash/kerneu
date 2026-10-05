import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type ModalShellProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Выключает закрытие по Esc/клику на фон — пока поверх открыт ConfirmDialog или идёт запрос */
  locked?: boolean;
  maxWidthClass?: string;
};

/** Простая модалка в стиле остальных окон ERP (fixed-оверлей, не Radix), чтобы
 *  поверх неё без проблем с фокусом/pointer-events открывался ConfirmDialog. */
export function ModalShell({ title, subtitle, onClose, children, footer, locked = false, maxWidthClass = "max-w-2xl" }: ModalShellProps) {
  useEffect(() => {
    if (locked) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [locked, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[90vh] w-full ${maxWidthClass} flex-col rounded-xl border border-border bg-card shadow-modal animate-in fade-in zoom-in-95 duration-200 ease-out-strong`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Закрыть"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4 flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
