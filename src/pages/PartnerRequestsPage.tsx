import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  PARTNER_REQUEST_STATUSES,
  PARTNER_STATUS_LABEL,
  approvePartnerRequest,
  fetchPartnerRequestAdmin,
  fetchPartnerRequestsAdmin,
  issuePartnerRequest,
  parsePartnerError,
  rejectPartnerRequest,
  releasePartnerRequest,
  type InsufficientStockItem,
  type PartnerRequestAdmin,
  type PartnerRequestStatus,
  type StockInconsistentItem,
} from "../api/partner";
import { formatDateTime, formatPartnerDate, projectLabel, requestNumber } from "../lib/partnerRequests";
import { PageWrap } from "../app/components/common/PageWrap";
import { ModalShell } from "../app/components/common/ModalShell";
import { PartnerRequestStatusChip } from "../app/components/common/PartnerRequestStatusChip";
import { ConfirmDialog } from "../app/components/modals/ConfirmDialog";
import { AllocationList } from "../app/components/common/AllocationList";
import { WarehouseChip } from "../app/components/common/WarehouseChip";
import { useNotifications } from "../app/notifications/NotificationsContext";

const PAGE_SIZE = 25;

type StatusFilter = PartnerRequestStatus | "all";
type Action = "approve" | "reject" | "release" | "issue";

// «director» — легаси-алиас commercial_director (см. ProjectPage.tsx).
const isDirectorRole = (role: string) => role === "commercial_director" || role === "director";

// «Заявка №5 · Школа №5 · ТОО «СтройТех»» — что именно подтверждается в диалогах.
function requestSummary(request: PartnerRequestAdmin): string {
  return `Заявка ${requestNumber(request.id)} · проект «${projectLabel(request.project_name)}» · ${request.client.client_name}`;
}

function canDecide(role: string): boolean {
  return isDirectorRole(role) || role === "admin";
}

// Кладовщик выдаёт заявки на странице «Склад» (вкладка «Отгрузка»); здесь «Выдано» только у admin.
function canIssue(role: string): boolean {
  return role === "admin";
}

function defaultStatusFor(role: string): StatusFilter {
  if (isDirectorRole(role)) return "pending_director";
  if (role === "warehouse") return "approved";
  return "all";
}

type ActionProblem =
  | { kind: "insufficient"; message: string; items: InsufficientStockItem[] }
  | { kind: "inconsistent"; message: string; items: StockInconsistentItem[] }
  | { kind: "stale"; message: string };

