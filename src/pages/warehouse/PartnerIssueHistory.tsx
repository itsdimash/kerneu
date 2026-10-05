import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, User } from "lucide-react";
import { fetchPartnerRequestsAdmin, parsePartnerError, type PartnerRequestAdmin, type PartnerRequestAdminItem } from "../../api/partner";
import { formatPartnerDate, parsePartnerDate, requestNumber } from "../../lib/partnerRequests";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../app/components/ui/accordion";
import { PARTNER_VIEW_ROLES } from "./PartnerIssueSection";
import { AllocationList } from "../../app/components/common/AllocationList";
import { onPartnerIssued } from "./partnerIssueEvents";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 250;

function timeOf(value: string | null): number {
  if (!value) return 0;
  const time = parsePartnerDate(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// Выданные позиции заявки (в истории показываем только их).
function issuedItems(request: PartnerRequestAdmin): PartnerRequestAdminItem[] {
  return request.items.filter((it) => it.issued_at !== null);
}

// Самая поздняя выдача по заявке: у частично выданной заявки issued_at самой заявки ещё пуст.
function lastIssuedAt(request: PartnerRequestAdmin): string | null {
  let best: string | null = request.issued_at;
  for (const it of request.items) {
    if (it.issued_at && timeOf(it.issued_at) > timeOf(best)) best = it.issued_at;
  }
  return best;
}

// Партнёрские заявки с выданными позициями (has_issued=true, в том числе частично выданные) внутри блока «История отгрузок»: строки в том же
// виде, что и у проектов, сразу под строками проектов. Свои пагинация (по 10) и
// сортировка по issued_at (новые сверху) — слияние по датам с проектной
// историей рискованно из-за пагинации. Поиск берётся из поля вкладки
// «Поиск по товару…» и уходит на бэкенд как q (проект или компания).
// Для остальных ролей не рендерится и не делает запросов.
export function PartnerShipmentHistoryRows({
  role,
  search,
  onCountChange,
}: {
  role: string;
  search: string;
  /** Число показанных партнёрских строк истории; при размонтировании — 0 */
  onCountChange?: (count: number) => void;
}) {
  if (!PARTNER_VIEW_ROLES.includes(role)) return null;
  return <HistoryRows search={search} onCountChange={onCountChange} />;
}

function HistoryRows({ search, onCountChange }: { search: string; onCountChange?: (count: number) => void }) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<PartnerRequestAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const current = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPartnerRequestsAdmin({
        has_issued: true,
        ...(query ? { q: query } : {}),
        limit: PAGE_SIZE,
        offset,
      });
      if (current !== seq.current) return;
      if (page.items.length === 0 && page.total > 0 && offset > 0) {
        setOffset(Math.max(0, (Math.ceil(page.total / PAGE_SIZE) - 1) * PAGE_SIZE));
        return;
      }
      setRows(page.items);
      setTotal(page.total);
    } catch (err) {
      if (current !== seq.current) return;
      setError(parsePartnerError(err).message);
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [query, offset]);

  // Ленивая загрузка: компонент монтируется, когда блок «История отгрузок» впервые рисуется для роли.
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // Выдача в блоке «к выдаче» делает историю устаревшей — перечитываем.
  useEffect(() => onPartnerIssued(() => setReloadKey((k) => k + 1)), []);

  // Дебаунс поискового поля вкладки; смена запроса возвращает на первую страницу.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      setQuery((prev) => {
        if (prev !== next) setOffset(0);
        return next;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const sorted = useMemo(() => [...rows].sort((a, b) => timeOf(lastIssuedAt(b)) - timeOf(lastIssuedAt(a))), [rows]);

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  useEffect(() => {
    onCountChangeRef.current?.(sorted.length);
  }, [sorted.length]);
  useEffect(() => () => onCountChangeRef.current?.(0), []);

  if (sorted.length === 0 && !error) return null;

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);

  return (
    <div className="border-t border-border" aria-busy={loading}>
      {error && (
        <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 p-4 dark:border-red-400/25 dark:bg-red-400/15">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm text-red-700 dark:text-red-300">Выдачи партнёрам: {error}</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="text-xs font-medium text-primary hover:underline">
            Повторить
          </button>
        </div>
      )}

      <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="flex flex-col">
        {sorted.map((request) => {
          const key = String(request.id);
          const done = issuedItems(request);
          return (
            <AccordionItem key={key} value={key} className="border-border">
              <AccordionTrigger className="items-center gap-3 rounded-none bg-background/60 px-4 py-3.5 transition-colors hover:bg-muted/50 hover:no-underline [&>svg]:order-first [&>svg]:translate-y-0">
                <span className="flex flex-1 flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="break-words text-sm font-bold text-foreground">
                      {request.project_name?.trim() ? request.project_name : "Без названия"}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {request.client.client_name} · 1 отгрузка · {done.length} позиций
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-400/20 dark:text-green-300">
                      <CheckCircle2 size={12} /> отгружено {done.length}
                    </span>
                    <span className="whitespace-nowrap text-xs font-normal text-muted-foreground">{formatPartnerDate(lastIssuedAt(request))}</span>
                  </span>
                </span>
              </AccordionTrigger>

              <AccordionContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-background/60">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Заявка</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Товар</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Количество</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Склады</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Отгрузил</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {done.map((item, index) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{index === 0 ? requestNumber(request.id) : ""}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-foreground">
                            {item.quantity} {item.unit ?? ""}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            <AllocationList allocations={item.allocations} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatPartnerDate(item.issued_at)}</td>
                          <td className="px-4 py-3 text-xs">
                            {item.issued_by ? (
                              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                                <User size={12} className="text-muted-foreground" />
                                {item.issued_by.name}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            Выдачи партнёрам: {from}–{to} из {total}
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
    </div>
  );
}
