import type { AiSession } from "./types";

export function DeleteSessionDialog({
  session,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  session: AiSession | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!session) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => !isDeleting && onCancel()}
    >
      <div
        className="w-full max-w-[360px] rounded-xl border border-border bg-card p-5 shadow-modal animate-in fade-in zoom-in-95 duration-200 ease-out-strong"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-foreground">Удалить чат?</h3>
        <p className="mt-2 text-[13px] text-muted-foreground">
          «{session.title}» будет удалён без возможности восстановления.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            {isDeleting ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}
