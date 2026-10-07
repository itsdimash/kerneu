import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ConfirmDialog } from "../modals/ConfirmDialog";
import { DocStatusPill } from "./DocStatusPill";
import { documentActionErrorMessage } from "../../../api/api";

type NotRequiredMarkProps = {
  docLabel: string;
  /** Подпись кнопки, например «Без договора» */
  buttonLabel?: string;
  state: "empty" | "uploaded" | "not_required";
  markedAt?: string | null;
  disabled: boolean;
  disabledHint?: string;
  /** false для договора: снять отметку можно только загрузкой файла */
  allowUndo: boolean;
  confirmText?: string;
  onSet: () => Promise<void>;
  onUnset?: () => Promise<void>;
};

const DEFAULT_CONFIRM_TEXT =
  "Блок будет считаться выполненным. Отметку можно отменить, пока документы не отправлены на проверку.";

/**
 * Кнопка «Без …» / пилюля «Не требуется» с подтверждением. Общая для договора,
 * доверенностей, накладных и счёта покупателю: API вызывается только после
 * подтверждения, ошибка бэкенда (409/403) показывается внутри окна.
 */
export function NotRequiredMark({
  docLabel,
  buttonLabel = "Не требуется",
  state,
  markedAt,
  disabled,
  disabledHint,
  allowUndo,
  confirmText = DEFAULT_CONFIRM_TEXT,
  onSet,
  onUnset,
}: NotRequiredMarkProps) {
  const [dialog, setDialog] = useState<"set" | "unset" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === "uploaded") return null;

  const close = () => {
    if (loading) return;
    setDialog(null);
    setError(null);
  };

  const confirm = async () => {
    const action = dialog === "set" ? onSet : onUnset;
    if (!action) return;
    setLoading(true);
    setError(null);
    try {
      await action();
      setDialog(null);
    } catch (e) {
      setError(documentActionErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const date = markedAt ? new Date(markedAt).toLocaleDateString("ru-RU") : "";
  const buttonCls =
    "flex h-9 items-center gap-1.5 px-3 text-xs font-medium rounded-lg border border-border bg-card text-foreground shadow-card transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out-strong flex-shrink-0 cursor-pointer hover:border-primary/40 hover:bg-accent hover:shadow-elevated active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-card disabled:hover:shadow-card disabled:active:scale-100";

  return (
    <>
      {state === "empty" ? (
        <button
          type="button"
          onClick={() => setDialog("set")}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
          className={buttonCls}
        >
          <X size={13} />
          {buttonLabel}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <DocStatusPill status="not_required" />
            {date && <span className="text-xs text-muted-foreground">Отмечено · {date}</span>}
          </div>
          {allowUndo && onUnset && (
            <button
              type="button"
              onClick={() => setDialog("unset")}
              disabled={disabled}
              title={disabled ? disabledHint : undefined}
              className={buttonCls}
            >
              Отменить
            </button>
          )}
        </div>
      )}

      {/* В портал: карточка DocumentDropzone держит transform (анимация
          появления с fill-mode-both), а он делает `fixed` относительным к
          карточке — окно обрезалось и затемняло только её. */}
      {dialog && createPortal(
        <ConfirmDialog
          tone="primary"
          title={dialog === "set" ? `Отметить «${docLabel}» как не требуется?` : "Снять отметку?"}
          description={
            dialog === "set"
              ? confirmText
              : `«${docLabel}» снова станет обязательным блоком — потребуется загрузить файл.`
          }
          confirmLabel={dialog === "set" ? "Отметить" : "Снять отметку"}
          loading={loading}
          error={error}
          onConfirm={() => void confirm()}
          onCancel={close}
        />,
        document.body,
      )}
    </>
  );
}
