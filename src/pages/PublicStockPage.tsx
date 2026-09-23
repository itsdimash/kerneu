import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LogOut,
  ArrowUpDown,
  Boxes,
  Building2,
  Check,
  Inbox,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  AlertCircle,
} from "lucide-react";
import { KerneuFullLogo, KerneuLogo } from "../app/components/common/KerneuLogo";
import { fetchWarehouseStocks } from "../api/api";
import type { WarehouseInfo, WarehouseStockResponse } from "../api/api";

/**
 * Страница остатков склада для роли "guest" — единственное, что видит
 * гостевой аккаунт после входа (см. App.tsx). Только чтение, без меню ERP.
 * Данные — тот же GET /warehouse/stocks, что и у WarehousePage (запрос идёт
 * с cookie сессии guest). supplier_name приходит в ответе, но не выводится.
 */
const AUTO_REFRESH_MS = 60_000;

type StockQuantityField = "total" | "reserved" | "defective" | "available";

const STOCK_SORT_OPTIONS: { field: StockQuantityField; label: string }[] = [
  { field: "total", label: "Всего" },
  { field: "reserved", label: "В резерве" },
  { field: "defective", label: "Брак" },
  { field: "available", label: "Доступно" },
];

const STOCK_FILTERS: { key: "all" | "low" | "reserved" | "brak"; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "low", label: "Мало (< 50)" },
  { key: "reserved", label: "В резерве" },
  { key: "brak", label: "Есть брак" },
];

const DEFAULT_WAREHOUSES: WarehouseInfo[] = [
  { id: 1, name: "Карабулак", code: "Кар" },
  { id: 2, name: "Абишова", code: "Аб" },
];

type StockRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  perWarehouse: Record<number, number>;
  total: number;
  reserved: number;
  defective: number;
  available: number;
};

function deriveWarehouses(items: WarehouseStockResponse[]): WarehouseInfo[] {
  const found = new Map<number, string>();
  items.forEach((item) => {
    (item.stocks || []).forEach((s) => {
      if (!found.has(s.warehouse_id)) found.set(s.warehouse_id, s.warehouse_name);
    });
  });

  if (found.size === 0) return DEFAULT_WAREHOUSES;

  return Array.from(found.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, name]) => {
      const known = DEFAULT_WAREHOUSES.find((w) => w.id === id);
      return { id, name, code: known?.code || name.slice(0, 3) };
    });
}

function mapStock(item: WarehouseStockResponse): StockRow {
  const perWarehouse: Record<number, number> = {};
  let totalSum = 0;

  (item.stocks || []).forEach((s) => {
    perWarehouse[s.warehouse_id] = s.actual_quantity;
    totalSum += s.actual_quantity;
  });

  const total = item.actual_quantity ?? totalSum;
  const reserved = item.reserved_quantity || 0;

  return {
    id: item.id,
    sku: `P-${item.product_id || item.id}`,
    name: item.name,
    unit: item.unit || "шт",
    perWarehouse,
    total,
    reserved,
    defective: item.defective_quantity || 0,
    available: total - reserved,
  };
}

const fmt = (n: number) => n.toLocaleString("ru-RU");

