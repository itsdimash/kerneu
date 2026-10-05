import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X, Plus, Trash2, ChevronDown, Check, FolderKanban, Upload, FileText } from "lucide-react";
import {
  postWarehouseIncomeRequest,
  parseWarehouseIncomeDocument,
  ParsedIncomeItem,
  WarehouseInfo,
} from "../../../api/api";
import { StockStatusBadge } from "../common/StockStatusBadge";
import { NEW_PRODUCT_ML_STATUS, POSSIBLE_MATCH_ML_STATUS, normalizeMlStatus } from "../../../lib/stockStatus";
import {
  ExistingProductPicker,
  ExistingProductSelection,
  StockOption,
  buildSelection,
  livingWarehouseIds,
} from "./ExistingProductPicker";

const MAX_ROWS = 200;

// Ширина колонки статуса — единственный источник для колонки, шапки и отступа
// второй строки (подсказки/предупреждения). Отступ = колонка + gap-x-2 (0.5rem).
// Через CSS-переменную, чтобы Tailwind видел литеральные классы ниже.
const STATUS_COL_WIDTH = "12.5rem";
const STATUS_COL_CLASS = "sm:w-[var(--status-col)]";
const STATUS_INDENT_CLASS = "sm:pl-[calc(var(--status-col)+0.5rem)]";

// Локальные короткие подписи статусов матчера — только для этой модалки,
// чтобы колонка статуса оставалась узкой.
const POSSIBLE_MATCH_SHORT_LABEL = "Возможное совпадение";
const INSUFFICIENT_STOCK_SHORT_LABEL = "Не хватает на складе";

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "docx"];

// "catalog" — товар из каталога, которого нет в остатках склада (его нет в
// пропсе stock, ExistingProductPicker такой товар показать не может). Уходит
// с product_id, склад берётся из общего выбора склада, как у "new".
type RowMode = "new" | "existing" | "catalog";

// Данные распознавания, привязанные к строке (только у строк из документа).
type ParsedMeta = {
  status: string;
  warnings: string[];
  unit: string | null;
  rawQuantity: number | null;
  // "Возможное совпадение" — подсказка, не выбор
  suggested: { productId: number; name: string } | null;
  stockWarehouseIds: number[];
};

