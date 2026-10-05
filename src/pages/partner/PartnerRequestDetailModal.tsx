import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelPartnerRequest,
  fetchPartnerRequest,
  parsePartnerError,
  type PartnerRequest,
} from "../../api/partner";
import { formatDateTime, formatPartnerDate, projectLabel, requestNumber } from "../../lib/partnerRequests";
import { ModalShell } from "../../app/components/common/ModalShell";
import { ConfirmDialog } from "../../app/components/modals/ConfirmDialog";
import { BRAND_GRADIENT, StatusBadge } from "./partnerUi";

type StepState = "done" | "current" | "upcoming" | "failed";
type Step = { key: string; label: string; at: string | null; state: StepState; caption?: string };

// Прогресс «Отправлена → Одобрена → Выдана»; для rejected и cancelled —
// свой финальный шаг (с причиной, если она есть).
function buildSteps(request: PartnerRequest): Step[] {
  const sent: Step = { key: "sent", label: "Отправлена", at: request.created_at, state: "done" };
  switch (request.status) {
    case "pending_director":
      return [
        { ...sent, state: "current" },
        { key: "approved", label: "Одобрена", at: null, state: "upcoming" },
        { key: "issued", label: "Выдана", at: null, state: "upcoming" },
      ];
    case "approved":
      return [
        sent,
        { key: "approved", label: "Одобрена", at: request.decided_at, state: "current" },
        { key: "issued", label: "Выдана", at: null, state: "upcoming" },
      ];
    case "issued":
      return [
        sent,
        { key: "approved", label: "Одобрена", at: request.decided_at, state: "done" },
        { key: "issued", label: "Выдана", at: request.issued_at, state: "done" },
      ];
    case "rejected":
      return [
        sent,
        { key: "rejected", label: "Отклонена", at: request.decided_at, state: "failed" },
      ];
    case "cancelled": {
      // Без decided_at заявку отменил сам партнёр; с decided_at — директор снял
      // резерв уже после одобрения.
      const byDirector = request.decided_at !== null;
      return [
        sent,
        ...(byDirector
          ? [{ key: "approved", label: "Одобрена", at: request.decided_at, state: "done" } satisfies Step]
          : []),
        byDirector
          ? { key: "cancelled", label: "Отменена директором", at: request.updated_at, state: "failed", caption: "Резерв снят" }
          : { key: "cancelled", label: "Отменена партнёром", at: request.updated_at, state: "failed" },
      ];
    }
  }
}

