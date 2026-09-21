import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Building2, Check, X, Info } from "lucide-react";
import type { WarehouseInfo } from "../../../api/api";

// StockRow из WarehousePage подходит под этот тип структурно
export type StockOption = {
  id: number;
  productId: number;
  sku: string;
  name: string;
  unit: string;
  perWarehouse: Record<number, number>;
};

export type ExistingProductSelection = {
  productId: number;
  name: string;
  unit: string;
  warehouseId: number;
};

/**
 * Склады, где товар физически лежит (остаток > 0).
 * То же правило, что на бэкенде (get_warehouses_with_any_stock) — иначе фронт
 * разрешит склад, который бэкенд отклонит.
 */
export function livingWarehouseIds(item: StockOption): number[] {
  return Object.keys(item.perWarehouse)
    .map(Number)
    .filter((id) => (item.perWarehouse[id] ?? 0) > 0)
    .sort((a, b) => a - b);
}

/**
 * Готовый выбор для товара: склад определяется тем, где товар лежит
 * (если на нескольких — берём тот, где его больше; если нигде — первый из справочника).
 */
export function buildSelection(item: StockOption, warehouses: WarehouseInfo[]): ExistingProductSelection | null {
  const living = livingWarehouseIds(item);
  const best =
    living.length > 0
      ? living.reduce((a, b) => (item.perWarehouse[b] > item.perWarehouse[a] ? b : a), living[0])
      : warehouses[0]?.id;
  if (best === undefined) return null;
  return { productId: item.productId, name: item.name, unit: item.unit, warehouseId: best };
}

type Props = {
  stock: StockOption[];
  warehouses: WarehouseInfo[];
  value: ExistingProductSelection | null;
  onChange: (value: ExistingProductSelection | null) => void;
  disabled?: boolean;
};

/**
 * Выбор УЖЕ существующего на складе товара.
 * Показывает, на каких складах он лежит (с количеством), и не даёт выбрать другой склад.
 */
export function ExistingProductPicker({ stock, warehouses, value, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const whName = (id: number) => warehouses.find((w) => w.id === id)?.name ?? `Склад №${id}`;
  const whCode = (id: number) => warehouses.find((w) => w.id === id)?.code ?? whName(id).slice(0, 3);

  // Склады, где товар уже числится
  const livingWarehouses = livingWarehouseIds;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock
      .filter((item) => (q === "" ? true : item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [stock, query]);

  const selectedItem = value ? stock.find((s) => s.productId === value.productId) : null;
  const selectedLiving = selectedItem ? livingWarehouses(selectedItem) : [];

  const pick = (item: StockOption) => {
    const selection = buildSelection(item, warehouses);
    if (!selection) return;
    onChange(selection);
    setOpen(false);
    setQuery("");
  };

  // ---------- Товар выбран ----------
  if (value && selectedItem) {
    const onlyOne = selectedLiving.length === 1;
    const nowhere = selectedLiving.length === 0;
    const allowed = nowhere ? warehouses.map((w) => w.id) : selectedLiving;

    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{selectedItem.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{selectedItem.sku}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              title="Выбрать другой товар"
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            {onlyOne ? "Товар лежит на складе" : nowhere ? "Остатков пока нет — выберите склад" : "Товар лежит на складах — выберите куда"}
          </p>

          <div className="flex flex-wrap gap-2">
            {allowed.map((id) => {
              const active = value.warehouseId === id;
              const qty = selectedItem.perWarehouse[id];
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled || allowed.length === 1}
                  onClick={() => onChange({ ...value, warehouseId: id })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-foreground hover:bg-background"
                  } ${allowed.length === 1 ? "cursor-default" : ""}`}
                >
                  {active ? <Check size={13} /> : <Building2 size={13} className="text-muted-foreground" />}
                  <span className="font-medium">{whName(id)}</span>
                  {qty !== undefined && (
                    <span className={`font-mono text-xs ${active ? "text-white/80" : "text-muted-foreground"}`}>
                      {qty} {selectedItem.unit}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!nowhere && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info size={12} className="mt-0.5 shrink-0" />
              Приход можно оформить только на склад, где этот товар уже хранится.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------- Поиск ----------
  return (
    <div ref={rootRef}>
      <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Найти товар на складе по названию или артикулу…"
        className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card"
      />
      </div>

      {open && (
        // Список раскрывается в потоке (не absolute), иначе его обрежет прокручиваемый блок позиций
        <div className="mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-sm">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Ничего не найдено</p>
          ) : (
            results.map((item) => {
              const living = livingWarehouses(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item)}
                  className="w-full text-left px-3 py-2.5 hover:bg-background transition-colors border-b border-border last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">{item.sku}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {living.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground italic">нет остатков</span>
                    ) : (
                      living.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background border border-border text-[11px] text-muted-foreground"
                        >
                          <Building2 size={10} />
                          {whCode(id)}: <b className="font-mono text-foreground">{item.perWarehouse[id]}</b> {item.unit}
                        </span>
                      ))
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
