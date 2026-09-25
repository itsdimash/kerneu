import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ConfirmDialog } from "../modals/ConfirmDialog";
import { Checkbox } from "../ui/checkbox";
import {
  getProjectRevertEligibility,
  revertProjectToEditing,
  type ProjectRevertEligibility,
} from "../../../api/api";

// Откат доступен только пока проект в одном из этих двух статусов — вне их
// кнопка не показывается вообще, без обращения к revert-eligibility.
const REVERT_ELIGIBLE_STATUSES = ["Активный закуп", "На отгрузке"];

// Должно совпадать с минимальной длиной revert_reason на backend — иначе
// клиент либо пропускает то, что backend потом отклонит 422, либо наоборот
// блокирует submit там, где backend бы принял.
const MIN_REVERT_REASON_LENGTH = 10;

interface ProjectRevertControlProps {
  projectId: number;
  currentStatus: string;
  // Вызывается после успешного отката. Должен реально перезапросить проект
  // (и, если применимо, ml-импорт/позиции) с backend — а не патчить статус
  // локально, иначе разблокировка полей название товара будет врать, если
  // backend по какой-то причине не сбросил mlImport.status/is_confirmed.
  onReverted: () => void | Promise<void>;
  className?: string;
}

export function ProjectRevertControl({
  projectId,
  currentStatus,
  onReverted,
  className,
}: ProjectRevertControlProps) {
  const isStatusEligible = REVERT_ELIGIBLE_STATUSES.includes(currentStatus);

  const [eligibility, setEligibility] = useState<ProjectRevertEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [acknowledgedReceipt, setAcknowledgedReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isStatusEligible) {
      setEligibility(null);
      return;
    }

    let cancelled = false;
    setEligibilityLoading(true);
    getProjectRevertEligibility(projectId)
      .then((data) => { if (!cancelled) setEligibility(data); })
      .catch(() => { if (!cancelled) setEligibility(null); })
      .finally(() => { if (!cancelled) setEligibilityLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, isStatusEligible]);

  // Пока не знаем причину — не показываем кнопку: не хотим сначала
  // отрисовать её, а через мгновение спрятать, если окажется reason === "shipped".
  if (!isStatusEligible || eligibilityLoading || eligibility === null) return null;
  if (eligibility.reason === "shipped") return null;

  const requiresReceiptAck = eligibility.reason === "received";
  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length >= MIN_REVERT_REASON_LENGTH && (!requiresReceiptAck || acknowledgedReceipt);

  const openDialog = () => {
    setReason("");
    setAcknowledgedReceipt(false);
    setSubmitError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialogOpen(false);
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await revertProjectToEditing(projectId, {
        revert_reason: trimmedReason,
        acknowledged_receipt: requiresReceiptAck ? true : undefined,
      });
      setDialogOpen(false);
      await onReverted();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось выполнить откат");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:hover:bg-red-400/15 dark:hover:text-red-300 ${className ?? ""}`}
      >
        <RotateCcw size={14} />
        В редактирование
      </button>

      {dialogOpen && (
        <ConfirmDialog
          title="Вернуть проект в редактирование?"
          description="Проект перейдёт из текущего статуса обратно в «В редактировании». Это отменит часть уже выполненной работы по закупке и складу:"
          confirmLabel="Вернуть в редактирование"
          tone="danger"
          loading={submitting}
          confirmDisabled={!canSubmit}
          error={submitError}
          onConfirm={handleConfirm}
          onCancel={closeDialog}
        >
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Активные резервы склада по этому проекту будут сняты</li>
              {requiresReceiptAck && (
                <li className="text-amber-700 dark:text-amber-300">
                  Приход по этому проекту уже был принят на склад — эти данные откат не восстановит автоматически
                </li>
              )}
            </ul>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">
                Причина отката <span className="text-destructive">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={submitting}
                rows={3}
                placeholder="Например: клиент изменил состав заказа, нужно пересобрать позиции"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-200 disabled:bg-muted"
              />
              {trimmedReason.length < MIN_REVERT_REASON_LENGTH && (
                <span className="mt-1 block text-[11px] text-destructive">
                  Минимум {MIN_REVERT_REASON_LENGTH} символов, введено {trimmedReason.length}
                </span>
              )}
            </label>

            {requiresReceiptAck && (
              <label className="flex items-start gap-2 text-xs text-foreground">
                <Checkbox
                  checked={acknowledgedReceipt}
                  onCheckedChange={(checked) => setAcknowledgedReceipt(checked === true)}
                  disabled={submitting}
                  className="mt-0.5"
                />
                <span>
                  Я понимаю, что приход по этому проекту уже был принят на склад, и подтверждаю откат
                </span>
              </label>
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
