import { Fragment, useEffect, useMemo, useState } from "react";
import { fmt } from "../lib/format";
import {
  fetchProcurementSummary,
  type ProcurementSummaryItem,
  type ProcurementSummaryProjectRow,
  type ProcurementSummaryResponse,
  type ProcurementSummaryStage,
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

const STAGE_LABELS: Record<ProcurementSummaryStage, string> = {
  to_buy: "К закупке",
  partially_ordered: "Частично заказано",
  ordered: "Заказано, ждёт приёмки",
};

const STAGE_CLASSES: Record<ProcurementSummaryStage, string> = {
  to_buy: "bg-slate-100 dark:bg-slate-400/15 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-400/25",
  partially_ordered: "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-400/25",
  ordered: "bg-blue-50 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300 ring-blue-200 dark:ring-blue-400/25",
};

function StageBadge({ stage }: { stage?: ProcurementSummaryStage }) {
  if (!stage) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 whitespace-nowrap ${STAGE_CLASSES[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

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
  const [showOrdered, setShowOrdered] = useState(false);

  const load = async (includeOrdered = showOrdered) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProcurementSummary(includeOrdered);
      setData(result);
    } catch (e) {
      console.error("Не удалось загрузить сводку закупок:", e);
      setError(e instanceof Error ? e.message : "Не удалось загрузить сводку закупок");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(showOrdered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOrdered]);

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

  const getOrderedQty = (item: ProcurementSummaryItem) => toNumber(item.ordered_quantity);
  const getToBuyQty = (item: ProcurementSummaryItem) =>
    item.to_buy_quantity != null
      ? toNumber(item.to_buy_quantity)
      : Math.max(0, toNumber(item.total_quantity) - getOrderedQty(item));
  const isFullyOrdered = (item: ProcurementSummaryItem) =>
    getOrderedQty(item) > 0 && getToBuyQty(item) <= 0;

  const getRowOrderedQty = (row: ProcurementSummaryProjectRow) => toNumber(row.ordered_quantity);
  const getRowToBuyQty = (row: ProcurementSummaryProjectRow) =>
    row.to_buy_quantity != null
      ? toNumber(row.to_buy_quantity)
      : Math.max(0, toNumber(row.quantity) - getRowOrderedQty(row));

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
          onClick={() => load()}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-400/25 text-xs font-semibold hover:bg-red-100/60 dark:hover:bg-red-400/20 transition-colors"
        >
          <RefreshCw size={13} /> Повторить
        </button>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    const hiddenOrdered = data?.totals.hidden_ordered_products ?? 0;
    if (!showOrdered && hiddenOrdered > 0) {
      return (
        <div className="py-16 text-center bg-card rounded-lg border border-border">
          <p className="text-sm font-medium text-muted-foreground">
            Всё уже заказано: {hiddenOrdered} {hiddenOrdered === 1 ? "товар" : "товаров"} ждут приёмки на складе
          </p>
          <button
            type="button"
            onClick={() => setShowOrdered(true)}
            className="mt-2 text-sm text-primary hover:underline font-medium"
          >
            Показать
          </button>
        </div>
      );
    }
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
            onClick={() => load()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-400/25 text-xs font-semibold hover:bg-red-100/60 dark:hover:bg-red-400/20 transition-colors"
          >
            <RefreshCw size={13} /> Повторить
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 max-w-2xl">
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Товаров к закупке</p>
          <p className="font-mono text-xl font-semibold text-foreground">{data.totals.products_count}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Проектов</p>
          <p className="font-mono text-xl font-semibold text-foreground">{data.totals.projects_count}</p>
        </div>
        {(data.totals.hidden_ordered_products ?? 0) > 0 && (
          <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground mb-1">Заказано, ждёт приёмки</p>
            <p className="font-mono text-xl font-semibold text-foreground">{data.totals.hidden_ordered_products}</p>
          </div>
        )}
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
        <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={showOrdered}
            onChange={(e) => setShowOrdered(e.target.checked)}
            className="rounded border-border"
          />
          Показывать уже заказанные
        </label>
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
          onClick={() => load()}
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
                  {["", "Товар", "Ед.", "Осталось купить", "Заказано / Всего", "Проектов", "Цена закупки", "Поставщики", "На складе"].map((header, idx) => (
                    <th key={idx} className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map(item => {
                  const isExpanded = !!expandedRows[item.product_id];
                  const fullyOrdered = isFullyOrdered(item);
                  const orderedQty = getOrderedQty(item);
                  const totalQty = toNumber(item.total_quantity);

                  return (
                    <Fragment key={item.product_id}>
                      <tr
                        onClick={() => toggleRow(item.product_id)}
                        className={`hover:bg-background/30 transition-colors cursor-pointer ${fullyOrdered ? "opacity-60" : ""}`}
                      >
                        <td className="pl-5 pr-2 py-3.5 w-8">
                          <ChevronDown
                            size={14}
                            className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <span>{item.product_name}</span>
                            {fullyOrdered && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-400/25 whitespace-nowrap">
                                Всё заказано
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{item.unit || "шт"}</td>
                        <td className="px-5 py-3.5 text-sm font-mono text-foreground">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{getToBuyQty(item).toLocaleString("ru-RU")}</span>
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
                        <td
                          className="px-5 py-3.5 text-sm font-mono text-muted-foreground whitespace-nowrap"
                          title="Заказано и ждёт приёмки / Всего нужно"
                        >
                          {orderedQty.toLocaleString("ru-RU")} / {totalQty.toLocaleString("ru-RU")}
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
                          <td colSpan={9} className="px-5 py-4">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b border-border">
                                  {["Проект", "Кол.", "Статус", "Поставщик", "Цена"].map((header) => (
                                    <th key={header} className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {item.projects.map(row => {
                                  const rowOrdered = getRowOrderedQty(row);
                                  const rowToBuy = getRowToBuyQty(row);
                                  return (
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
                                      <td className="px-3 py-2.5 text-sm font-mono text-foreground whitespace-nowrap">
                                        {rowToBuy.toLocaleString("ru-RU")}
                                        {rowOrdered > 0 && (
                                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                                            из {toNumber(row.quantity).toLocaleString("ru-RU")}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-sm">
                                        <StageBadge stage={row.stage} />
                                      </td>
                                      <td className="px-3 py-2.5 text-sm text-muted-foreground">{row.supplier || "—"}</td>
                                      <td className="px-3 py-2.5 text-sm font-mono text-foreground">{fmt(toNumber(row.price_cost))}</td>
                                    </tr>
                                  );
                                })}
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
