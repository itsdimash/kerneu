import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, PackageSearch, Plus, RefreshCw, Search } from "lucide-react";
import {
  PARTNER_STOCK_SORTS,
  fetchPartnerStocks,
  parsePartnerError,
  type PartnerStockItem,
  type PartnerStockSort,
} from "../../api/partner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../app/components/ui/select";
import { Skeleton } from "../../app/components/ui/skeleton";
import { AvailabilityBadge, CARD, FOCUS_RING, QtyStepper } from "./partnerUi";
import { WarehouseChip, WarehouseMoreChip } from "../../app/components/common/WarehouseChip";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 250;
const AUTO_REFRESH_MS = 60_000;
// Больше трёх складов: первые три чипа и «+N ещё» (полный список в подсказке).
const MAX_WAREHOUSE_CHIPS = 3;

const SORT_STORAGE_KEY = "kerneu:partner-catalog-sort";

const SORT_LABELS: Record<PartnerStockSort, string> = {
  name_asc: "Название: А → Я",
  name_desc: "Название: Я → А",
  available_desc: "Доступно: больше",
  available_asc: "Доступно: меньше",
};

function isSort(value: string | null): value is PartnerStockSort {
  return PARTNER_STOCK_SORTS.some((s) => s === value);
}

// Выбранная сортировка живёт в sessionStorage: переживает F5; повреждённое значение игнорируем.
function readStoredSort(): PartnerStockSort {
  try {
    const raw = sessionStorage.getItem(SORT_STORAGE_KEY);
    return isSort(raw) ? raw : "name_asc";
  } catch {
    return "name_asc";
  }
}

export type DraftQuantities = ReadonlyMap<number, string>;

type Props = {
  /** product_id → количество в заявке (строкой) */
  draft: DraftQuantities;
  limitReached: boolean;
  submitting: boolean;
  onAdd: (item: PartnerStockItem) => void;
  onSetQuantity: (productId: number, quantity: string) => void;
  onRemove: (productId: number) => void;
  /** Свежий остаток по загруженным товарам — заявка подтягивает «доступно» */
  onStockLoaded: (items: PartnerStockItem[]) => void;
  /** Меняется, когда нужно перечитать каталог (например, после 409) */
  refreshKey: number;
  onNoCompany: () => void;
};


