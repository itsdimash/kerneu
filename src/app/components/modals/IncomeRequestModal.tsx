import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X, Plus, Trash2, ChevronDown, Check } from "lucide-react";
import { postWarehouseIncomeRequest, WarehouseInfo } from "../../../api/api";

const MAX_ROWS = 50;

type RequestRow = {
  key: number;
  name: string;
  quantity: string;
};

let rowKeySeq = 0;
function emptyRow(): RequestRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, name: "", quantity: "" };
}

export function IncomeRequestModal({
  warehouses,
  onClose,
  onSuccess,
}: {
  warehouses: WarehouseInfo[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [rows, setRows] = useState<RequestRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false);
  const [warehouseActiveIndex, setWarehouseActiveIndex] = useState(0);
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);
  const warehouseListboxRef = useRef<HTMLDivElement>(null);

  const selectedWarehouse = warehouses.find((wh) => String(wh.id) === warehouseId) || null;
  // Реиспользуем уже существующий error-стейт: если сабмит уже показал ошибку
  // и склад так и не выбран, подсвечиваем триггер красным — отдельного флага не заводим.
  const warehouseMissing = !!error && !warehouseId;

  useEffect(() => {
    if (!warehouseDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(e.target as Node)) {
        setWarehouseDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [warehouseDropdownOpen]);

  useEffect(() => {
    if (warehouseDropdownOpen) {
      const preselected = warehouses.findIndex((wh) => String(wh.id) === warehouseId);
      setWarehouseActiveIndex(preselected >= 0 ? preselected : 0);
      warehouseListboxRef.current?.focus();
    }
  }, [warehouseDropdownOpen]);

  const handleWarehouseListboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Esc должен закрыть только выпадающий список склада, а не всю модалку —
      // останавливаем всплытие, иначе сработает onKeyDown модалки ниже.
      e.stopPropagation();
      e.preventDefault();
      setWarehouseDropdownOpen(false);
      return;
    }

    if (warehouses.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setWarehouseActiveIndex((i) => (i + 1) % warehouses.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setWarehouseActiveIndex((i) => (i - 1 + warehouses.length) % warehouses.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const wh = warehouses[warehouseActiveIndex];
      if (wh) {
        setWarehouseId(String(wh.id));
        setWarehouseDropdownOpen(false);
      }
    }
  };

  const updateRow = (key: number, patch: Partial<RequestRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    setRows((prev) => [...prev, emptyRow()]);
  };

  const removeRow = (key: number) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!warehouseId) {
      setError("Выберите склад");
      return;
    }

    if (rows.length === 0 || rows.length > MAX_ROWS) {
      setError(`Количество позиций должно быть от 1 до ${MAX_ROWS}`);
      return;
    }

    const items: { product_name: string; quantity: number }[] = [];
    for (const row of rows) {
      const name = row.name.trim();
      const qty = Number(row.quantity);

      if (!name) {
        setError("Укажите наименование для каждой позиции");
        return;
      }
      if (!row.quantity || !Number.isInteger(qty) || qty <= 0) {
        setError("Количество должно быть целым числом больше нуля для каждой позиции");
        return;
      }

      items.push({ product_name: name, quantity: qty });
    }

    setSubmitting(true);
    setError(null);

    try {
      await postWarehouseIncomeRequest({
        warehouse_id: Number(warehouseId),
        items,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">Заявка на приход</h3>
          <button onClick={handleClose} className="text-muted-foreground hover:text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg">
            <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Склад *</label>
            <div className="relative" ref={warehouseDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (warehouses.length === 0) return;
                  setWarehouseDropdownOpen((v) => !v);
                }}
                disabled={warehouses.length === 0}
                aria-haspopup="listbox"
                aria-expanded={warehouseDropdownOpen}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:border-primary bg-card text-foreground disabled:opacity-50 disabled:cursor-not-allowed ${
                  warehouseMissing ? "border-red-400 dark:border-red-500/60" : "border-border"
                }`}
              >
                {selectedWarehouse ? (
                  <span className="flex items-center gap-1.5 truncate font-medium">
                    {selectedWarehouse.name}
                    {selectedWarehouse.code && (
                      <span className="text-xs font-normal text-muted-foreground">({selectedWarehouse.code})</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground font-normal">
                    {warehouses.length === 0 ? "Нет доступных складов" : "Выберите склад"}
                  </span>
                )}
                <ChevronDown
                  size={15}
                  className={`shrink-0 text-muted-foreground transition-transform duration-150 ${warehouseDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {warehouseDropdownOpen && (
                <div
                  ref={warehouseListboxRef}
                  role="listbox"
                  tabIndex={-1}
                  onKeyDown={handleWarehouseListboxKeyDown}
                  className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 focus:outline-none"
                >
                  {warehouses.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground italic">Нет доступных складов</div>
                  ) : (
                    warehouses.map((wh, idx) => {
                      const isSelected = String(wh.id) === warehouseId;
                      const isActive = idx === warehouseActiveIndex;
                      return (
                        <div
                          key={wh.id}
                          role="option"
                          aria-selected={isSelected}
                          onMouseEnter={() => setWarehouseActiveIndex(idx)}
                          onClick={() => {
                            setWarehouseId(String(wh.id));
                            setWarehouseDropdownOpen(false);
                          }}
                          className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${
                            isActive ? "bg-background" : ""
                          } ${isSelected ? "text-foreground font-medium" : "text-foreground"}`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            {wh.name}
                            {wh.code && <span className="text-xs text-muted-foreground">({wh.code})</span>}
                          </span>
                          {isSelected && <Check size={14} className="text-primary shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Товары *</label>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {rows.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    type="text"
                    placeholder="Наименование товара"
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                  />
                  <input
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Кол-во"
                    className="w-24 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length === 1}
                    title="Убрать позицию"
                    className="shrink-0 p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addRow}
              disabled={rows.length >= MAX_ROWS}
              className="flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-background disabled:opacity-50"
            >
              <Plus size={13} /> Добавить товар
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-background rounded-lg">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Отправить заявку
          </button>
        </div>
      </div>
    </div>
  );
}