function ProblemBanner({ problem }: { problem: ActionProblem }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive-muted px-4 py-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
      <div className="min-w-0 text-sm text-destructive">
        <p className="font-medium">{problem.message}</p>
        {problem.kind === "insufficient" && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {problem.items.map((item) => (
              <li key={item.product_id}>
                {item.name}: запрошено {item.requested}, доступно {item.available}
              </li>
            ))}
          </ul>
        )}
        {problem.kind === "inconsistent" && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {problem.items.map((item) => (
              <li key={`${item.product_id}:${item.warehouse_id}`}>
                {item.name} · <WarehouseChip id={item.warehouse_id} name={item.warehouse_name} />: нужно {item.required}, на складе {item.actual}, в резерве {item.reserved}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RequestDetailModal({
  requestId,
  role,
  onClose,
  onChanged,
}: {
  requestId: number;
  role: string;
  onClose: () => void;
  /** Заявка изменилась — родитель перечитывает список */
  onChanged: () => void;
}) {
  const { settlePartnerRequest } = useNotifications();
  const [request, setRequest] = useState<PartnerRequestAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [problem, setProblem] = useState<ActionProblem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequest(await fetchPartnerRequestAdmin(requestId));
    } catch (err) {
      const parsed = parsePartnerError(err);
      setError(parsed.status === 404 ? "Заявка не найдена" : parsed.message);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAction = (next: Action) => {
    setReason("");
    setActionError(null);
    setProblem(null);
    setAction(next);
  };

  const closeAction = () => {
    if (busy) return;
    setAction(null);
  };

  const run = async () => {
    if (!request || !action) return;
    setBusy(true);
    setActionError(null);
    try {
      let updated: PartnerRequestAdmin;
      switch (action) {
        case "approve":
          updated = await approvePartnerRequest(request.id);
          break;
        case "reject":
          updated = await rejectPartnerRequest(request.id, reason.trim());
          break;
        case "release":
          updated = await releasePartnerRequest(request.id, reason.trim() || undefined);
          break;
        case "issue":
          updated = await issuePartnerRequest(request.id);
          break;
      }
      setRequest(updated);
      setAction(null);
      setProblem(null);
      if (action === "approve" || action === "reject") settlePartnerRequest(updated.id);
      toast.success(
        {
          approve: `Заявка ${requestNumber(updated.id)} одобрена`,
          reject: `Заявка ${requestNumber(updated.id)} отклонена`,
          release: `Резерв по заявке ${requestNumber(updated.id)} снят`,
          issue: `Заявка ${requestNumber(updated.id)} отмечена выданной`,
        }[action],
      );
      onChanged();
    } catch (err) {
      const { body } = parsePartnerError(err);
      switch (body.code) {
        case "insufficient_stock":
          setAction(null);
          setProblem({ kind: "insufficient", message: "Недостаточно товара на складе для одобрения заявки:", items: body.items });
          break;
        case "stock_inconsistent":
          setAction(null);
          setProblem({ kind: "inconsistent", message: "Остатки на складе не совпадают с резервом — выдать заявку нельзя:", items: body.items });
          break;
        case "invalid_status": {
          // Кто-то успел раньше: показываем актуальное состояние.
          setAction(null);
          const current = body.current_status ? PARTNER_STATUS_LABEL[body.current_status] : null;
          setProblem({
            kind: "stale",
            message: `Статус заявки уже изменён${current ? ` (сейчас: «${current}»)` : ""} — кто-то обработал её раньше. Данные обновлены.`,
          });
          await load();
          onChanged();
          break;
        }
        case "partially_issued":
          // Часть позиций уже выдана — резерв снять нельзя.
          setAction(null);
          setProblem({
            kind: "stale",
            message: `Нельзя снять резерв: выдано ${body.issued_items_count} из ${body.items_count} позиций. Данные обновлены.`,
          });
          await load();
          onChanged();
          break;
        case "item_already_issued":
        case "unknown_item":
          setAction(null);
          setProblem({ kind: "stale", message: "Состав выданных позиций изменился — кто-то выдал заявку раньше. Данные обновлены." });
          await load();
          onChanged();
          break;
        default:
          setActionError(body.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const status = request?.status;
  const showDecide = request !== null && canDecide(role);
  const hasIssued = request !== null && (request.issued_items_count ?? request.items.filter((it) => it.issued_at).length) > 0;
  const showIssue = request !== null && canIssue(role);

  const footer = (
    <>
      {showDecide && status === "pending_director" && (
        <>
          <button
            type="button"
            onClick={() => openAction("reject")}
            className="rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive-muted"
          >
            Отклонить
          </button>
          <button
            type="button"
            onClick={() => openAction("approve")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Одобрить
          </button>
        </>
      )}
      {showDecide && status === "approved" && hasIssued && (
        <span className="text-xs text-muted-foreground">Часть позиций уже выдана — резерв снять нельзя</span>
      )}
      {showDecide && status === "approved" && !hasIssued && (
        <button
          type="button"
          onClick={() => openAction("release")}
          className="rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive-muted"
        >
          Снять резерв
        </button>
      )}
      {showIssue && status === "approved" && (
        <button
          type="button"
          onClick={() => openAction("issue")}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Выдано
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

  const showAllocations = status === "approved" || status === "issued";
  const reasonLabel = status === "rejected" ? "Причина отказа" : request?.decided_at ? "Причина снятия резерва" : "Причина отмены";
  const showReason = status === "rejected" || (status === "cancelled" && !!request?.reject_reason);

  return (
    <>
      <ModalShell
        title={`Заявка партнёра ${requestNumber(requestId)}`}
        subtitle={request ? <PartnerRequestStatusChip status={request.status} /> : undefined}
        onClose={onClose}
        locked={action !== null || busy}
        footer={request ? footer : undefined}
        maxWidthClass="max-w-3xl"
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
            {problem && <ProblemBanner problem={problem} />}

            <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted p-4 text-sm">
              <div className="col-span-2">
                <dt className="mb-0.5 text-xs text-muted-foreground">Проект</dt>
                <dd className="break-words font-semibold text-foreground">{projectLabel(request.project_name)}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs text-muted-foreground">Компания</dt>
                <dd className="font-medium text-foreground">{request.client.client_name}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs text-muted-foreground">Автор</dt>
                <dd className="font-medium text-foreground">{request.created_by?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs text-muted-foreground">Создана</dt>
                <dd className="font-medium text-foreground">{formatDateTime(request.created_at)}</dd>
              </div>
              {request.decided_at && (
                <div>
                  <dt className="mb-0.5 text-xs text-muted-foreground">Решение</dt>
                  <dd className="font-medium text-foreground">
                    {formatDateTime(request.decided_at)}
                    {request.decided_by ? ` · ${request.decided_by.name}` : ""}
                  </dd>
                </div>
              )}
              {request.issued_at && (
                <div>
                  <dt className="mb-0.5 text-xs text-muted-foreground">Выдана</dt>
                  <dd className="font-medium text-foreground">
                    {formatDateTime(request.issued_at)}
                    {request.issued_by ? ` · ${request.issued_by.name}` : ""}
                  </dd>
                </div>
              )}
            </dl>

            {showReason && (
              <div className="rounded-lg border border-destructive/20 bg-destructive-muted px-4 py-3">
                <p className="text-xs font-semibold text-destructive">{reasonLabel}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{request.reject_reason || "Причина не указана"}</p>
              </div>
            )}

            {request.comment && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground">Комментарий партнёра</h3>
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground/80">{request.comment}</p>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Позиции ({request.items.length})</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-3 py-2 text-left font-semibold">№</th>
                      <th className="px-3 py-2 text-left font-semibold">Товар</th>
                      <th className="px-3 py-2 text-right font-semibold">Количество</th>
                      {showAllocations && <th className="px-3 py-2 text-left font-semibold">Склады</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {request.items.map((item, index) => (
                      <tr key={item.product_id}>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2 text-foreground">
                          {item.name}
                          {item.issued_at && (
                            <span className="mt-0.5 block text-[11px] text-green-700 dark:text-green-300">
                              выдано {formatPartnerDate(item.issued_at)}
                              {item.issued_by ? ` · ${item.issued_by.name}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-foreground">
                          {item.quantity} {item.unit ?? ""}
                        </td>
                        {showAllocations && (
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            <AllocationList allocations={item.allocations} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      {request && action === "approve" && (
        <ConfirmDialog
          tone="primary"
          title="Одобрить заявку?"
          description={`${requestSummary(request)}. Товар будет зарезервирован на складе.`}
          confirmLabel="Одобрить"
          loading={busy}
          error={actionError}
          onConfirm={() => void run()}
          onCancel={closeAction}
        />
      )}

      {request && action === "reject" && (
        <ConfirmDialog
          title="Отклонить заявку?"
          description={`${requestSummary(request)}. Партнёр увидит причину отказа.`}
          confirmLabel="Отклонить"
          loading={busy}
          confirmDisabled={reason.trim().length === 0}
          error={actionError}
          onConfirm={() => void run()}
          onCancel={closeAction}
        >
          <label htmlFor="partner-reject-reason" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Причина отказа (обязательно)
          </label>
          <textarea
            id="partner-reject-reason"
            value={reason}
            rows={3}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </ConfirmDialog>
      )}

      {request && action === "release" && (
        <ConfirmDialog
          title="Снять резерв?"
          description={`${requestSummary(request)}. Заявка будет отменена, зарезервированный товар вернётся в доступный остаток.`}
          confirmLabel="Снять резерв"
          loading={busy}
          error={actionError}
          onConfirm={() => void run()}
          onCancel={closeAction}
        >
          <label htmlFor="partner-release-reason" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Причина (необязательно)
          </label>
          <textarea
            id="partner-release-reason"
            value={reason}
            rows={3}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </ConfirmDialog>
      )}

      {request && action === "issue" && (
        <ConfirmDialog
          tone="primary"
          title="Отметить заявку выданной?"
          description={`${requestSummary(request)}. Убедитесь, что товар отгружен со складов:`}
          confirmLabel="Выдано"
          loading={busy}
          error={actionError}
          onConfirm={() => void run()}
          onCancel={closeAction}
        >
          <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
            {request.items.filter((item) => !item.issued_at).map((item) => (
              <li key={item.id}>
                <p className="font-medium text-foreground">
                  {item.name} — {item.quantity} {item.unit ?? ""}
                </p>
                <AllocationList allocations={item.allocations} layout="list" unit={item.unit} />
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </>
  );
}

export function PartnerRequestsPage({
  role,
  initialRequestId,
  onInitialRequestHandled,
}: {
  role: string;
  /** Заявка, которую нужно открыть сразу (клик по уведомлению) */
  initialRequestId?: number | null;
  onInitialRequestHandled?: () => void;
}) {
  const { lastArrived } = useNotifications();

  const [status, setStatus] = useState<StatusFilter>(() => defaultStatusFor(role));
  const [clientId, setClientId] = useState<number | "all">("all");
  // Поиск по названию проекта и компании: searchInput — то, что вводит
  // пользователь, query — значение после дебаунса 250 мс, уходящее в q.
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  // Компании для фильтра собираются из уже загруженных заявок: отдельный
  // справочник партнёров складу/директору не гарантирован.
  const [companies, setCompanies] = useState<Map<number, string>>(new Map());
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [rows, setRows] = useState<PartnerRequestAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const page = await fetchPartnerRequestsAdmin({
          ...(status !== "all" ? { status } : {}),
          ...(clientId !== "all" ? { client_id: clientId } : {}),
          ...(query ? { q: query } : {}),
          limit: PAGE_SIZE,
          offset,
        });
        if (seq !== requestSeq.current) return;
        if (page.items.length === 0 && page.total > 0 && offset > 0) {
          setOffset(Math.max(0, (Math.ceil(page.total / PAGE_SIZE) - 1) * PAGE_SIZE));
          return;
        }
        setRows(page.items);
        setTotal(page.total);
        setCompanies((prev) => {
          const next = new Map(prev);
          page.items.forEach((r) => next.set(r.client.id, r.client.client_name));
          return next;
        });
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(parsePartnerError(err).message);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [status, clientId, query, offset],
  );

  useEffect(() => {
    void load(false);
  }, [load, reloadKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setQuery((prev) => {
        if (prev !== next) setOffset(0);
        return next;
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Новая заявка / отмена партнёром / «к выдаче» — перечитываем список.
  useEffect(() => {
    if (lastArrived && lastArrived.category.startsWith("partner_request")) {
      setReloadKey((k) => k + 1);
    }
  }, [lastArrived]);

  useEffect(() => {
    if (initialRequestId != null) {
      setOpenId(initialRequestId);
      onInitialRequestHandled?.();
    }
  }, [initialRequestId, onInitialRequestHandled]);

  const companyOptions = useMemo(
    () => Array.from(companies.entries()).sort((a, b) => a[1].localeCompare(b[1], "ru")),
    [companies],
  );

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);

  const statusButtons: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Все" },
    ...PARTNER_REQUEST_STATUSES.map((s) => ({ key: s, label: PARTNER_STATUS_LABEL[s] })),
  ];

  return (
    <PageWrap
      title="Заявки партнёров"
      subtitle="Заявки внешних компаний на товары со склада"
      actions={
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Обновить
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {statusButtons.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => {
                setStatus(b.key);
                setOffset(0);
              }}
              className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                status === b.key ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Проект или компания…"
            aria-label="Поиск по названию проекта и компании"
            className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-xs focus:border-primary focus:outline-none"
          />
        </div>

        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value === "all" ? "all" : Number(e.target.value));
            setOffset(0);
          }}
          aria-label="Компания"
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
        >
          <option value="all">Все компании</option>
          {companyOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={24} className="mb-2 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Загрузка заявок…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <AlertCircle size={22} className="text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void load(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Повторить
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Inbox size={22} className="text-muted-foreground/50" />
            Заявок не найдено — измените фильтры или поисковый запрос
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-background/60">
                  {["№", "Проект", "Компания", "Дата", "Статус", "Позиций", "Комментарий"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    onClick={() => setOpenId(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(row.id);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-background/60 focus:bg-background/60 focus:outline-none"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-medium text-foreground">{requestNumber(row.id)}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-sm font-medium text-foreground" title={row.project_name ?? undefined}>{projectLabel(row.project_name)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.client.client_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{formatDateTime(row.created_at)}</td>
                    <td className="px-4 py-3"><PartnerRequestStatusChip status={row.status} /></td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.items.length}</td>
                    <td className="max-w-[300px] truncate px-4 py-3 text-sm text-muted-foreground" title={row.comment ?? undefined}>
                      {row.comment || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {from}–{to} из {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft size={13} /> Назад
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total || loading}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              Вперёд <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {openId !== null && (
        <RequestDetailModal
          requestId={openId}
          role={role}
          onClose={() => setOpenId(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </PageWrap>
  );
}

export default PartnerRequestsPage;
