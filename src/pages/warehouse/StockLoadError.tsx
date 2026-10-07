import { AlertCircle, LogIn, RefreshCw } from "lucide-react";
import { forceRelogin } from "../../api/sessionGuard";
import { isAuthFailure, type LoadFailure } from "../../lib/loadError";

// Состояние ошибки загрузки остатков вместо вечного спиннера.
export function StockLoadError({
  failure,
  onRetry,
  title = "Не удалось загрузить остатки",
}: {
  failure: LoadFailure;
  onRetry: () => void;
  title?: string;
}) {
  const authProblem = isAuthFailure(failure);
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <AlertCircle size={24} className="text-destructive" />
      {authProblem ? (
        <p className="text-sm font-medium text-foreground">Сессия изменилась. Войдите заново.</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{failure.message}</p>
        </>
      )}
      {authProblem ? (
        <button
          type="button"
          onClick={() => forceRelogin()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <LogIn size={14} /> Войти заново
        </button>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <RefreshCw size={14} /> Повторить
        </button>
      )}
    </div>
  );
}
