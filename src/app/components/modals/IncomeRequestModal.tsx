import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X, Plus, Trash2, ChevronDown, Check, FolderKanban } from "lucide-react";
import { postWarehouseIncomeRequest, WarehouseInfo } from "../../../api/api";
import {
  ExistingProductPicker,
  ExistingProductSelection,
  StockOption,
  buildSelection,
  livingWarehouseIds,
} from "./ExistingProductPicker";

const MAX_ROWS = 50;

type RowMode = "new" | "existing";

type RequestRow = {
  key: number;
  mode: RowMode;
  // новый товар — вводится вручную
  name: string;
  // товар, который уже есть на складе (склад определяется самим товаром)
  existing: ExistingProductSelection | null;
  quantity: string;
  // Строка проекта, которую эта позиция закрывает (только у строки,
  // созданной из prefill — вручную добавленные строки этого не несут).
  sourceProjectItemId?: number | null;
  // true только у строки, собранной prefillRow() — её склад заблокирован
  // (см. lockWarehouse у ExistingProductPicker), т.к. должен совпадать со
  // складом, на котором произошёл деньг.
  isReorderRow?: boolean;
};

type RequestItem = {
  product_name: string;
  quantity: number;
  product_id?: number;
  project_id?: number;
  project_item_id?: number;
};

// Заявка, открытая из отклонённой позиции прихода на WarehousePage (деньга
// "Отклонить" → пересоздать заявку тем же товаром/количеством/складом).
// projectId — обязателен (это и есть признак того, что заявка project-linked);
// productId отсутствует, если отклонённая позиция была "новым" товаром без
// привязки к каталогу — тогда строка заполняется как свободный текст.
// projectItemId сейчас не заполняется на WarehousePage (backend его пока не
// отдаёт в ArrivalRow) — поле готово принять его, когда появится.
export type IncomeRequestPrefill = {
  projectId: number;
  projectName?: string | null;
  projectItemId?: number | null;
  productId: number | null;
  productName: string;
  quantity: number;
  unit?: string | null;
  warehouseId: number;
};

// Нормализация названия для сравнения: регистр, лишние пробелы, ё/е
const normName = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

let rowKeySeq = 0;
function emptyRow(): RequestRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, mode: "new", name: "", existing: null, quantity: "" };
}

// Строит первую строку заявки из prefill: если товар есть в каталоге
// (productId задан) и мы нашли его в остатках склада — выбираем его через
// ExistingProductPicker (buildSelection), иначе — обычная "новая" строка со
// свободным текстом названия.
function prefillRow(prefill: IncomeRequestPrefill, stock: StockOption[], warehouses: WarehouseInfo[]): RequestRow {
  rowKeySeq += 1;
  const quantity = prefill.quantity > 0 ? String(prefill.quantity) : "";

  if (prefill.productId != null) {
    const stockItem = stock.find((s) => s.productId === prefill.productId);
    const selection = stockItem
      ? buildSelection(stockItem, warehouses)
      : { productId: prefill.productId, name: prefill.productName, unit: prefill.unit || "шт", warehouseId: prefill.warehouseId };
    if (selection) {
      return {
        key: rowKeySeq,
        mode: "existing",
        name: "",
        existing: { ...selection, warehouseId: prefill.warehouseId },
        quantity,
        sourceProjectItemId: prefill.projectItemId ?? null,
        isReorderRow: true,
      };
    }
  }

  return {
    key: rowKeySeq,
    mode: "new",
    name: prefill.productName,
    existing: null,
    quantity,
    sourceProjectItemId: prefill.projectItemId ?? null,
    isReorderRow: true,
  };
}

