import { Fragment, useEffect, useMemo, useState } from "react";
import { fmt } from "../lib/format";
import {
  fetchProcurementSummary,
  type ProcurementSummaryItem,
  type ProcurementSummaryResponse,
} from "../api/api";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  Search,
  AlertCircle,
  Package,
} from "lucide-react";

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function ProcurementSummaryView({
  onOpenProject,
}: {
  onOpenProject: (projectId: number) => void;
}) {
  const [data, setData] = useState<ProcurementSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProcurementSummary();
      setData(result);
    } catch (e) {
      console.error("Не удалось загрузить сводку закупок:", e);
      setError(e instanceof Error ? e.message : "Не удалось загрузить сводку закупок");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleRow = (productId: number) => {
    setExpandedRows(prev => ({ ...prev, [productId]: !prev[productId] }));
  };

  const supplierOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.items.forEach(item => item.suppliers.forEach(s => { if (s) set.add(s); }));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLocaleLowerCase("ru-RU");
    return data.items.filter(item => {
      if (q && !item.product_name.toLocaleLowerCase("ru-RU").includes(q)) return false;
      if (supplierFilter && !item.suppliers.includes(supplierFilter)) return false;
      return true;
    });
  }, [data, searchQuery, supplierFilter]);

  const priceLabel = (item: ProcurementSummaryItem) => {
    const min = toNumber(item.price_min);
    const max = toNumber(item.price_max);
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin text-primary" />
        Загружаем сводку…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-400/25 rounded-lg mb-6 text-sm flex items-center justify-between gap-4">
        <span>{error}</span>
        <button
          onClick={load}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-400/25 text-xs font-semibold hover:bg-red-100/60 dark:hover:bg-red-400/20 transition-colors"
        >
          <RefreshCw size={13} /> Повторить
        </button>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="py-16 text-center bg-card rounded-lg border border-border">
        <p className="text-sm font-medium text-muted-foreground">Нет позиций к закупке.</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-400/25 rounded-lg mb-6 text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={load}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-400/25 text-xs font-semibold hover:bg-red-100/60 dark:hover:bg-red-400/20 transition-colors"
          >
            <RefreshCw size={13} /> Повторить
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 max-w-md">
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Товаров к закупке</p>
          <p className="font-mono text-xl font-semibold text-foreground">{data.totals.products_count}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Проектов</p>
          <p className="font-mono text-xl font-semibold text-foreground">{data.totals.projects_count}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию товара..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:w-56"
        >
          <option value="">Все поставщики</option>
          {supplierOptions.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-background transition-colors shrink-0 disabled:opacity-50"
          title="Обновить сводку"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <div className="py-16 text-center bg-card rounded-lg border border-border">
          <p className="text-sm font-medium text-muted-foreground">Ничего не найдено по заданным фильтрам.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-background/40">
                  {["", "Товар", "Ед.", "Итого к закупке", "Проектов", "Цена закупки", "Поставщики", "На складе"].map((header, idx) => (
                    <th key={idx} className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map(item => {
                  const isExpanded = !!expandedRows[item.product_id];

                  return (
                    <Fragment key={item.product_id}>
                      <tr
                        onClick={() => toggleRow(item.product_id)}
                        className="hover:bg-background/30 transition-colors cursor-pointer"
                      >
                        <td className="pl-5 pr-2 py-3.5 w-8">
                          <ChevronDown
                            size={14}
                            className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium text-foreground">{item.product_name}</td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{item.unit || "шт"}</td>
                        <td className="px-5 py-3.5 text-sm font-mono text-foreground">
                          <div className="flex items-center gap-2">
                            <span>{toNumber(item.total_quantity).toLocaleString("ru-RU")}</span>
                            {item.unit_conflict && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-400/25 whitespace-nowrap"
                                title="У позиций этого товара разные единицы измерения — сумма может быть некорректной"
                              >
                                <AlertCircle size={10} /> Разные ед. измерения — проверьте
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm font-mono text-foreground">{item.projects_count}</td>
                        <td className="px-5 py-3.5 text-sm font-mono text-foreground whitespace-nowrap">{priceLabel(item)}</td>
                        <td
                          className="px-5 py-3.5 text-sm text-muted-foreground max-w-[220px] truncate"
                          title={item.suppliers.join(", ")}
                        >
                          {item.suppliers.length > 0 ? item.suppliers.join(", ") : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-mono text-muted-foreground">
                          {toNumber(item.available_stock).toLocaleString("ru-RU")}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-background/30">
                          <td colSpan={8} className="px-5 py-4">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b border-border">
                                  {["Проект", "Кол.", "Поставщик", "Цена"].map((header) => (
                                    <th key={header} className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {item.projects.map(row => (
                                  <tr key={row.item_id} className="hover:bg-card/60 transition-colors">
                                    <td className="px-3 py-2.5 text-sm">
                                      <div className="flex flex-col gap-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenProject(row.project_id);
                                          }}
                                          className="text-left text-primary hover:underline font-medium"
                                        >
                                          {row.project_name}
                                        </button>
                                        {row.kit_name ? (
                                          <span className="inline-flex w-fit max-w-[220px] items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                            <Package size={10} className="shrink-0" />
                                            <span className="truncate">
                                              из комплекта «{row.kit_name}»
                                              {row.kit_quantity != null ? ` ×${row.kit_quantity}` : ""}
                                            </span>
                                          </span>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm font-mono text-foreground">
                                      {toNumber(row.quantity).toLocaleString("ru-RU")}
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-muted-foreground">{row.supplier || "—"}</td>
                                    <td className="px-3 py-2.5 text-sm font-mono text-foreground">{fmt(toNumber(row.price_cost))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
