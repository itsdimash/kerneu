import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, FileText, Loader2, PackageCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  downloadPartnerRequestList,
  fetchPartnerRequestsAdmin,
  isNotFoundError,
  issuePartnerRequest,
  parsePartnerError,
  type PartnerRequestAdmin,
  type PartnerRequestAdminItem,
  type StockInconsistentItem,
} from "../../api/partner";
import type { WarehouseInfo } from "../../api/api";
import { formatDateTime, formatPartnerDate, projectLabel, requestNumber } from "../../lib/partnerRequests";
import { ConfirmDialog } from "../../app/components/modals/ConfirmDialog";
import { AllocationList } from "../../app/components/common/AllocationList";
import { WarehouseChip } from "../../app/components/common/WarehouseChip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../app/components/ui/accordion";
import { useNotifications } from "../../app/notifications/NotificationsContext";
import { emitPartnerIssued } from "./partnerIssueEvents";

// Одобренные заявки грузятся одной страницей: как и проекты «к сборке», они идут общим списком без пагинации.
const LIST_LIMIT = 100;

// Выдавать партнёрские заявки может склад и admin; директор видит блок только для просмотра.
export const PARTNER_VIEW_ROLES = ["warehouse", "admin", "commercial_director", "director"];
const ISSUE_ROLES = ["warehouse", "admin"];

type Problem =
  | { kind: "inconsistent"; title: string; items: StockInconsistentItem[] }
  | { kind: "message"; title: string; text: string };

function requestSummary(request: PartnerRequestAdmin): string {
  return `Заявка ${requestNumber(request.id)} · проект «${projectLabel(request.project_name)}» · ${request.client.client_name}`;
}

const isPending = (item: PartnerRequestAdminItem) => !item.issued_at;

function matchesSearch(request: PartnerRequestAdmin, q: string): PartnerRequestAdmin | null {
  if (!q) return request;
  const head = `${request.project_name ?? ""} ${request.client.client_name}`.toLowerCase();
  if (head.includes(q)) return request;
  const items = request.items.filter((it) => it.name.toLowerCase().includes(q));
  return items.length > 0 ? { ...request, items } : null;
}

// Партнёрские заявки «к выдаче» — карточки в стиле проектов на вкладке «Отгрузка»
// (свёрнуты, шеврон слева, «N позиций к сборке», «Список», «Список KAR/AB», бейдж
// «Зарезервировано», чекбоксы у позиций и «Выдать выбранные»).
// Для остальных ролей (pm и др.) не рендерится и не делает запросов: внешний
// компонент возвращает null до того, как подключатся хуки с загрузкой.
export function PartnerIssueSection({
  role,
  focusRequestId,
  search,
  warehouses,
  onIssued,
  onCountChange,
}: {
  role: string;
  /** Заявка, которую нужно раскрыть и подсветить (клик по уведомлению) */
  focusRequestId?: number | null;
  /** Значение поля «Поиск по товару…» вкладки: фильтрует и партнёрские карточки */
  search?: string;
  /** Склады страницы (те же, что у кнопок «Список KAR/AB» проектов) */
  warehouses?: WarehouseInfo[];
  /** Вызывается после успешной выдачи — страница склада перечитывает остатки */
  onIssued?: () => void;
  /** Число показанных партнёрских карточек (с учётом поиска); при размонтировании — 0 */
  onCountChange?: (count: number) => void;
}) {
  if (!PARTNER_VIEW_ROLES.includes(role)) return null;
  return (
    <PartnerIssueCards
      canIssue={ISSUE_ROLES.includes(role)}
      focusRequestId={focusRequestId ?? null}
      search={search ?? ""}
      warehouses={warehouses ?? []}
      onIssued={onIssued}
      onCountChange={onCountChange}
    />
  );
}