export function IncomeRequestModal({
  warehouses,
  stock = [],
  prefill = null,
  onClose,
  onSuccess,
}: {
  warehouses: WarehouseInfo[];
  stock?: StockOption[];
  prefill?: IncomeRequestPrefill | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // Инициализация из prefill происходит один раз при монтировании: модалка
  // открывается из деньга через {condition && <IncomeRequestModal .../>},
  // поэтому каждый новый деньг = новый key = новый маунт = свежий useState.
  // Пересборки prefill "на лету" в уже открытой модалке не бывает.
  const isProjectLinked = prefill != null;
  const [warehouseId, setWarehouseId] = useState<string>(prefill ? String(prefill.warehouseId) : "");
  const [rows, setRows] = useState<RequestRow[]>(() => (prefill ? [prefillRow(prefill, stock, warehouses)] : [emptyRow()]));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false);
  const [warehouseActiveIndex, setWarehouseActiveIndex] = useState(0);
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);
  const warehouseListboxRef = useRef<HTMLDivElement>(null);

  const selectedWarehouse = warehouses.find((wh) => String(wh.id) === warehouseId) || null;
  // Реиспользуем уже существующий error-стейт: если сабмит уже показал ошибку
  // и склад так и не выбран, подсвечиваем триггер красным — отдельного флага не заводим.
  const hasNewRows = rows.some((r) => r.mode === "new");
  const warehouseMissing = hasNewRows && !!error && !warehouseId;

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

  // Точное совпадение названия нового товара с тем, что уже есть на складе
  const findExactInStock = (name: string): StockOption | null => {
    const n = normName(name);
    if (!n) return null;
    return stock.find((s) => normName(s.name) === n) ?? null;
  };

  // Похожие товары (название содержит введённый текст или наоборот) — мягкая подсказка
  const findSimilarInStock = (name: string): StockOption[] => {
    const n = normName(name);
    if (n.length < 3) return [];
    return stock
      .filter((s) => {
        const sn = normName(s.name);
        return sn !== n && (sn.includes(n) || n.includes(sn));
      })
      .slice(0, 3);
  };

  const whShort = (id: number) => warehouses.find((w) => w.id === id)?.code || warehouses.find((w) => w.id === id)?.name || `№${id}`;

  const switchRowToExisting = (key: number, item: StockOption) => {
    const selection = buildSelection(item, warehouses);
    if (!selection) return;
    updateRow(key, { mode: "existing", existing: selection, name: "" });
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
    if (rows.length === 0 || rows.length > MAX_ROWS) {
      setError(`Количество позиций должно быть от 1 до ${MAX_ROWS}`);
      return;
    }

    if (hasNewRows && !warehouseId) {
      setError("Выберите склад для новых товаров");
      return;
    }

    // Один запрос = один склад. Товары, которые лежат на разных складах,
    // уходят отдельными заявками — группируем по складу.
    const groups = new Map<number, { items: RequestItem[]; rowKeys: number[] }>();
    const addToGroup = (whId: number, item: RequestItem, rowKey: number) => {
      const g = groups.get(whId) ?? { items: [], rowKeys: [] };
      g.items.push(item);
      g.rowKeys.push(rowKey);
      groups.set(whId, g);
    };

    for (const row of rows) {
      const qty = Number(row.quantity);

      if (row.mode === "existing") {
        if (!row.existing) {
          setError("Выберите товар со склада для каждой позиции");
          return;
        }
      } else {
        if (!row.name.trim()) {
          setError("Укажите наименование для каждой позиции");
          return;
        }
        // «Новый» товар с названием, которое уже есть на складе, — это обход выбора склада
        const dup = findExactInStock(row.name);
        if (dup) {
          const where = livingWarehouseIds(dup).map(whShort).join(", ");
          setError(
            `Товар «${dup.name}» уже есть на складе${where ? ` (${where})` : ""}. Выберите его через «Со склада».`,
          );
          return;
        }
      }

      if (!row.quantity || !Number.isInteger(qty) || qty <= 0) {
        setError("Количество должно быть целым числом больше нуля для каждой позиции");
        return;
      }

      // Заявка целиком открыта из деньга на конкретном проекте — привязываем
      // project_id ко всем позициям, включая вручную дописанные строки,
      // раз badge проекта в модалке показан на весь список. project_item_id
      // идёт только той строке, что реально закрывает эту позицию проекта.
      const projectFields = isProjectLinked
        ? { project_id: prefill!.projectId, project_item_id: row.sourceProjectItemId ?? undefined }
        : {};

      if (row.mode === "existing" && row.existing) {
        addToGroup(
          row.existing.warehouseId,
          { product_name: row.existing.name, product_id: row.existing.productId, quantity: qty, ...projectFields },
          row.key,
        );
      } else {
        addToGroup(Number(warehouseId), { product_name: row.name.trim(), quantity: qty, ...projectFields }, row.key);
      }
    }

    setSubmitting(true);
    setError(null);

    const sentKeys = new Set<number>();
    try {
      for (const [whId, group] of Array.from(groups.entries())) {
        await postWarehouseIncomeRequest({ warehouse_id: whId, items: group.items });
        group.rowKeys.forEach((k) => sentKeys.add(k));
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Не удалось отправить заявку";

      if (sentKeys.size > 0) {
        // Часть заявок уже ушла — убираем эти позиции, чтобы повторная отправка их не задвоила
        setRows((prev) => prev.filter((r) => !sentKeys.has(r.key)));
        onSuccess();
        setError(`Часть позиций уже отправлена и убрана из списка. Остальные не отправлены: ${msg}`);
      } else {
        setError(msg);
      }
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
      <div className="w-full max-w-2xl rounded-xl bg-card p-6 shadow-xl">
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

        {isProjectLinked && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-blue-50 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-400/25 rounded-lg">
            <FolderKanban size={14} className="text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-foreground">
              Заявка привязана к проекту{" "}
              <span className="font-semibold">{prefill!.projectName || `#${prefill!.projectId}`}</span>
              {" "}— так пересоздаётся отклонённая позиция прихода. Товар/количество и склад ниже уже заполнены;
              при необходимости их можно изменить перед отправкой.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {hasNewRows && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Склад для новых товаров *</label>
            <div className="relative" ref={warehouseDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (warehouses.length === 0 || isProjectLinked) return;
                  setWarehouseDropdownOpen((v) => !v);
                }}
                disabled={warehouses.length === 0 || isProjectLinked}
                title={isProjectLinked ? "Склад зафиксирован — совпадает со складом отклонённого прихода" : undefined}
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
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Товары *</label>
            <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
              {rows.map((row) => (
                <div key={row.key} className="rounded-lg border border-border p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                      {([
                        { mode: "new" as const, label: "Новый товар" },
                        { mode: "existing" as const, label: "Со склада" },
                      ]).map((opt) => (
                        <button
                          key={opt.mode}
                          type="button"
                          onClick={() =>
                            updateRow(row.key, opt.mode === "new" ? { mode: "new", existing: null } : { mode: "existing" })
                          }
                          className={`px-3 py-1.5 font-medium transition-colors ${
                            row.mode === opt.mode
                              ? "bg-primary text-white"
                              : "bg-card text-muted-foreground hover:bg-background"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      title="Убрать позицию"
                      className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {row.mode === "new" ? (
                        (() => {
                          const exact = findExactInStock(row.name);
                          const similar = exact ? [] : findSimilarInStock(row.name);
                          return (
                            <div>
                              <input
                                value={row.name}
                                onChange={(e) => updateRow(row.key, { name: e.target.value })}
                                type="text"
                                placeholder="Наименование товара"
                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:border-primary ${
                                  exact ? "border-amber-400 dark:border-amber-500/60" : "border-border"
                                }`}
                              />

                              {exact && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/25 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                                  <span>
                                    Такой товар уже есть на складе:{" "}
                                    {livingWarehouseIds(exact).map(whShort).join(", ") || "без остатков"}.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => switchRowToExisting(row.key, exact)}
                                    className="font-semibold underline underline-offset-2 hover:no-underline"
                                  >
                                    Выбрать его
                                  </button>
                                </div>
                              )}

                              {similar.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span>Похожие на складе:</span>
                                  {similar.map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => switchRowToExisting(row.key, s)}
                                      className="px-2 py-0.5 rounded border border-border bg-background text-foreground hover:border-primary transition-colors"
                                    >
                                      {s.name}{" "}
                                      <span className="text-muted-foreground">
                                        ({livingWarehouseIds(s).map(whShort).join(", ") || "—"})
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <ExistingProductPicker
                          stock={stock}
                          warehouses={warehouses}
                          value={row.existing}
                          onChange={(existing) => updateRow(row.key, { existing })}
                          disabled={submitting}
                          lockWarehouse={!!row.isReorderRow}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Кол-во"
                        className="w-24 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                      />
                      {row.mode === "existing" && row.existing && (
                        <span className="text-xs text-muted-foreground w-6">{row.existing.unit}</span>
                      )}
                    </div>
                  </div>
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