function SortHeader({
  label,
  sort,
  asc,
  desc,
  firstClick,
  onSelect,
}: {
  label: string;
  sort: PartnerStockSort;
  asc: PartnerStockSort;
  desc: PartnerStockSort;
  /** Направление после первого клика по неактивной колонке; дальше направления чередуются */
  firstClick: "asc" | "desc";
  onSelect: (next: PartnerStockSort) => void;
}) {
  const active = sort === asc || sort === desc;
  const first = firstClick === "asc" ? asc : desc;
  const second = firstClick === "asc" ? desc : asc;
  return (
    <button
      type="button"
      onClick={() => onSelect(sort === first ? second : first)}
      aria-label={`Сортировать по столбцу «${label}»`}
      aria-sort={active ? (sort === asc ? "ascending" : "descending") : "none"}
      className={`group inline-flex w-fit items-center gap-1 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-foreground ${active ? "text-foreground" : ""} ${FOCUS_RING}`}
    >
      {label}
      {active ? (
        sort === asc ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
      ) : (
        <ArrowUpDown size={12} className="opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}

export function PartnerCatalog({
  draft,
  limitReached,
  submitting,
  onAdd,
  onSetQuantity,
  onRemove,
  onStockLoaded,
  refreshKey,
  onNoCompany,
}: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const [sort, setSortState] = useState<PartnerStockSort>(readStoredSort);

  const changeSort = (next: PartnerStockSort) => {
    setSortState(next);
    setOffset(0);
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      /* не критично */
    }
  };

  const [items, setItems] = useState<PartnerStockItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const seq = useRef(0);
  const onStockLoadedRef = useRef(onStockLoaded);
  onStockLoadedRef.current = onStockLoaded;
  const onNoCompanyRef = useRef(onNoCompany);
  onNoCompanyRef.current = onNoCompany;

  // Дебаунс поиска; смена запроса возвращает на первую страницу.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setQuery((prev) => {
        if (prev !== next) setOffset(0);
        return next;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // silent — автообновление и ручное «Обновить»: список и позиция остаются на месте.
  const load = useCallback(
    async (silent: boolean) => {
      const current = ++seq.current;
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const page = await fetchPartnerStocks({
          ...(query ? { q: query } : {}),
          in_stock_only: inStockOnly,
          sort,
          limit: PAGE_SIZE,
          offset,
        });
        if (current !== seq.current) return;
        if (page.items.length === 0 && page.total > 0 && offset > 0) {
          setOffset(Math.max(0, (Math.ceil(page.total / PAGE_SIZE) - 1) * PAGE_SIZE));
          return;
        }
        setItems(page.items);
        setTotal(page.total);
        setError(null);
        setUpdatedAt(new Date());
        onStockLoadedRef.current(page.items);
      } catch (err) {
        if (current !== seq.current) return;
        const parsed = parsePartnerError(err);
        if (parsed.body.code === "no_company") {
          onNoCompanyRef.current();
          return;
        }
        // При тихом обновлении оставляем старый список, а не затираем его ошибкой.
        if (!silent) setError(parsed.message);
      } finally {
        if (current === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [query, inStockOnly, sort, offset],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // Перечитывание по внешнему сигналу (после 409) — без мигания списка.
  const firstRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== firstRefreshKey.current) void load(true);
  }, [refreshKey, load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + items.length, total);

  return (
    <section aria-label="Каталог склада" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по названию товара…"
            aria-label="Поиск по каталогу"
            className={`h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm transition-shadow duration-150 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
          />
        </div>

        <label className="flex h-11 cursor-pointer select-none items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 text-sm text-foreground transition-colors duration-150 hover:bg-accent/50">
          <button
            type="button"
            role="switch"
            aria-checked={inStockOnly}
            aria-label="Только в наличии"
            onClick={() => {
              setInStockOnly((v) => !v);
              setOffset(0);
            }}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${FOCUS_RING} ${inStockOnly ? "bg-gradient-to-r from-primary to-violet-600" : "bg-switch-background"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${inStockOnly ? "left-[18px]" : "left-0.5"}`}
            />
          </button>
          Только в наличии
        </label>

        <Select value={sort} onValueChange={(v) => { if (isSort(v)) changeSort(v); }}>
          <SelectTrigger
            aria-label="Сортировка"
            className="h-11 w-auto min-w-[200px] gap-2 rounded-xl border-border bg-card px-3.5 text-sm text-foreground max-sm:w-full"
          >
            <ArrowUpDown className="text-muted-foreground" />
            <SelectValue placeholder="Сортировка" className="flex-1 justify-start text-left" />
          </SelectTrigger>
          <SelectContent>
            {PARTNER_STOCK_SORTS.map((value) => (
              <SelectItem key={value} value={value}>
                {SORT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          aria-label="Обновить остатки"
          className={`flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:opacity-50 ${FOCUS_RING}`}
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="hidden grid-cols-[minmax(0,1.5fr)_48px_112px_minmax(0,1fr)_132px] items-center gap-4 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <SortHeader label="Товар" sort={sort} asc="name_asc" desc="name_desc" firstClick="asc" onSelect={changeSort} />
          <span>Ед.</span>
          <SortHeader label="Доступно" sort={sort} asc="available_asc" desc="available_desc" firstClick="desc" onSelect={changeSort} />
          <span>Склад</span>
          <span className="text-right">Заявка</span>
        </div>

        {loading && items.length === 0 ? (
          <div className="divide-y divide-border" aria-busy="true" aria-label="Загрузка каталога">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-12 md:block" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="hidden h-6 w-40 md:block" />
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <AlertCircle size={24} className="text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void load(false)}
              className={`rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted ${FOCUS_RING}`}
            >
              Повторить
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
              <PackageSearch size={22} />
            </div>
            <p className="text-sm font-medium text-foreground">Ничего не найдено</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {query ? "Попробуйте изменить запрос" : inStockOnly ? "Сейчас на складе нет товаров в наличии" : "Каталог пока пуст"}
              {inStockOnly && query ? " или отключить фильтр «Только в наличии»" : ""}.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const inDraft = draft.get(item.product_id);
              const outOfStock = item.available_quantity <= 0;
              const stocked = item.warehouses.filter((w) => w.available_quantity > 0);
              return (
                <li
                  key={item.product_id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors duration-150 hover:bg-accent/30 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_48px_112px_minmax(0,1fr)_132px] ${
                    inDraft !== undefined ? "bg-accent/40" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium leading-snug text-foreground">{item.name}</p>
                  </div>

                  <span className="hidden text-xs text-muted-foreground md:block">{item.unit ?? "—"}</span>

                  <div className="order-3 md:order-none">
                    <AvailabilityBadge quantity={item.available_quantity} unit={item.unit} />
                  </div>

                  <div className="order-4 col-span-2 flex flex-wrap gap-1.5 md:order-none md:col-span-1">
                    {stocked.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <>
                        {stocked.slice(0, MAX_WAREHOUSE_CHIPS).map((w) => (
                          // Один склад — число уже в колонке «Доступно»; при нескольких показываем разбивку.
                          <WarehouseChip
                            key={w.warehouse_id}
                            id={w.warehouse_id}
                            name={w.warehouse_name}
                            quantity={stocked.length > 1 ? w.available_quantity : null}
                          />
                        ))}
                        {stocked.length > MAX_WAREHOUSE_CHIPS && (
                          <WarehouseMoreChip
                            count={stocked.length - MAX_WAREHOUSE_CHIPS}
                            title={stocked.map((w) => `${w.warehouse_name}: ${w.available_quantity.toLocaleString("ru-RU")}`).join("\n")}
                            ariaLabel={`Ещё складов: ${stocked.length - MAX_WAREHOUSE_CHIPS}. ${stocked.map((w) => `${w.warehouse_name}: ${w.available_quantity}`).join(", ")}`}
                            className={FOCUS_RING}
                          />
                        )}
                      </>
                    )}
                  </div>

                  <div className="order-2 flex justify-end md:order-none">
                    {inDraft !== undefined ? (
                      <QtyStepper
                        value={inDraft}
                        max={item.available_quantity}
                        label={item.name}
                        disabled={submitting}
                        onChange={(q) => onSetQuantity(item.product_id, q)}
                        onRemove={() => onRemove(item.product_id)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(item)}
                        disabled={outOfStock || limitReached || submitting}
                        title={limitReached ? "Достигнут максимум позиций в заявке" : outOfStock ? "Нет в наличии" : undefined}
                        aria-label={`Добавить в заявку: ${item.name}`}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-violet-600 px-3.5 text-sm font-medium text-white shadow-sm transition-all duration-150 enabled:hover:brightness-110 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none ${FOCUS_RING}`}
                      >
                        <Plus size={14} /> В заявку
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!error && total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {from}–{to} из {total.toLocaleString("ru-RU")}
            {updatedAt && ` · обновлено в ${updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}
            {loading && <Loader2 size={12} className="ml-1.5 inline animate-spin" />}
          </span>
          {total > PAGE_SIZE && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0 || loading}
                className={`flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40 ${FOCUS_RING}`}
              >
                <ChevronLeft size={13} /> Назад
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
                className={`flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40 ${FOCUS_RING}`}
              >
                Вперёд <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