type RequestRow = {
  key: number;
  mode: RowMode;
  // новый товар — вводится вручную
  name: string;
  // товар, который уже есть на складе (склад определяется самим товаром)
  existing: ExistingProductSelection | null;
  // товар каталога без остатков (mode === "catalog")
  catalog?: { productId: number; name: string; unit: string } | null;
  parsed?: ParsedMeta;
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

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseInfo, setParseInfo] = useState<{ filename: string; count: number; warnings: string[]; truncated: number } | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceParsedRef = useRef(false);
  const dragDepthRef = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false);
  const [warehouseActiveIndex, setWarehouseActiveIndex] = useState(0);
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);
  const warehouseListboxRef = useRef<HTMLDivElement>(null);

  const selectedWarehouse = warehouses.find((wh) => String(wh.id) === warehouseId) || null;
  // Реиспользуем уже существующий error-стейт: если сабмит уже показал ошибку
  // и склад так и не выбран, подсвечиваем триггер красным — отдельного флага не заводим.
  const hasNewRows = rows.some((r) => r.mode === "new");
  const hasCatalogRows = rows.some((r) => r.mode === "catalog");
  // Общий склад нужен и "новым", и каталожным строкам без остатков
  const needsWarehouse = hasNewRows || hasCatalogRows;
  const warehouseMissing = needsWarehouse && !!error && !warehouseId;

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
        // Порог длины нужен на обеих сторонах: без него однобуквенный мусор в
        // каталоге ("h") ловится веткой n.includes(sn) почти на любой ввод —
        // "iphone 18" содержит "h".
        if (sn.length < 3) return false;
        return sn !== n && (sn.includes(n) || n.includes(sn));
      })
      // Порядок в stock произвольный, поэтому ранжируем сами: ближе к длине
      // введённого текста, а не просто длиннее — иначе длинный хвост
      // ("iPhone 18 Pro Max 256Gb") обгоняет более точное "iPhone 18", а
      // случайное короткое совпадение вытесняет релевантное из трёх показываемых.
      .sort(
        (a, b) =>
          Math.abs(normName(a.name).length - n.length) -
          Math.abs(normName(b.name).length - n.length)
      )
      .slice(0, 3);
  };

  const whShort = (id: number) => warehouses.find((w) => w.id === id)?.code || warehouses.find((w) => w.id === id)?.name || `№${id}`;

  const switchRowToExisting = (key: number, item: StockOption) => {
    const selection = buildSelection(item, warehouses);
    if (!selection) return;
    // name не очищаем: вернувшись в "Создать как новый", ручная строка получит свой текст обратно
    updateRow(key, { mode: "existing", existing: selection });
  };

  const updateRow = (key: number, patch: Partial<RequestRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const stockByProductId = (productId: number): StockOption | null =>
    stock.find((s) => s.productId === productId) ?? null;

  // Строка из ответа парсера. Совпавший товар, который есть в остатках,
  // становится "existing" (склад — где он лежит; если backend назвал склады,
  // берём из них тот, где больше). Совпавший, но отсутствующий в остатках —
  // "catalog". Точное совпадение названия со складом тоже превращаем в
  // "existing", иначе строка упрётся в защиту от дублей в handleSubmit.
  const buildParsedRow = (item: ParsedIncomeItem): RequestRow => {
    rowKeySeq += 1;
    const quantity = item.quantity != null && item.quantity > 0 ? String(item.quantity) : "";
    const suggestedId = item.suggested_product_id;
    const meta: ParsedMeta = {
      status: item.status,
      warnings: item.warnings ?? [],
      unit: item.unit,
      rawQuantity: item.raw_quantity,
      suggested:
        item.product_id == null && suggestedId != null
          ? { productId: suggestedId, name: item.matched_name || item.name }
          : null,
      stockWarehouseIds: item.stock_warehouse_ids ?? [],
    };
    const base = { key: rowKeySeq, name: "", existing: null, quantity, parsed: meta };

    const asExisting = (stockItem: StockOption): RequestRow | null => {
      const selection = buildSelection(stockItem, warehouses);
      if (!selection) return null;
      const living = livingWarehouseIds(stockItem);
      const hinted = meta.stockWarehouseIds.filter((id) => living.includes(id));
      if (hinted.length > 0 && !hinted.includes(selection.warehouseId)) {
        selection.warehouseId = hinted.reduce((a, b) => (stockItem.perWarehouse[b] > stockItem.perWarehouse[a] ? b : a), hinted[0]);
      }
      return { ...base, mode: "existing", existing: selection };
    };

    if (item.product_id != null) {
      const stockItem = stockByProductId(item.product_id);
      const existingRow = stockItem ? asExisting(stockItem) : null;
      if (existingRow) return existingRow;
      return {
        ...base,
        mode: "catalog",
        catalog: { productId: item.product_id, name: item.matched_name || item.name, unit: item.unit || "шт" },
      };
    }

    const exact = findExactInStock(item.name);
    const exactRow = exact ? asExisting(exact) : null;
    if (exactRow) return { ...exactRow, parsed: { ...meta, suggested: null } };

    return { ...base, mode: "new", name: item.name };
  };

  // Переключение "возможного совпадения" на товар: из остатков, если он там
  // есть, иначе как каталожная строка.
  const applySuggestion = (row: RequestRow) => {
    const sug = row.parsed?.suggested;
    if (!sug || !row.parsed) return;
    const parsed = { ...row.parsed, suggested: null };
    const stockItem = stockByProductId(sug.productId);
    const selection = stockItem ? buildSelection(stockItem, warehouses) : null;
    if (stockItem && selection) {
      updateRow(row.key, { mode: "existing", existing: selection, name: "", parsed });
    } else {
      updateRow(row.key, {
        mode: "catalog",
        catalog: { productId: sug.productId, name: sug.name, unit: row.parsed.unit || "шт" },
        name: "",
        parsed,
      });
    }
  };

  const handleFile = async (file: File) => {
    if (parsing || submitting) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setParseError("Поддерживаются файлы PDF, XLSX и DOCX");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setParseError("Файл больше 20 МБ — загрузите файл меньшего размера");
      return;
    }

    setParsing(true);
    setParseError(null);
    try {
      const res = await parseWarehouseIncomeDocument(file);
      if (res.items.length === 0) {
        setParseError(res.warnings[0] || "В документе не найдено ни одной позиции");
        return;
      }
      const parsedRows = res.items.map(buildParsedRow);
      // "Заменить": сначала убираем строки прошлого файла, ручные остаются
      const current = replaceParsedRef.current ? rowsRef.current.filter((r) => !r.parsed) : rowsRef.current;
      // Единственная пустая строка-заглушка заменяется, любые введённые строки — сохраняются
      const onlyPlaceholder =
        current.length === 1 &&
        current[0].mode === "new" &&
        !current[0].name.trim() &&
        !current[0].quantity &&
        !current[0].parsed;
      const kept = onlyPlaceholder ? [] : current;
      const room = Math.max(0, MAX_ROWS - kept.length);
      setRows([...kept, ...parsedRows.slice(0, room)]);
      setParseInfo({
        filename: res.filename || file.name,
        count: Math.min(parsedRows.length, room),
        warnings: res.warnings ?? [],
        truncated: Math.max(0, parsedRows.length - room),
      });
      setError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Не удалось распознать документ");
    } finally {
      setParsing(false);
    }
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

    if (needsWarehouse && !warehouseId) {
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
      } else if (row.mode === "catalog") {
        if (!row.catalog) {
          setError("Выберите товар для каждой позиции");
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
      } else if (row.mode === "catalog" && row.catalog) {
        addToGroup(
          Number(warehouseId),
          { product_name: row.catalog.name, product_id: row.catalog.productId, quantity: qty, ...projectFields },
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

  // ---------- Представление ----------
  const parsedRowsCount = rows.filter((r) => r.parsed).length;
  const reviewCount = rows.filter(
    (r) => r.parsed && (r.parsed.suggested || r.parsed.warnings.length > 0 || !r.quantity),
  ).length;

  const openFilePicker = (replace: boolean) => {
    if (parsing || submitting) return;
    replaceParsedRef.current = replace;
    fileInputRef.current?.click();
  };

  const removeParsedRows = () => {
    setRows((prev) => {
      const kept = prev.filter((r) => !r.parsed);
      return kept.length > 0 ? kept : [emptyRow()];
    });
    setParseInfo(null);
    setParseError(null);
  };

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const canDropFile = !isProjectLinked && !parsing && !submitting;

  const handleModalDragEnter = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    if (canDropFile) setDraggingOver(true);
  };
  const handleModalDragLeave = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDraggingOver(false);
  };
  const handleModalDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    // Всегда гасим дефолт, иначе браузер откроет файл вместо модалки
    e.preventDefault();
    dragDepthRef.current = 0;
    setDraggingOver(false);
    if (!canDropFile) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      replaceParsedRef.current = false;
      handleFile(file);
    }
  };

  // Бейдж строки следует ТЕКУЩЕМУ режиму строки, а не статусу матчера на момент
  // разбора: после "Выбрать" у подсказки или смены режима старый статус не показываем.
  const neutralTag = "bg-background text-muted-foreground border border-border";
  const amberTag =
    "bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-400/30";
  const tagBase = "inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold whitespace-nowrap";
  const badgeClass = "px-2.5 py-1 text-sm";
  const renderRowBadge = (row: RequestRow) => {
    const normalized = row.parsed ? normalizeMlStatus(row.parsed.status) : null;
    if (row.mode === "new") {
      if (row.parsed?.suggested) {
        return (
          <StockStatusBadge
            status={row.parsed.status}
            label={normalized === POSSIBLE_MATCH_ML_STATUS ? POSSIBLE_MATCH_SHORT_LABEL : undefined}
            className={badgeClass}
          />
        );
      }
      if (row.parsed && (normalized === "Нет в системе" || normalized === NEW_PRODUCT_ML_STATUS)) {
        return <span className={`${tagBase} ${amberTag}`}>Нет в системе</span>;
      }
      return <span className={`${tagBase} ${neutralTag}`}>Новый</span>;
    }
    if (row.parsed && (normalized === "На складе" || normalized === "Есть в системе (недостаточно)")) {
      return (
        <StockStatusBadge
          status={row.parsed.status}
          label={normalized === "Есть в системе (недостаточно)" ? INSUFFICIENT_STOCK_SHORT_LABEL : undefined}
          className={badgeClass}
        />
      );
    }
    return <span className={`${tagBase} ${neutralTag}`}>{row.mode === "catalog" ? "Каталог" : "Со склада"}</span>;
  };

  const warehouseSelect = needsWarehouse ? (
    <div className="relative w-full sm:w-72" ref={warehouseDropdownRef}>
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
          <span className="text-muted-foreground font-normal truncate">
            {warehouses.length === 0
              ? "Нет доступных складов"
              : hasNewRows
              ? "Склад для новых товаров *"
              : "Склад прихода *"}
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
          className="absolute bottom-full z-30 mb-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 focus:outline-none origin-bottom animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-150 ease-out-strong"
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
  ) : (
    <div />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleClose();
      }}
    >
      <div
        className="relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-xl bg-card shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong"
        onDragEnter={handleModalDragEnter}
        onDragOver={(e) => {
          if (isFileDrag(e)) e.preventDefault();
        }}
        onDragLeave={handleModalDragLeave}
        onDrop={handleModalDrop}
      >
        {draggingOver && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-card/90">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Upload size={18} /> Отпустите файл, чтобы распознать
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h3 className="text-base font-semibold text-foreground">Заявка на приход</h3>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-6">
          {error && (
            <div className="flex items-start gap-2 p-3 mb-3 shrink-0 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg">
              <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {isProjectLinked && (
            <div className="flex items-start gap-2 p-3 mb-3 shrink-0 bg-blue-50 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-400/25 rounded-lg">
              <FolderKanban size={14} className="text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-foreground">
                Заявка привязана к проекту{" "}
                <span className="font-semibold">{prefill!.projectName || `#${prefill!.projectId}`}</span>
                {" "}— так пересоздаётся отклонённая позиция прихода. Товар/количество и склад ниже уже заполнены;
                при необходимости их можно изменить перед отправкой.
              </p>
            </div>
          )}

          {/* Заголовок секции: подпись слева, загрузка файла справа */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shrink-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Товары *</span>
              {parseInfo && !parsing && (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background py-0.5 pl-2 pr-1 text-xs text-foreground">
                  <FileText size={12} className="text-primary shrink-0" />
                  <span className="truncate max-w-[10rem]" title={parseInfo.filename}>{parseInfo.filename}</span>
                  <span className="text-muted-foreground shrink-0">· {parseInfo.count} поз.</span>
                  <button
                    type="button"
                    onClick={() => openFilePicker(true)}
                    disabled={submitting}
                    className="shrink-0 rounded px-1 font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    Заменить
                  </button>
                  <button
                    type="button"
                    onClick={removeParsedRows}
                    disabled={submitting}
                    title="Убрать позиции из файла"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>

            {!isProjectLinked && (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
                {!parseInfo && !parsing && (
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">PDF, XLSX, DOCX до 20 МБ</span>
                )}
                <button
                  type="button"
                  onClick={() => openFilePicker(false)}
                  disabled={parsing || submitting}
                  title="PDF, XLSX, DOCX до 20 МБ"
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background disabled:opacity-60"
                >
                  {parsing ? <Loader2 size={13} className="animate-spin text-primary" /> : <Upload size={13} />}
                  {parsing ? "Распознаём…" : "Загрузить счёт"}
                </button>
              </div>
            )}
          </div>

          {parseError && (
            <div className="mt-2 flex shrink-0 items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-400/25 dark:bg-red-400/15">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
              <p className="flex-1 text-xs text-red-700 dark:text-red-300">{parseError}</p>
              <button
                type="button"
                onClick={() => setParseError(null)}
                title="Закрыть"
                className="shrink-0 text-red-700/70 hover:text-red-700 dark:text-red-300/70 dark:hover:text-red-300"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {parseInfo && !parsing && parsedRowsCount > 0 && (
            <p className="mt-1.5 shrink-0 text-xs text-muted-foreground">
              {parsedRowsCount} позиций
              {reviewCount > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-amber-700 dark:text-amber-300">{reviewCount} требуют проверки</span>
                </>
              )}
            </p>
          )}
          {parseInfo && (parseInfo.truncated > 0 || parseInfo.warnings.length > 0) && (
            <div className="mt-1.5 shrink-0 space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
              {parseInfo.truncated > 0 && <p>Лимит {MAX_ROWS} позиций: не добавлено ещё {parseInfo.truncated}.</p>}
              {parseInfo.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {/* Список позиций: прокручивается сам, шапка колонок остаётся на месте */}
          <div
            aria-busy={parsing}
            style={{ "--status-col": STATUS_COL_WIDTH } as React.CSSProperties}
            className={`mt-2 min-h-[8rem] flex-1 overflow-y-auto rounded-lg border border-border ${parsing ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="sticky top-0 z-10 hidden items-center gap-2 border-b border-border bg-background px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
              <span className={`shrink-0 ${STATUS_COL_CLASS}`}>Статус</span>
              <span className="flex-1">Наименование</span>
              <span className="w-[7.5rem] shrink-0">Кол-во</span>
              <span className="w-[7.5rem] shrink-0" />
            </div>

            <div className="divide-y divide-border">
              {rows.map((row) => {
                const qtyEmpty = !row.quantity;
                const parsedProblem = !!row.parsed && qtyEmpty;
                const needsAttention =
                  !!row.parsed && (!!row.parsed.suggested || row.parsed.warnings.length > 0 || qtyEmpty);
                const rowTint = parsedProblem
                  ? "bg-red-50/70 dark:bg-red-400/10"
                  : needsAttention
                  ? "bg-amber-50/70 dark:bg-amber-400/10"
                  : "";
                const unit =
                  row.mode === "existing" ? row.existing?.unit : row.mode === "catalog" ? row.catalog?.unit : row.parsed?.unit;
                const exact = row.mode === "new" ? findExactInStock(row.name) : null;
                const similar = row.mode === "new" && !exact ? findSimilarInStock(row.name) : [];

                return (
                  <div key={row.key} className={`px-3 py-2 ${rowTint}`}>
                    <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
                      <div className={`flex w-full shrink-0 items-center sm:min-h-[2.25rem] ${STATUS_COL_CLASS}`}>{renderRowBadge(row)}</div>

                      <div className="min-w-0 flex-1 basis-full sm:basis-0">
                        {row.mode === "new" ? (
                          // textarea растёт по содержимому: ref-колбэк пересоздаётся на каждом
                          // рендере, поэтому высота пересчитывается при любом изменении значения.
                          <textarea
                            ref={autoResizeTextarea}
                            rows={1}
                            value={row.name}
                            onChange={(e) => updateRow(row.key, { name: e.target.value.replace(/\s*[\r\n]+\s*/g, " ") })}
                            onKeyDown={(e) => {
                              // Название — один абзац: Enter не вставляет перенос строки
                              if (e.key === "Enter") e.preventDefault();
                            }}
                            placeholder="Наименование товара"
                            className={`block w-full resize-none overflow-hidden rounded-lg border bg-card px-3 py-2 text-sm leading-5 focus:border-primary focus:outline-none ${
                              exact ? "border-amber-400 dark:border-amber-500/60" : "border-border"
                            }`}
                          />
                        ) : row.mode === "catalog" && row.catalog ? (
                          <div className="flex items-start justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium text-foreground">{row.catalog.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Товар из каталога, остатков на складах нет. Приход на склад:{" "}
                                {selectedWarehouse ? (
                                  <span className="font-medium text-foreground">{selectedWarehouse.name}</span>
                                ) : (
                                  <span className="font-medium text-amber-700 dark:text-amber-300">выберите склад внизу</span>
                                )}
                              </p>
                            </div>
                            {/* Каталожные строки приходят только из парсера (row.parsed) —
                                смена режима для них заблокирована, поэтому крестик скрыт. */}
                            {!row.parsed && (
                              <button
                                type="button"
                                onClick={() => updateRow(row.key, { mode: "existing", catalog: null })}
                                title="Выбрать другой товар"
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
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

                      <div className="flex w-[7.5rem] shrink-0 items-center gap-1">
                        <input
                          value={row.quantity}
                          onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Кол-во"
                          className={`w-24 rounded-lg border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none ${
                            parsedProblem ? "border-red-400 dark:border-red-500/60" : "border-border"
                          }`}
                        />
                        <span className="w-8 truncate text-xs text-muted-foreground" title={unit || undefined}>{unit}</span>
                      </div>

                      <div className="flex w-[7.5rem] shrink-0 items-center justify-end gap-1 sm:min-h-[2.25rem]">
                        {/* У строк из документа (row.parsed) режим заблокирован: переключение
                            сбрасывает выбранный/распознанный товар, а на длинном списке это
                            легко нажать случайно. Удалить строку можно — это явное действие. */}
                        {!row.parsed && (
                          <button
                            type="button"
                            onClick={() =>
                              updateRow(
                                row.key,
                                row.mode === "new"
                                  ? { mode: "existing" }
                                  : { mode: "new", existing: null, catalog: null, name: row.name || row.catalog?.name || "" },
                              )
                            }
                            disabled={submitting}
                            title={
                              row.mode === "new"
                                ? "Выбрать существующий товар со склада вместо создания нового"
                                : "Создать новый товар вместо выбранного"
                            }
                            className="rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                          >
                            {row.mode === "new" ? "Найти на складе" : "Создать как новый"}
                          </button>
                        )}
                        <button
                          onClick={() => removeRow(row.key)}
                          disabled={rows.length === 1}
                          title="Убрать позицию"
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Вторая строка: подсказки и предупреждения, с отступом под колонку статуса */}
                    <div className={`space-y-1 text-xs ${STATUS_INDENT_CLASS}`}>
                      {row.parsed?.suggested && row.mode === "new" && (
                        <p className="mt-1 text-foreground">
                          Возможно: <span className="font-semibold">{row.parsed.suggested.name}</span>
                          {(() => {
                            const st = stockByProductId(row.parsed.suggested.productId);
                            const where = st ? livingWarehouseIds(st).map(whShort).join(", ") : "";
                            return where ? <span className="text-muted-foreground"> (на складе: {where})</span> : null;
                          })()}{" "}
                          <button
                            type="button"
                            onClick={() => applySuggestion(row)}
                            className="font-semibold text-primary underline underline-offset-2 hover:no-underline"
                          >
                            Выбрать
                          </button>
                        </p>
                      )}

                      {exact && (
                        <p className="mt-1 text-amber-800 dark:text-amber-300">
                          Такой товар уже есть на складе: {livingWarehouseIds(exact).map(whShort).join(", ") || "без остатков"}.{" "}
                          <button
                            type="button"
                            onClick={() => switchRowToExisting(row.key, exact)}
                            className="font-semibold underline underline-offset-2 hover:no-underline"
                          >
                            Выбрать его
                          </button>
                        </p>
                      )}

                      {similar.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
                          <span>Похожие на складе:</span>
                          {similar.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => switchRowToExisting(row.key, s)}
                              className="rounded border border-border bg-background px-2 py-0.5 text-foreground transition-colors hover:border-primary"
                            >
                              {s.name}{" "}
                              <span className="text-muted-foreground">
                                ({livingWarehouseIds(s).map(whShort).join(", ") || "без остатков"})
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {row.parsed && (qtyEmpty || row.parsed.warnings.length > 0) && (
                        <div className="mt-1 space-y-0.5 text-red-600 dark:text-red-300">
                          {qtyEmpty && (
                            <p>
                              Количество не распознано
                              {row.parsed.rawQuantity != null ? ` (в документе: ${row.parsed.rawQuantity})` : ""} — укажите вручную.
                            </p>
                          )}
                          {row.parsed.warnings.map((w, i) => (
                            <p key={i}>{w}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {parsing &&
                [0, 1, 2].map((i) => (
                  <div key={`sk-${i}`} className="flex items-center gap-2 px-3 py-3">
                    <div className={`h-6 w-full shrink-0 animate-pulse rounded bg-muted ${STATUS_COL_CLASS}`} />
                    <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                  </div>
                ))}
            </div>
          </div>

          <button
            onClick={addRow}
            disabled={rows.length >= MAX_ROWS}
            className="mt-2 flex w-fit shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <Plus size={13} /> Добавить товар
          </button>
        </div>

        <div className="flex shrink-0 flex-col-reverse items-stretch gap-3 border-t border-border px-6 py-4 mt-3 sm:flex-row sm:items-center sm:justify-between">
          {warehouseSelect}
          <div className="flex items-center justify-end gap-2">
            <button onClick={handleClose} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-background">
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || parsing}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Отправить заявку
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