function PartnerIssueCards({
  canIssue,
  focusRequestId,
  search,
  warehouses,
  onIssued,
  onCountChange,
}: {
  canIssue: boolean;
  focusRequestId: number | null;
  search: string;
  warehouses: WarehouseInfo[];
  onIssued?: () => void;
  onCountChange?: (count: number) => void;
}) {
  const { lastArrived } = useNotifications();
  const [rows, setRows] = useState<PartnerRequestAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  // request.id → id отмеченных позиций
  const [selection, setSelection] = useState<Record<number, number[]>>({});

  const [target, setTarget] = useState<{ request: PartnerRequestAdmin; items: PartnerRequestAdminItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const seq = useRef(0);
  const itemRefs = useRef(new Map<number, HTMLDivElement>());
  const onIssuedRef = useRef(onIssued);
  onIssuedRef.current = onIssued;

  const load = useCallback(async () => {
    const current = ++seq.current;
    setError(null);
    try {
      const page = await fetchPartnerRequestsAdmin({ status: "approved", limit: LIST_LIMIT, offset: 0 });
      if (current !== seq.current) return;
      // Полностью выданная заявка (все позиции) в «к сборке» не нужна.
      setRows(page.items.filter((r) => r.items.some(isPending)));
      setTotal(page.total);
      setLoadedCount(page.items.length);
    } catch (err) {
      if (current !== seq.current) return;
      setError(parsePartnerError(err).message);
    }
  }, []);

  // Вход на вкладку (монтирование) и reloadKey (уведомление/после выдачи).
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // Входящее уведомление о партнёрской заявке (в т.ч. partner_request_to_issue) — перечитываем.
  useEffect(() => {
    if (lastArrived && lastArrived.category.startsWith("partner_request")) {
      setReloadKey((k) => k + 1);
    }
  }, [lastArrived]);

  // Клик по уведомлению: раскрываем карточку, прокручиваем и подсвечиваем.
  useEffect(() => {
    if (focusRequestId === null) return;
    const key = String(focusRequestId);
    if (!rows.some((r) => r.id === focusRequestId)) return;
    setExpanded((prev) => (prev.includes(key) ? prev : [...prev, key]));
    const timer = setTimeout(() => {
      itemRefs.current.get(focusRequestId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(focusRequestId);
    }, 150);
    const clear = setTimeout(() => setHighlightId(null), 2800);
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [focusRequestId, rows]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () => rows.map((r) => matchesSearch(r, q)).filter((r): r is PartnerRequestAdmin => r !== null),
    [rows, q],
  );

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  useEffect(() => {
    onCountChangeRef.current?.(visible.length);
  }, [visible.length]);
  useEffect(() => () => onCountChangeRef.current?.(0), []);

  // Как у проектов: при поиске совпавшие карточки раскрыты.
  const accordionValue = useMemo(
    () => (q ? Array.from(new Set([...expanded, ...visible.map((r) => String(r.id))])) : expanded),
    [q, expanded, visible],
  );

  // Отмеченные позиции, которые всё ещё не выданы (после перезагрузки лишнее отсеивается).
  const selectedItems = (request: PartnerRequestAdmin): PartnerRequestAdminItem[] => {
    const ids = new Set(selection[request.id] ?? []);
    return request.items.filter((it) => isPending(it) && ids.has(it.id));
  };

  const toggleItem = (requestId: number, itemId: number) =>
    setSelection((prev) => {
      const current = prev[requestId] ?? [];
      return { ...prev, [requestId]: current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId] };
    });

  const toggleAll = (request: PartnerRequestAdmin) =>
    setSelection((prev) => {
      const pendingIds = request.items.filter(isPending).map((it) => it.id);
      const current = prev[request.id] ?? [];
      const allSelected = pendingIds.length > 0 && pendingIds.every((id) => current.includes(id));
      return { ...prev, [request.id]: allSelected ? [] : pendingIds };
    });

  const handleDownload = async (request: PartnerRequestAdmin, warehouse?: WarehouseInfo) => {
    const key = `${request.id}:${warehouse?.id ?? "all"}`;
    setDownloading(key);
    try {
      await downloadPartnerRequestList(request.id, {
        warehouseId: warehouse?.id,
        projectName: request.project_name,
        warehouseName: warehouse?.name,
      });
    } catch (err) {
      if (isNotFoundError(err)) toast.error("Нет позиций для списка");
      else toast.error("Не удалось скачать список на выдачу");
    } finally {
      setDownloading((current) => (current === key ? null : current));
    }
  };

  const handleIssue = async () => {
    if (!target) return;
    const { request, items } = target;
    setBusy(true);
    setActionError(null);
    try {
      const done = await issuePartnerRequest(request.id, items.map((it) => it.id));
      const issuedNow = items.length;
      toast.success(
        done.issued_items_count >= done.items_count
          ? `Заявка ${requestNumber(done.id)} выдана полностью`
          : `Выдано ${issuedNow} поз. заявки ${requestNumber(done.id)}: ${done.issued_items_count} из ${done.items_count}`,
      );
      setTarget(null);
      setProblem(null);
      setSelection((prev) => ({ ...prev, [request.id]: [] }));
      setReloadKey((k) => k + 1);
      emitPartnerIssued();
      onIssuedRef.current?.();
    } catch (err) {
      const { body } = parsePartnerError(err);
      const title = requestSummary(request);
      switch (body.code) {
        case "stock_inconsistent":
          setTarget(null);
          setProblem({ kind: "inconsistent", title, items: body.items });
          break;
        case "invalid_status":
          // Кто-то успел раньше — список перечитываем.
          setTarget(null);
          setProblem({ kind: "message", title, text: "Статус заявки уже изменён — кто-то обработал её раньше. Список обновлён." });
          setReloadKey((k) => k + 1);
          break;
        case "item_already_issued":
          // Не выдано ничего: обновляем карточку и сообщаем.
          setTarget(null);
          setProblem({ kind: "message", title, text: "Часть выбранных позиций уже выдана — ничего не выдано. Карточка обновлена, проверьте выбор." });
          setReloadKey((k) => k + 1);
          break;
        case "unknown_item":
          setTarget(null);
          setProblem({ kind: "message", title, text: "Некоторых выбранных позиций нет в заявке. Карточка обновлена, проверьте выбор." });
          setReloadKey((k) => k + 1);
          break;
        default:
          setActionError(body.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const thCls = "px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide";

  return (
    <>
      {problem && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive-muted px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 text-sm text-destructive">
            <p className="font-medium">{problem.title}</p>
            {problem.kind === "message" ? (
              <p className="mt-0.5">{problem.text}</p>
            ) : (
              <>
                <p className="mt-0.5">Остатки на складе не совпадают с резервом — выдать выбранные позиции нельзя:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {problem.items.map((item) => (
                    <li key={`${item.product_id}:${item.warehouse_id}`}>
                      {item.name} · <WarehouseChip id={item.warehouse_id} name={item.warehouse_name} />: нужно {item.required}, на складе {item.actual}, в резерве {item.reserved}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <button type="button" onClick={() => setProblem(null)} aria-label="Скрыть сообщение" className="shrink-0 text-destructive/70 hover:text-destructive">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <AlertCircle size={16} className="shrink-0 text-destructive" />
          <p className="flex-1 text-sm text-destructive">Партнёрские заявки: {error}</p>
          <button type="button" onClick={() => void load()} className="text-xs font-medium text-primary hover:underline">
            Повторить
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <Accordion type="multiple" value={accordionValue} onValueChange={q ? () => {} : setExpanded} className="mb-4 space-y-4">
          {visible.map((request) => {
            const key = String(request.id);
            const pending = request.items.filter(isPending);
            const chosen = selectedItems(request);
            const pendingIds = pending.map((it) => it.id);
            const allSelected = pendingIds.length > 0 && pendingIds.every((id) => chosen.some((c) => c.id === id));
            const issuedCount = request.issued_items_count ?? request.items.filter((it) => !isPending(it)).length;
            const totalCount = request.items_count ?? request.items.length;
            // Обёртка нужна ради ref (AccordionItem не пробрасывает ref в React 18) и scrollIntoView.
            return (
              <div
                key={key}
                ref={(node: HTMLDivElement | null) => {
                  if (node) itemRefs.current.set(request.id, node);
                  else itemRefs.current.delete(request.id);
                }}
              >
                <AccordionItem
                  value={key}
                  className={`overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow duration-500 last:border-b ${
                    highlightId === request.id ? "border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_20%,transparent)]" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background">
                    <div className="min-w-0 flex-1">
                      <AccordionTrigger className="items-center gap-3 rounded-none px-5 py-3.5 transition-colors hover:bg-muted/50 hover:no-underline [&>svg]:order-first [&>svg]:translate-y-0">
                        <span className="flex flex-1 flex-col text-left">
                          <span className="break-words text-sm font-bold text-foreground">
                            {request.project_name?.trim() ? request.project_name : "Без названия"}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {request.client.client_name} · {pending.length} позиций к сборке
                            {chosen.length > 0 && ` · отмечено ${chosen.length}`}
                          </span>
                        </span>
                      </AccordionTrigger>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pr-5">
                      <button
                        type="button"
                        onClick={() => void handleDownload(request)}
                        disabled={downloading === `${request.id}:all`}
                        title="Распечатать список на выдачу"
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
                      >
                        {downloading === `${request.id}:all` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Список
                      </button>
                      {warehouses.map((wh) => {
                        // Как у проектов: кнопка на каждый склад; здесь недоступна, если на этом складе нечего выдавать.
                        const hasItems = pending.some((it) => (it.allocations ?? []).some((a) => a.warehouse_id === wh.id && a.quantity > 0));
                        const isDownloading = downloading === `${request.id}:${wh.id}`;
                        return (
                          <button
                            key={wh.id}
                            type="button"
                            onClick={() => void handleDownload(request, wh)}
                            disabled={isDownloading || !hasItems}
                            title={hasItems ? `Распечатать список на выдачу по складу «${wh.name}»` : `На складе «${wh.name}» нет невыданных позиций`}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
                          >
                            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                            Список {wh.code}
                          </button>
                        );
                      })}
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                        <PackageCheck size={12} /> Зарезервировано
                      </span>
                      {issuedCount > 0 && issuedCount < totalCount && (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-400/20 dark:text-green-300">
                          Выдано {issuedCount} из {totalCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <AccordionContent className="p-0">
                    <p className="border-b border-border px-5 py-2 text-xs text-muted-foreground">
                      Заявка {requestNumber(request.id)} · одобрена {formatDateTime(request.decided_at)}
                      {request.comment ? ` · комментарий партнёра: ${request.comment}` : ""}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-background/40">
                            <th className={`${thCls} w-10 text-center`}>
                              {canIssue && (
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  disabled={pending.length === 0}
                                  onChange={() => toggleAll(request)}
                                  aria-label="Выбрать все невыданные позиции"
                                  className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                                />
                              )}
                            </th>
                            <th className={`${thCls} text-left`}>Товар</th>
                            <th className={`${thCls} text-center`}>Кол.</th>
                            <th className={`${thCls} text-left`}>Ед.</th>
                            <th className={`${thCls} text-left`}>Взять со склада</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {request.items.map((item) => {
                            const issued = !isPending(item);
                            const checked = chosen.some((c) => c.id === item.id);
                            return (
                              <tr key={item.id} className={`transition-colors ${issued ? "opacity-55" : checked ? "bg-primary/5" : "hover:bg-background/40"}`}>
                                <td className="px-5 py-3 text-center">
                                  {canIssue && !issued && (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleItem(request.id, item.id)}
                                      aria-label={`Отметить: ${item.name}`}
                                      className="h-4 w-4 cursor-pointer accent-primary"
                                    />
                                  )}
                                </td>
                                <td className="px-5 py-3 text-sm text-foreground">
                                  {item.name}
                                  {issued && <span className="mt-0.5 block text-[11px] text-green-700 dark:text-green-300">выдано {formatPartnerDate(item.issued_at)}</span>}
                                </td>
                                <td className="px-5 py-3 text-center font-mono text-sm font-bold text-foreground">{item.quantity}</td>
                                <td className="px-5 py-3 text-xs text-muted-foreground">{item.unit ?? "—"}</td>
                                <td className="px-5 py-3 text-xs text-muted-foreground">
                                  <AllocationList allocations={item.allocations} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {canIssue && (
                      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/40 px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setTarget({ request, items: chosen });
                          }}
                          disabled={chosen.length === 0}
                          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                            chosen.length > 0 ? "cursor-pointer bg-green-600 text-white hover:bg-success/90" : "cursor-not-allowed bg-slate-200 text-muted-foreground"
                          }`}
                        >
                          <PackageCheck size={15} />
                          Выдать выбранные ({chosen.length})
                        </button>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </div>
            );
          })}
        </Accordion>
      )}

      {total > loadedCount && (
        <p className="mb-4 text-xs text-muted-foreground">Показаны первые {loadedCount} из {total} партнёрских заявок к выдаче.</p>
      )}

      {target && (
        <ConfirmDialog
          tone="primary"
          title="Выдать выбранные позиции?"
          description={`${requestSummary(target.request)}. Выбрано позиций: ${target.items.length}. Убедитесь, что товар отгружен со складов:`}
          confirmLabel="Выдать"
          loading={busy}
          error={actionError}
          onConfirm={() => void handleIssue()}
          onCancel={() => {
            if (!busy) setTarget(null);
          }}
        >
          <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
            {target.items.map((item) => (
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