export function PublicStockPage({ userName, onLogout }: { userName?: string | null; onLogout?: () => void }) {
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(DEFAULT_WAREHOUSES);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "all">("all");

  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [filter, setFilter] = useState<"all" | "low" | "reserved" | "brak">("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<StockQuantityField | null>("available");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchWarehouseStocks();
      setWarehouses(deriveWarehouses(data));
      setStock(data.map(mapStock));
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить остатки склада");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock
      .filter((item) => (selectedWarehouseId === "all" ? true : (item.perWarehouse[selectedWarehouseId] || 0) > 0))
      .filter((item) =>
        filter === "all" ? true :
        filter === "low" ? item.available < 50 :
        filter === "brak" ? item.defective > 0 :
        item.reserved > 0
      )
      .filter((item) => (q === "" ? true : item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => {
        if (!sortField) return 0;
        const diff = a[sortField] - b[sortField];
        return sortDir === "asc" ? diff : -diff;
      });
  }, [stock, selectedWarehouseId, filter, search, sortField, sortDir]);

  const summary = useMemo(() => {
    const inStock = stock.filter((s) => s.total > 0).length;
    const available = stock.reduce((acc, s) => acc + Math.max(s.available, 0), 0);
    const reserved = stock.reduce((acc, s) => acc + s.reserved, 0);
    return { positions: stock.length, inStock, available, reserved };
  }, [stock]);

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="hidden sm:block"><KerneuFullLogo markSize={32} /></div>
          <div className="sm:hidden flex items-center gap-2">
            <KerneuLogo size={28} />
            <span className="font-semibold text-sm text-foreground">Kerneu Group</span>
          </div>
          <div className="flex items-center gap-3">
            {userName && <span className="hidden sm:inline text-sm text-muted-foreground">{userName}</span>}
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors active:scale-[0.98]"
              >
                <LogOut size={14} /> Выйти
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Остатки склада</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Актуальное наличие товаров по {warehouses.length} складам · только просмотр
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {updatedAt && <span>Обновлено в {updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>}
            <button
              onClick={() => load(true)}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              aria-label="Обновить"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Обновить
            </button>
          </div>
        </div>

        {/* Сводка */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Позиций", value: summary.positions, icon: Boxes, cls: "text-foreground" },
            { label: "В наличии", value: summary.inStock, icon: PackageCheck, cls: "text-foreground" },
            { label: "Доступно, ед.", value: summary.available, icon: Check, cls: "text-green-600 dark:text-green-400" },
            { label: "В резерве, ед.", value: summary.reserved, icon: Building2, cls: "text-violet-600 dark:text-violet-400" },
          ].map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <c.icon size={12} /> {c.label}
              </div>
              <div className={`text-xl font-semibold font-mono ${c.cls}`}>{loading ? "—" : fmt(c.value)}</div>
            </div>
          ))}
        </div>

        {/* Фильтры */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по наименованию или артикулу…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card"
            />
          </div>

          <div className="flex items-center gap-1 border border-border rounded-lg overflow-x-auto bg-card p-0.5">
            <button
              onClick={() => setSelectedWarehouseId("all")}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${selectedWarehouseId === "all" ? "bg-slate-800 text-white" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Building2 size={12} /> Все склады
            </button>
            {warehouses.map((wh) => (
              <button
                key={wh.id}
                onClick={() => setSelectedWarehouseId(wh.id)}
                title={wh.name}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${selectedWarehouseId === wh.id ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                {wh.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {STOCK_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors ${filter === f.key ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setIsSortMenuOpen((v) => !v)}
              className={`text-xs flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg border transition-all duration-150 active:scale-95 ${
                sortField ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              <ArrowUpDown size={12} className={`transition-transform duration-200 ${isSortMenuOpen ? "rotate-180" : ""}`} />
              {sortField
                ? `${STOCK_SORT_OPTIONS.find((o) => o.field === sortField)?.label} ${sortDir === "asc" ? "↑" : "↓"}`
                : "Сортировать"}
            </button>

            {isSortMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsSortMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 origin-top-right">
                  <button
                    onClick={() => { setSortField(null); setIsSortMenuOpen(false); }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-muted transition-colors text-muted-foreground"
                  >
                    Без сортировки
                    {!sortField && <Check size={12} className="text-primary" />}
                  </button>
                  <div className="h-px bg-muted my-1" />
                  {STOCK_SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.field}
                      onClick={() => {
                        if (sortField === opt.field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        else { setSortField(opt.field); setSortDir("desc"); }
                        setIsSortMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-muted transition-colors text-foreground"
                    >
                      <span>
                        {opt.label}
                        {sortField === opt.field && <span className="text-muted-foreground ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                      </span>
                      {sortField === opt.field && <Check size={12} className="text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Таблица */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Загрузка остатков…</p>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center gap-3 text-center px-4">
              <AlertCircle size={22} className="text-destructive" />
              <p className="text-sm text-destructive font-medium">{error}</p>
              <button
                onClick={() => load()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted"
              >
                Повторить
              </button>
            </div>
          ) : filteredStock.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              <Inbox size={22} className="text-muted-foreground/50" />
              {stock.length === 0 ? "Склад пуст" : "Ничего не найдено"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-background/60">
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">Артикул</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Наименование</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">Ед. изм.</th>
                    {warehouses.map((wh) => (
                      <th key={wh.id} title={wh.name} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">{wh.code || wh.name}</th>
                    ))}
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground uppercase tracking-wide text-right bg-muted/70 whitespace-nowrap">Всего</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">В резерве</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">Брак</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">Доступно</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredStock.map((item) => (
                    <tr key={item.id} className="hover:bg-background/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{item.sku}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground min-w-[220px]">{item.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.unit}</td>
                      {warehouses.map((wh) => (
                        <td key={wh.id} className="px-4 py-3 text-sm font-mono text-foreground text-right whitespace-nowrap">
                          {fmt(item.perWarehouse[wh.id] || 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm font-mono text-foreground text-right font-bold bg-background whitespace-nowrap">{fmt(item.total)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-violet-600 dark:text-violet-400 text-right whitespace-nowrap">{fmt(item.reserved)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-right whitespace-nowrap">
                        {item.defective > 0 ? (
                          <span className="text-destructive font-semibold">{fmt(item.defective)}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-green-600 dark:text-green-400 font-semibold whitespace-nowrap">{fmt(item.available)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !error && filteredStock.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Показано {fmt(filteredStock.length)} из {fmt(stock.length)} позиций · автообновление раз в минуту
          </p>
        )}
      </main>

      <footer className="border-t border-border mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 text-xs text-muted-foreground">
          © 2026 Kerneu Group · Складской учёт
        </div>
      </footer>
    </div>
  );
}

export default PublicStockPage;