function RequestTimeline({ request }: { request: PartnerRequest }) {
  const steps = buildSteps(request);
  return (
    <ol className="flex items-start" aria-label="Ход выполнения заявки">
      {steps.map((step, index) => {
        const reached = step.state === "done" || step.state === "current" || step.state === "failed";
        const nextReached = index < steps.length - 1 && steps[index + 1].state !== "upcoming";
        return (
          <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {index > 0 && (
              <span
                aria-hidden
                className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 transition-colors duration-300 ${
                  reached ? (step.state === "failed" ? "bg-destructive/60" : "bg-primary") : "bg-border"
                }`}
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${
                step.state === "done"
                  ? `${BRAND_GRADIENT} text-white`
                  : step.state === "current"
                    ? "border-2 border-primary bg-card text-primary ring-4 ring-primary/15"
                    : step.state === "failed"
                      ? "bg-destructive text-destructive-foreground"
                      : "border-2 border-border bg-card text-muted-foreground"
              }`}
            >
              {step.state === "done" ? <Check size={15} /> : step.state === "failed" ? (step.key === "cancelled" ? <Ban size={14} /> : <X size={15} />) : index + 1}
            </span>
            <span className={`mt-2 text-xs font-semibold ${step.state === "upcoming" ? "text-muted-foreground" : step.state === "failed" ? "text-destructive" : "text-foreground"}`}>
              {step.label}
            </span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">{step.at && step.state !== "upcoming" ? formatDateTime(step.at) : nextReached ? "" : "—"}</span>
            {step.caption && <span className="text-[11px] font-medium text-destructive/80">{step.caption}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function PartnerRequestDetailModal({
  requestId,
  onClose,
  onChanged,
  onNoCompany,
}: {
  requestId: number;
  onClose: () => void;
  /** Заявка изменилась (отмена) — родитель обновляет список */
  onChanged: () => void;
  onNoCompany: () => void;
}) {
  const [request, setRequest] = useState<PartnerRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequest(await fetchPartnerRequest(requestId));
    } catch (err) {
      const parsed = parsePartnerError(err);
      if (parsed.body.code === "no_company") {
        onNoCompany();
        return;
      }
      setError(parsed.status === 404 ? "Заявка не найдена" : parsed.message);
    } finally {
      setLoading(false);
    }
  }, [requestId, onNoCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await cancelPartnerRequest(requestId);
      setRequest(updated);
      setConfirmCancel(false);
      toast.success(`Заявка ${requestNumber(updated.id)} отменена`);
      onChanged();
    } catch (err) {
      const parsed = parsePartnerError(err);
      if (parsed.body.code === "invalid_status") {
        // Директор успел раньше — показываем актуальное состояние заявки.
        setConfirmCancel(false);
        toast.error("Заявку уже нельзя отменить — её статус изменился");
        await load();
        onChanged();
      } else {
        setCancelError(parsed.message);
      }
    } finally {
      setCancelling(false);
    }
  };

  const footer = (
    <>
      {request?.status === "pending_director" && (
        <button
          type="button"
          onClick={() => {
            setCancelError(null);
            setConfirmCancel(true);
          }}
          className="rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive-muted"
        >
          Отменить заявку
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        Закрыть
      </button>
    </>
  );

  return (
    <>
      <ModalShell
        title={`Заявка ${requestNumber(requestId)}`}
        subtitle={request ? <StatusBadge status={request.status} /> : undefined}
        onClose={onClose}
        locked={confirmCancel || cancelling}
        footer={footer}
      >
        {loading && !request ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin text-primary" /> Загрузка…
          </div>
        ) : error || !request ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle size={22} className="text-destructive" />
            <p className="text-sm text-destructive">{error ?? "Не удалось загрузить заявку"}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Повторить
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-background/60 px-3 py-4">
              <RequestTimeline request={request} />
            </div>

            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted p-4 text-sm">
              <div className="col-span-2">
                <dt className="mb-0.5 text-xs text-muted-foreground">Проект</dt>
                <dd className="break-words font-semibold text-foreground">{projectLabel(request.project_name)}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs text-muted-foreground">Создана</dt>
                <dd className="font-medium text-foreground">{formatDateTime(request.created_at)}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs text-muted-foreground">Автор</dt>
                <dd className="font-medium text-foreground">{request.created_by?.name ?? "—"}</dd>
              </div>
              {request.decided_at && (
                <div>
                  <dt className="mb-0.5 text-xs text-muted-foreground">Решение принято</dt>
                  <dd className="font-medium text-foreground">{formatDateTime(request.decided_at)}</dd>
                </div>
              )}
              {request.issued_at && (
                <div>
                  <dt className="mb-0.5 text-xs text-muted-foreground">Выдана</dt>
                  <dd className="font-medium text-foreground">{formatDateTime(request.issued_at)}</dd>
                </div>
              )}
            </dl>

            {(request.status === "rejected" || (request.status === "cancelled" && !!request.reject_reason)) && (
              <div className="rounded-xl border border-destructive/20 bg-destructive-muted px-4 py-3">
                <p className="text-xs font-semibold text-destructive">{request.status === "rejected" ? "Причина отказа" : request.decided_at ? "Причина снятия резерва" : "Причина отмены"}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{request.reject_reason || "Причина не указана"}</p>
              </div>
            )}

            {request.comment && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground">Комментарий</h3>
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground/80">{request.comment}</p>
              </div>
            )}

            <div>
              <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                Позиции ({request.items.length})
                {request.status === "approved" && (request.issued_items_count ?? 0) > 0 && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-400/20 dark:text-green-300">
                    Выдано {request.issued_items_count} из {request.items_count}
                  </span>
                )}
              </h3>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-3 py-2 text-left font-semibold">№</th>
                      <th className="px-3 py-2 text-left font-semibold">Товар</th>
                      <th className="px-3 py-2 text-right font-semibold">Количество</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {request.items.map((item, index) => (
                      <tr key={item.id ?? item.product_id}>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2 text-foreground">
                          {item.name}
                          {item.issued_at && (
                            <span className="mt-0.5 block text-[11px] text-green-700 dark:text-green-300">выдано {formatPartnerDate(item.issued_at)}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-foreground">
                          {item.quantity} {item.unit ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      {confirmCancel && (
        <ConfirmDialog
          title="Отменить заявку?"
          description={`Заявка ${requestNumber(requestId)} будет отменена. Это действие нельзя отменить.`}
          confirmLabel="Отменить заявку"
          cancelLabel="Назад"
          tone="danger"
          loading={cancelling}
          error={cancelError}
          onConfirm={() => void handleCancel()}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </>
  );
}
