import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, ClipboardList, Package, RefreshCw, Search } from "lucide-react";
import {
  PARTNER_REQUEST_STATUSES,
  PARTNER_STATUS_LABEL,
  type PartnerRequestStatus,
} from "../../api/partner";
import { formatDateTime, projectLabel, requestNumber } from "../../lib/partnerRequests";
import { Skeleton } from "../../app/components/ui/skeleton";
import { PartnerRequestDetailModal } from "./PartnerRequestDetailModal";
import type { PartnerRequestsState } from "./usePartnerRequests";
import { BRAND_GRADIENT, CARD, FOCUS_RING, StatusBadge } from "./partnerUi";

const PAGE_SIZE = 20;

type StatusFilter = PartnerRequestStatus | "all";

export function PartnerRequestsList({
  data,
  focusRequestId,
  onFocusHandled,
  onNoCompany,
  onGoCatalog,
}: {
  data: PartnerRequestsState;
  /** Заявка, которую нужно сразу открыть (клик по уведомлению) */
  focusRequestId: number | null;
  onFocusHandled: () => void;
  onNoCompany: () => void;
  onGoCatalog: () => void;
}) {
  const { items, total, truncated, loading, error, reload } = data;
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (focusRequestId !== null) {
      setOpenId(focusRequestId);
      onFocusHandled();
    }
  }, [focusRequestId, onFocusHandled]);

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = {
      all: items.length,
      pending_director: 0,
      approved: 0,
      issued: 0,
      rejected: 0,
      cancelled: 0,
    };
    items.forEach((r) => {
      map[r.status] += 1;
    });
    return map;
  }, [items]);

  // Поиск по названию проекта — на клиенте, среди уже загруженных заявок.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (q === "" || (r.project_name ?? "").toLowerCase().includes(q)),
    );
  }, [items, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const handleChanged = useCallback(() => void reload(true), [reload]);

  const chips: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Все" },
    ...PARTNER_REQUEST_STATUSES.map((s) => ({ key: s, label: PARTNER_STATUS_LABEL[s] })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Фильтр по статусу" className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1">
          {chips.map((chip) => {
            const active = filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setFilter(chip.key);
                  setPage(0);
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${FOCUS_RING} ${
                  active
                    ? "border-transparent bg-foreground text-background shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {chip.label}
                {!loading && (
                  <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${active ? "bg-background/20" : "bg-muted"}`}>
                    {counts[chip.key]}
                    {truncated && chip.key === "all" ? "+" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void reload(true)}
          disabled={loading}
          aria-label="Обновить список заявок"
          className={`flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50 ${FOCUS_RING}`}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Обновить
        </button>
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Поиск по названию проекта…"
          aria-label="Поиск по названию проекта"
          className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm transition-shadow placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {loading && items.length === 0 ? (
          <div className="divide-y divide-border" aria-busy="true" aria-label="Загрузка заявок">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <AlertCircle size={24} className="text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void reload(false)}
              className={`rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted ${FOCUS_RING}`}
            >
              Повторить
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm ${BRAND_GRADIENT}`}>
              <ClipboardList size={26} />
            </div>
            <p className="text-base font-semibold text-foreground">У вас пока нет заявок</p>
            <p className="max-w-xs text-sm text-muted-foreground">Создайте первую заявку на вкладке «Склад»: выберите товары из каталога и отправьте.</p>
            <button
              type="button"
              onClick={onGoCatalog}
              className={`mt-1 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.97] ${BRAND_GRADIENT} ${FOCUS_RING}`}
            >
              <Package size={15} /> Перейти к складу
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-muted-foreground">Ничего не найдено — измените статус или поисковый запрос</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className={`group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-accent/40 sm:px-5 ${FOCUS_RING} focus-visible:ring-inset`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-foreground">
                    {row.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-foreground">{projectLabel(row.project_name)}</span>
                      <span className="text-xs font-medium text-muted-foreground">Заявка {requestNumber(row.id)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {formatDateTime(row.created_at)} · {row.items.length} поз.
                      {row.status === "approved" && (row.issued_items_count ?? 0) > 0 && ` · выдано ${row.issued_items_count} из ${row.items_count}`}
                      {row.comment ? ` · ${row.comment}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={row.status} />
                  <ChevronRight size={16} className="shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {truncated && !loading && (
        <p className="text-xs text-muted-foreground">Показаны последние {items.length} из {total} заявок.</p>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} из {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className={`flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40 ${FOCUS_RING}`}
            >
              <ChevronLeft size={13} /> Назад
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              className={`flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40 ${FOCUS_RING}`}
            >
              Вперёд <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {openId !== null && (
        <PartnerRequestDetailModal
          requestId={openId}
          onClose={() => setOpenId(null)}
          onChanged={handleChanged}
          onNoCompany={onNoCompany}
        />
      )}
    </div>
  );
}
