import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { PageWrap } from "../app/components/common/PageWrap";
import { SupplySourceBadge, SUPPLY_SOURCE_SHIPPED_LABELS, SUPPLY_SOURCE_PENDING_SHIPMENT_LABELS } from "../app/components/common/SupplySourceControl";
import { ShipmentModal } from "../app/components/modals/ShipmentModal";
import { IncomeRequestModal, IncomeRequestPrefill } from "../app/components/modals/IncomeRequestModal";
import { ConfirmDialog } from "../app/components/modals/ConfirmDialog";
import { ProjectRevertControl } from "../app/components/common/ProjectRevertControl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../app/components/ui/accordion";
import {
  Search,
  AlertTriangle,
  Loader2,
  X,
  PackageCheck,
  Building2,
  CheckCircle2,
  XCircle,
  Camera,
  Clock,
  Inbox,
  FileText,
  ArrowUpDown,
  Check,
  PackagePlus,
  Trash2,
  Package,
  Truck,
  User,
  Warehouse,
  History,
} from "lucide-react";
import type { ProjectState, Role } from "../types";
import {
  fetchWarehouseStocks,
  fetchWarehouseReceipts,
  postWarehouseIncome,
  setReceiptCancelled,
  denyIncomeReceipt,
  markReceiptSupplierDirect,
  confirmReceipt,
  updateReceiptDetails,
  reserveProjectItems,
  shipProjectItems,
  shipProjectItemsPerWarehouse,
  shipFromSupplier,
  SupplySourceMismatchError,
  fetchWarehouseShipments,
  fetchPendingShipments,
  fetchWarehouseList,
  downloadShipmentChecklist,
  uploadShipmentPhoto,
  presignReceiptPhotoUpload,
  presignShipmentPhotoUpload,
  resolveDefectReplacement,
  updateProductName,
  deleteProduct,
  WarehouseStockResponse,
  WarehouseReceiptResponse,
  WarehouseInfo,
  ShipmentPendingProject,
  SupplySource,
  ShipmentHistoryResponse,
  ReceiptStatus,
} from "../api/api";
import { uploadFileToR2 } from "../lib/uploadToR2";

type StockQuantityField = "total" | "reserved" | "defective" | "available";

const STOCK_SORT_OPTIONS: { field: StockQuantityField; label: string }[] = [
  { field: "total", label: "Всего" },
  { field: "reserved", label: "В резерве" },
  { field: "defective", label: "Брак" },
  { field: "available", label: "Доступно" },
];

const DEFAULT_WAREHOUSES: WarehouseInfo[] = [
  { id: 1, name: "Карабулак", code: "Кар" },
  { id: 2, name: "Абишова", code: "Аб" },
];

type StockRow = {
  id: number;
  productId: number;
  sku: string;
  name: string;
  unit: string;
  perWarehouse: Record<number, number>;
  total: number;
  reserved: number;
  defective: number;
  available: number;
};

// Понятный текст вместо сырого «Позиция «X» имеет источник поставки «stock»,
// а не «supplier_direct»»: что не так и что делать. expected — источник, который
// требует эндпоинт (то есть какой кнопкой пользователь пытался отгрузить).
function formatSupplySourceMismatch(error: SupplySourceMismatchError): string {
  const name = error.itemName ? `«${error.itemName}»` : "Позиция";

  if (error.expected === "supplier_direct") {
    return `${name} не помечена как позиция от поставщика — сначала отметьте её «Со склада поставщика» (в Закупках перед отправкой на приход или на вкладке «Поступления»), либо снимите отметку с этой позиции.`;
  }
  return error.message;
}

// Компактная кнопка действия в колонке действий прихода — единый вид для
// "Отклонить", "Удалить" и "От поставщика" (цвет рамки/текста задаёт вызывающий).
const ARRIVAL_ACTION_BTN =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50";

type ArrivalRow = {
  id: number;
  receiptNumber: string;
  project: string;
  projectId: number | null;
  date: string;
  warehouseName: string;
  warehouseId: number | null;
  supplier: string;
  sku: string;
  item: string;
  productId: number | null;
  qty: number;
  unit: string;
  status: ReceiptStatus;
  actualQuantity: number | null;
  warehouseComment: string | null;
  photoPath: string | null;
  // Готовый URL с бэкенда — рендерить фото только через него.
  photoUrl: string | null;
  confirmedAt: string | null;
  defectiveQuantity: number;
  defectResolved: boolean;
  // источник прихода: "pm_request" — создан через «Заявку на приход»
  source: string | null;
  // Источник связанной позиции; у denied-прихода supplier_direct
  // меняет подпись статуса (см. arrivalDirectShipLabel).
  supplySource: SupplySource;
  kit_group_key: string | null;
  kit_name: string | null;
  kit_quantity: number | string | null;
  quantity_per_kit: number | string | null;
};

// Группа вкладки "Приход" по проекту. NO_PROJECT_GROUP_KEY — записи без
// projectId: это заявки ПМ, отправленные не из проекта, а с дашборда
// (/warehouse/income-request без project_id).
const NO_PROJECT_GROUP_KEY = "no-project";
const NO_PROJECT_GROUP_NAME = "Заявка PM";

// Иерархия вкладки "Приход": склад (уровень 1) → проект (уровень 2) → дата
// (уровень 3). Первые два уровня сворачиваются, дата — статичный
// заголовок-разделитель над таблицей позиций.

// Уровень 3 — дата отправки заявки (ArrivalRow.date, бэк проставляет её при
// создании записи, до подтверждения кладовщиком). Свежие даты — сверху.
type ArrivalDateGroup = {
  key: string;
  dateLabel: string;
  dateTs: number;
  items: ArrivalRow[];
};

type ArrivalStatusCounts = {
  pendingCount: number;
  arrivedCount: number;
  cancelledCount: number;
  // Отдельно от cancelledCount: "denied" — это ПМ отклонил заявку, а не
  // кладовщик отменил приход (ReceiptStatus.DENIED на бэкенде).
  deniedCount: number;
  // denied-приходы, закрытые из-за отгрузки мимо склада (поставщик) —
  // это не отказ ПМ, считаем отдельно от deniedCount.
  directShipCount: number;
};

// Подпись статуса для denied-прихода с supplier_direct; undefined —
// обычный denied, подпись "Отклонено ПМ" остаётся.
const arrivalDirectShipLabel = (a: ArrivalRow): string | undefined =>
  a.status === "denied" ? SUPPLY_SOURCE_PENDING_SHIPMENT_LABELS[a.supplySource] : undefined;

// Уровень 2 — проект внутри склада.
type ArrivalGroup = ArrivalStatusCounts & {
  key: string;
  projectName: string;
  items: ArrivalRow[];
  lastMovementLabel: string;
  dateGroups: ArrivalDateGroup[];
};

// Уровень 1 — склад.
type ArrivalWarehouseGroup = ArrivalStatusCounts & {
  key: string;
  warehouseName: string;
  items: ArrivalRow[];
  projectGroups: ArrivalGroup[];
};

// a.date уже отформатирован в mapReceipt через toLocaleDateString("ru-RU")
// (dd.mm.yyyy) — сырой ISO там не хранится, поэтому для сравнения дат внутри
// группы парсим обратно этот же формат. confirmedAt, наоборот, хранится как
// сырой ISO (ArrivalRow.confirmedAt) — его парсит обычный new Date().
const parseRuDate = (value: string): number => {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return NaN;
  const [, d, m, y] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
};

// Печать собирает HTML строкой и отдаёт его document.write в новом окне,
// поэтому любое значение из БД (название товара, поставщик, проект) должно быть
// экранировано: иначе товар с именем вида <img src=x onerror=...> исполнится в
// окне печати.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Группирует позиции по a.date (уже отформатированная строка), свежие даты —
// сверху; записи без даты ("—", parseRuDate вернёт NaN) — в конец.
function buildArrivalDateGroups(items: ArrivalRow[]): ArrivalDateGroup[] {
  const map = new Map<string, ArrivalRow[]>();

  items.forEach((a) => {
    let bucket = map.get(a.date);
    if (!bucket) {
      bucket = [];
      map.set(a.date, bucket);
    }
    bucket.push(a);
  });

  const groups: ArrivalDateGroup[] = Array.from(map.entries()).map(([dateLabel, dateItems]) => ({
    key: dateLabel,
    dateLabel,
    dateTs: parseRuDate(dateLabel),
    items: dateItems,
  }));

  groups.sort((a, b) => {
    if (Number.isNaN(a.dateTs) && Number.isNaN(b.dateTs)) return 0;
    if (Number.isNaN(a.dateTs)) return 1;
    if (Number.isNaN(b.dateTs)) return -1;
    return b.dateTs - a.dateTs;
  });

  return groups;
}

// "Ждёт действия кладовщика" — всё, что не принято и не отклонено. Неизвестный
// статус с бэка считаем ожидающим: лучше показать лишнюю строку в работе, чем
// спрятать её в историю. Единственное определение pending на весь файл —
// от него зависит и подсчёт статусов, и перенос в историю.
const isPendingArrivalStatus = (status: ReceiptStatus) =>
  status !== "cancelled" && status !== "denied" && status !== "arrived";

// Ключи уровней дерева. Вынесены, чтобы разбивка на "в работе"/"историю"
// (splitArrivalsByCompletion) считала группы ровно теми же, что потом строит
// buildArrival*Groups — иначе критерий завершённости молча разъедется с тем,
// что видно на экране.
const arrivalWarehouseKey = (a: ArrivalRow) =>
  a.warehouseId != null ? `id:${a.warehouseId}` : `name:${a.warehouseName}`;

const arrivalProjectKey = (a: ArrivalRow) =>
  a.projectId != null ? String(a.projectId) : NO_PROJECT_GROUP_KEY;

function countArrivalStatuses(items: ArrivalRow[]): ArrivalStatusCounts {
  const counts: ArrivalStatusCounts = {
    pendingCount: 0,
    arrivedCount: 0,
    cancelledCount: 0,
    deniedCount: 0,
    directShipCount: 0,
  };

  items.forEach((a) => {
    if (isPendingArrivalStatus(a.status)) counts.pendingCount += 1;
    else if (a.status === "cancelled") counts.cancelledCount += 1;
    else if (arrivalDirectShipLabel(a)) counts.directShipCount += 1;
    else if (a.status === "denied") counts.deniedCount += 1;
    else counts.arrivedCount += 1;
  });

  return counts;
}

// Минимальная единица переноса в историю — дата-группа внутри проекта и склада
// (то, что на экране является одной таблицей): она завершена, когда ни одна её
// позиция не ждёт кладовщика. Делим сами строки, а не собранное дерево, —
// тогда оба дерева собираются теми же build*-функциями, и счётчики в шапках,
// сортировка и отбрасывание пустых групп получаются сами собой.
function splitArrivalsByCompletion(items: ArrivalRow[]): {
  active: ArrivalRow[];
  history: ArrivalRow[];
} {
  const dateGroupKey = (a: ArrivalRow) =>
    `${arrivalWarehouseKey(a)}::${arrivalProjectKey(a)}::${a.date}`;

  const unfinished = new Set<string>();
  items.forEach((a) => {
    if (isPendingArrivalStatus(a.status)) unfinished.add(dateGroupKey(a));
  });

  const active: ArrivalRow[] = [];
  const history: ArrivalRow[] = [];
  items.forEach((a) => {
    if (unfinished.has(dateGroupKey(a))) active.push(a);
    else history.push(a);
  });

  return { active, history };
}

// Порядок групп — сначала те, где есть pending-позиции (по убыванию их
// числа), затем остальные в порядке первого появления в arrivals (Array.sort
// стабилен, при равенстве компаратора порядок вставки в Map сохраняется).
function sortByPendingFirst<T extends { pendingCount: number }>(groups: T[]): T[] {
  return groups.sort((a, b) => {
    if (a.pendingCount > 0 && b.pendingCount > 0) return b.pendingCount - a.pendingCount;
    if (a.pendingCount > 0) return -1;
    if (b.pendingCount > 0) return 1;
    return 0;
  });
}

function buildArrivalProjectGroups(items: ArrivalRow[]): ArrivalGroup[] {
  const map = new Map<string, ArrivalRow[]>();

  items.forEach((a) => {
    const key = arrivalProjectKey(a);
    const bucket = map.get(key);
    if (bucket) bucket.push(a);
    else map.set(key, [a]);
  });

  const groups = Array.from(map.entries()).map(([key, groupItems]) => {
    const confirmedTimestamps = groupItems
      .map((it) => (it.confirmedAt ? new Date(it.confirmedAt).getTime() : NaN))
      .filter((t) => Number.isFinite(t));

    let lastTs: number | null = null;
    if (confirmedTimestamps.length > 0) {
      lastTs = Math.max(...confirmedTimestamps);
    } else {
      const dateTimestamps = groupItems
        .map((it) => parseRuDate(it.date))
        .filter((t) => Number.isFinite(t));
      if (dateTimestamps.length > 0) lastTs = Math.max(...dateTimestamps);
    }

    return {
      key,
      projectName: key === NO_PROJECT_GROUP_KEY ? NO_PROJECT_GROUP_NAME : groupItems[0].project,
      items: groupItems,
      lastMovementLabel: lastTs != null ? new Date(lastTs).toLocaleDateString("ru-RU") : "—",
      dateGroups: buildArrivalDateGroups(groupItems),
      ...countArrivalStatuses(groupItems),
    };
  });

  return sortByPendingFirst(groups);
}

// Ключи всех групп дерева — для форсированного раскрытия при поиске. Ключ
// проекта здесь тот же составной, что и в рендере (`${warehouseKey}::${key}`).
const warehouseKeysOf = (groups: ArrivalWarehouseGroup[]) => groups.map((w) => w.key);

const projectKeysOf = (groups: ArrivalWarehouseGroup[]) =>
  groups.flatMap((w) => w.projectGroups.map((g) => `${w.key}::${g.key}`));

// Значение для <Accordion value>: при активном поиске к запомненному вручную
// состоянию добавляются все ключи результата, вне поиска — только оно само.
const forcedExpansion = (manual: string[], allKeys: string[], isSearching: boolean) =>
  isSearching ? Array.from(new Set([...manual, ...allKeys])) : manual;

function buildArrivalWarehouseGroups(items: ArrivalRow[]): ArrivalWarehouseGroup[] {
  const map = new Map<string, ArrivalRow[]>();

  items.forEach((a) => {
    const key = arrivalWarehouseKey(a);
    const bucket = map.get(key);
    if (bucket) bucket.push(a);
    else map.set(key, [a]);
  });

  const groups = Array.from(map.entries()).map(([key, groupItems]) => ({
    key,
    warehouseName: groupItems[0].warehouseName,
    items: groupItems,
    projectGroups: buildArrivalProjectGroups(groupItems),
    ...countArrivalStatuses(groupItems),
  }));

  return sortByPendingFirst(groups);
}

type ShipmentHistoryItemRow = {
  id: number;
  productName: string;
  quantity: number;
  unit: string;
  // null — легитимное значение для бэкфилл-записей (отгрузки до появления
  // таблицы shipments): склад тогда не фиксировался. Схлопывать его в
  // плейсхолдер в маппере нельзя — тогда точка рендера не отличит его от
  // настоящего названия склада.
  warehouseName: string | null;
  // "supplier_direct" — отгрузка мимо нашего склада, warehouse_id
  // у неё NULL by design (это не "не зафиксирован").
  supplySource: SupplySource;
  kitGroupKey: string | null;
  kitName: string | null;
  kitQuantity: number | string | null;
  quantityPerKit: number | string | null;
  comment: string | null;
  photoPath: string | null;
  // Готовый URL с бэкенда — рендерить фото только через него.
  photoUrl: string | null;
  shippedBy: string | null;
  shippedAt: string | null;
};

type ShipmentRow = {
  id: number | null;
  projectId: number;
  projectName: string;
  // shippedAt хранится сырым ISO (в отличие от ArrivalRow.date, уже
  // отформатированного) — по нему сортируются группы, dateLabel только для показа.
  shippedAt: string | null;
  dateLabel: string;
  status: string;
  items: ShipmentHistoryItemRow[];
};

type ShipmentHistoryGroup = {
  key: string;
  projectName: string;
  shipments: ShipmentRow[];
  itemsCount: number;
  photosCount: number;
  lastShipmentLabel: string;
  lastShipmentTs: number | null;
};

type PendingShipmentItemRow = {
  id: number;
  productName: string;
  quantity: number;
  unit: string;
  checked: boolean;
  warehouseId: number | null;
  availableWarehouses: { warehouseId: number; warehouseName: string }[];
  photo: File | null;
  photoUploadProgress?: number | null;
  kitGroupKey: string | null;
  kitName: string | null;
  kitQuantity: number | string | null;
  quantityPerKit: number | string | null;
  supplySource: SupplySource;
};

type PendingShipmentProjectRow = {
  projectId: number;
  projectName: string;
  items: PendingShipmentItemRow[];
  submitting?: boolean;
  error?: string | null;
};

function deriveWarehouses(items: WarehouseStockResponse[]): WarehouseInfo[] {
  const found = new Map<number, string>();
  items.forEach((item) => {
    (item.stocks || []).forEach((s) => {
      if (!found.has(s.warehouse_id)) {
        found.set(s.warehouse_id, s.warehouse_name);
      }
    });
  });

  if (found.size === 0) return DEFAULT_WAREHOUSES;

  return Array.from(found.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, name]) => {
      const known = DEFAULT_WAREHOUSES.find((w) => w.id === id);
      return {
        id,
        name,
        code: known?.code || name.slice(0, 3),
      };
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
    productId: item.product_id || item.id,
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

const WAREHOUSE_API_BASE = "/api/v1";

async function sendProjectToShipment(projectId: number) {
  const response = await fetch(`${WAREHOUSE_API_BASE}/projects/${projectId}/send-to-shipment`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Не удалось перевести проект в статус 'На отгрузке'");
  }

  return response.json().catch(() => null);
}

async function sendProjectToDocuments(projectId: number) {
  const response = await fetch(`${WAREHOUSE_API_BASE}/projects/${projectId}/wait-for-documents`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Не удалось перевести проект в статус 'Ожидание документов'");
  }

  return response.json().catch(() => null);
}

// ПМ удаляет свою заявку на приход, пока кладовщик её не принял
async function deleteIncomeRequest(receiptId: number) {
  const response = await fetch(`${WAREHOUSE_API_BASE}/warehouse/receipts/${receiptId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    let message = "";
    try {
      const body = await response.json();
      message = typeof body?.detail === "string" ? body.detail : "";
    } catch {
      /* тело не JSON */
    }
    throw new Error(message || "Не удалось удалить заявку на приход");
  }
}

function mapReceipt(item: WarehouseReceiptResponse): ArrivalRow {
  return {
    id: item.id,
    receiptNumber: item.receipt_number || `ПР-${item.id}`,
    project: item.project_name || (item.project_id ? `Проект #${item.project_id}` : "—"),
    projectId: item.project_id ?? null,
    date: item.date ? new Date(item.date).toLocaleDateString("ru-RU") : "—",
    warehouseName: item.warehouse?.name || (item.warehouse_id ? `Склад №${item.warehouse_id}` : "—"),
    warehouseId: item.warehouse_id ?? null,
    supplier:
      item.supplier?.supplier_name ||
      item.supplier?.name ||
      item.supplier_raw_name ||
      (item.supplier_id ? `Поставщик #${item.supplier_id}` : "—"),
    sku: (item as any).product?.sku || (item.product_id ? `P-${item.product_id}` : "—"),
    item: item.product?.name || (item.product_id ? `Товар #${item.product_id}` : "—"),
    productId: item.product_id ?? null,
    qty: item.quantity ?? 0,
    unit: item.product?.unit || "шт",
    status: item.status?.toLowerCase() || "pending",
    actualQuantity: item.actual_quantity ?? null,
    warehouseComment: item.warehouse_comment ?? null,
    photoPath: item.photo_path ?? null,
    photoUrl: item.photo_url ?? null,
    confirmedAt: item.confirmed_at ?? null,
    defectiveQuantity: item.defective_quantity ?? 0,
    defectResolved: item.defect_resolved ?? false,
    source: (item as any).source ?? null,
    supplySource: item.supply_source ?? "stock",
    kit_group_key: item.kit_group_key ?? null,
    kit_name: item.kit_name ?? null,
    kit_quantity: item.kit_quantity ?? null,
    quantity_per_kit: item.quantity_per_kit ?? null,
  };
}

function mapShipment(item: ShipmentHistoryResponse): ShipmentRow {
  return {
    id: item.id ?? null,
    projectId: item.project_id,
    projectName: item.project_name || `Проект #${item.project_id}`,
    shippedAt: item.shipped_at ?? null,
    dateLabel: item.shipped_at ? new Date(item.shipped_at).toLocaleDateString("ru-RU") : "—",
    status: item.status || "Отгружено",
    items: (item.items || []).map((it) => ({
      id: it.id,
      productName: it.product_name || (it.product_id ? `Товар #${it.product_id}` : "—"),
      quantity: it.quantity ?? 0,
      unit: it.unit || "шт",
      warehouseName: it.warehouse_name || (it.warehouse_id != null ? `Склад №${it.warehouse_id}` : null),
      supplySource: it.supply_source ?? "stock",
      kitGroupKey: it.kit_group_key ?? null,
      kitName: it.kit_name ?? null,
      kitQuantity: it.kit_quantity ?? null,
      quantityPerKit: it.quantity_per_kit ?? null,
      comment: it.comment ?? null,
      // Бэкенд отдаёт фото списком (photos[]) — на позицию обычно ровно
      // одно, берём первое. Раньше здесь читалось несуществующее
      // it.photo_path/it.photo_url (их нет в ShipmentHistoryItem, только в
      // элементах photos[]), из-за чего фото никогда не отображалось.
      photoPath: it.photos?.[0]?.photo_path ?? null,
      photoUrl: it.photos?.[0]?.photo_url ?? null,
      shippedBy: it.shipped_by ?? null,
      shippedAt: it.shipped_at ?? null,
    })),
  };
}

// Сводка статусов в шапке группы склада и группы проекта на вкладке "Приход".
// Только span-элементы: рендерится внутри AccordionTrigger, т.е. внутри
// <button>, куда блочные теги вкладывать нельзя.
function ArrivalStatusBadges({ counts }: { counts: ArrivalStatusCounts }) {
  return (
    <span className="flex items-center gap-2 flex-wrap">
      {counts.pendingCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-200 whitespace-nowrap">
          <Clock size={12} /> ожидает {counts.pendingCount}
        </span>
      )}
      {counts.arrivedCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-400/20 text-green-700 dark:text-green-300 whitespace-nowrap">
          <CheckCircle2 size={12} /> принято {counts.arrivedCount}
        </span>
      )}
      {counts.cancelledCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-400/20 text-red-700 dark:text-red-300 whitespace-nowrap">
          <XCircle size={12} /> отклонено {counts.cancelledCount}
        </span>
      )}
      {counts.directShipCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-400/20 text-sky-700 dark:text-sky-300 whitespace-nowrap">
          <Truck size={12} /> будет отправлено {counts.directShipCount}
        </span>
      )}
      {counts.deniedCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-400/20 text-rose-700 dark:text-rose-300 whitespace-nowrap">
          <XCircle size={12} /> отклонено ПМ {counts.deniedCount}
        </span>
      )}
    </span>
  );
}

// ==========================================
// Модалка оприходования товара вручную
// ==========================================
function AddStockModal({
  warehouses,
  onClose,
  onSuccess,
}: {
  warehouses: WarehouseInfo[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>(warehouses[0] ? String(warehouses[0].id) : "1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!productId || !quantity || !supplierId || !warehouseId) {
      setError("Укажите товар, количество, поставщика и склад");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await postWarehouseIncome({
        items: [
          {
            product_id: Number(productId),
            quantity: Number(quantity),
            supplier_id: Number(supplierId),
            warehouse_id: Number(warehouseId),
          },
        ],
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Не удалось оприходовать товар");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">Добавить товар на склад</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
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
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card text-foreground font-medium"
            >
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">ID товара *</label>
            <input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              type="number"
              placeholder="Например, 12"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Количество *</label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              placeholder="Например, 500"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">ID поставщика *</label>
            <input
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              type="number"
              placeholder="Например, 3"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-background rounded-lg">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Оприходовать
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Модалка подтверждения прихода кладовщиком
// ==========================================
function ConfirmReceiptModal({
  receipt,
  onClose,
  onSuccess,
}: {
  receipt: ArrivalRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [actualQuantity, setActualQuantity] = useState(String(receipt.qty));
  const [defectiveQuantity, setDefectiveQuantity] = useState("0");
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const qty = Number(actualQuantity);
    const defQty = Number(defectiveQuantity);

    if (!actualQuantity || Number.isNaN(qty) || qty < 0) {
      setError("Укажите корректное фактическое количество");
      return;
    }
    if (Number.isNaN(defQty) || defQty < 0) {
      setError("Укажите корректное количество брака");
      return;
    }

    if (qty + defQty > receipt.qty) {
      setError(`Общее количество (нормальные + брак) не может превышать план (${receipt.qty} шт.)`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setUploadProgress(null);

    // Фото грузится в два независимых шага (PUT в R2, затем подтверждение
    // на бэкенде) — ошибки на них означают разное для пользователя, поэтому
    // различаем сообщения, а не сводим всё к одному "не удалось".
    let photoObjectKey: string | null = null;
    if (photo) {
      try {
        const presign = await presignReceiptPhotoUpload(receipt.id, photo.type || "application/octet-stream", photo.name);
        setUploadProgress(0);
        await uploadFileToR2(presign.upload_url, photo, setUploadProgress);
        photoObjectKey = presign.object_key;
      } catch (e) {
        console.error("Не удалось загрузить фото прихода в R2", e);
        setError("Не удалось загрузить фото. Проверьте соединение и попробуйте ещё раз.");
        setSubmitting(false);
        setUploadProgress(null);
        return;
      }
    }

    try {
      await confirmReceipt(receipt.id, {
        actual_quantity: qty,
        defective_quantity: defQty,
        comment,
        photo_object_key: photoObjectKey,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(
        photoObjectKey
          ? "Фото загружено, но не удалось подтвердить приход. Попробуйте ещё раз."
          : typeof detail === "string"
          ? detail
          : "Не удалось подтвердить приход"
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Подтвердить приход {receipt.receiptNumber}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {receipt.item} · план {receipt.qty} {receipt.unit} · {receipt.supplier} ({receipt.warehouseName})
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg">
            <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Сколько пришло на самом деле *
            </label>
            <input
              value={actualQuantity}
              onChange={(e) => setActualQuantity(e.target.value)}
              type="number"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Количество брака
            </label>
            <input
              value={defectiveQuantity}
              onChange={(e) => setDefectiveQuantity(e.target.value)}
              type="number"
              min="0"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Комментарий кладовщика</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Например: 2 шт с повреждённой упаковкой"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="flex items-center justify-between gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg cursor-pointer hover:bg-background text-muted-foreground">
              <span className="flex items-center gap-2">
                <Camera size={15} className="text-primary" />
                {photo ? photo.name : "Прикрепить фото товара"}
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-muted-foreground/70 italic">необязательно</span>
                {photo && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPhoto(null);
                    }}
                    title="Убрать фото"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              />
            </label>
            {uploadProgress != null && (
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-background rounded-lg">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Подтвердить приход
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Лайтбокс увеличенного просмотра фото — общий для ReceiptDetailsModal и
// ShipmentDetailsModal (был захардкожен только под отгрузку).
// ==========================================
function PhotoLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <img src={src} alt={alt} className="max-h-[90vh] max-w-full rounded-lg object-contain animate-in fade-in zoom-in-95 duration-200 ease-out-strong" />
    </div>
  );
}

// ==========================================
// Модалка просмотра деталей уже подтверждённого прихода
// ==========================================
function ReceiptDetailsModal({
  receipt,
  canEdit,
  onClose,
  onSuccess,
}: {
  receipt: ArrivalRow;
  canEdit: boolean;
  onClose: () => void;
  onSuccess: (updated: ArrivalRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(receipt.warehouseComment || "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const photoUrl = receipt.photoUrl;

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    setUploadProgress(null);

    // См. ConfirmReceiptModal.handleSubmit — тот же принцип раздельных
    // сообщений об ошибке для шага загрузки в R2 и шага сохранения.
    let photoObjectKey: string | undefined;
    if (photo) {
      try {
        const presign = await presignReceiptPhotoUpload(receipt.id, photo.type || "application/octet-stream", photo.name);
        setUploadProgress(0);
        await uploadFileToR2(presign.upload_url, photo, setUploadProgress);
        photoObjectKey = presign.object_key;
      } catch (e) {
        console.error("Не удалось загрузить фото прихода в R2", e);
        setError("Не удалось загрузить фото. Проверьте соединение и попробуйте ещё раз.");
        setSubmitting(false);
        setUploadProgress(null);
        return;
      }
    }

    try {
      const updated = await updateReceiptDetails(receipt.id, { comment, photo_object_key: photoObjectKey });
      onSuccess(mapReceipt(updated));
      setEditing(false);
      setPhoto(null);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(
        photoObjectKey
          ? "Фото загружено, но не удалось сохранить изменения. Попробуйте ещё раз."
          : typeof detail === "string"
          ? detail
          : "Не удалось сохранить изменения"
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleResolveDefect = async () => {
    setResolving(true);
    setError(null);
    try {
      const updated = await resolveDefectReplacement(receipt.id);
      onSuccess(mapReceipt(updated));
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Не удалось отметить замену");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Приход {receipt.receiptNumber}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg">
            <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between"><span className="text-muted-foreground">Товар</span><span className="font-medium text-foreground text-right">{receipt.item}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Поставщик</span><span className="font-medium text-foreground">{receipt.supplier}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Склад</span><span className="font-medium text-foreground">{receipt.warehouseName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">План / Факт</span><span className="font-mono font-medium text-foreground">{receipt.qty} / {receipt.actualQuantity ?? "—"} {receipt.unit}</span></div>
          {receipt.defectiveQuantity > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Брак</span><span className="font-mono font-medium text-destructive">{receipt.defectiveQuantity} {receipt.unit}</span></div>
          )}
          {receipt.confirmedAt && (
            <div className="flex justify-between"><span className="text-muted-foreground">Подтверждено</span><span className="font-medium text-foreground">{new Date(receipt.confirmedAt).toLocaleString("ru-RU")}</span></div>
          )}
        </div>

        {receipt.defectiveQuantity > 0 && !receipt.defectResolved && canEdit && (
          <button
            onClick={handleResolveDefect}
            disabled={resolving}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 mb-4"
          >
            {resolving && <Loader2 size={14} className="animate-spin" />}
            Поступил товар вместо брака ({receipt.defectiveQuantity} шт.)
          </button>
        )}

        {receipt.defectResolved && (
          <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 font-medium mb-4">
            <CheckCircle2 size={13} /> Замена брака поступила
          </div>
        )}

        {photoUrl && !editing && (
          <img
            src={photoUrl}
            alt="Фото товара"
            onClick={() => setPreviewOpen(true)}
            className="w-full rounded-lg border border-border mb-4 max-h-64 object-contain bg-background cursor-pointer"
          />
        )}

        {!editing ? (
          <>
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Комментарий кладовщика</p>
              <p className="text-sm text-foreground italic">
                {receipt.warehouseComment ? `"${receipt.warehouseComment}"` : "Без комментария"}
              </p>
            </div>

            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-background"
              >
                <Camera size={14} /> Изменить фото / комментарий
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Комментарий кладовщика</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary resize-none"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg cursor-pointer hover:bg-background text-muted-foreground">
                <Camera size={15} className="text-primary" />
                {photo ? photo.name : "Заменить фото товара"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                />
              </label>
              {uploadProgress != null && (
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setEditing(false);
                  setComment(receipt.warehouseComment || "");
                  setPhoto(null);
                }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-background rounded-lg"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        )}
      </div>

      {previewOpen && photoUrl && (
        <PhotoLightbox src={photoUrl} alt="Фото товара" onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

// ==========================================
// Модалка деталей уже выполненной отгрузки (read-only) — позиции накладной
// с фото, которое кладовщик приложил в момент отгрузки
// ==========================================
function ShipmentDetailsModal({
  shipment,
  onClose,
}: {
  shipment: ShipmentRow;
  onClose: () => void;
}) {
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const shippedBy = shipment.items.find((it) => it.shippedBy)?.shippedBy || null;
  const photosCount = shipment.items.filter((it) => it.photoUrl).length;
  // Дата в строках нужна, только если позиции отгружались в разное время;
  // когда у всех одна (до минуты) — она уже есть в шапке "Дата отгрузки".
  const showItemDates =
    new Set(shipment.items.map((it) => (it.shippedAt ? it.shippedAt.slice(0, 16) : ""))).size > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Отгрузка {shipment.id != null ? `№${shipment.id}` : ""}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{shipment.projectName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 text-sm mb-5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Дата отгрузки</span>
            <span className="font-medium text-foreground">
              {shipment.shippedAt ? new Date(shipment.shippedAt).toLocaleString("ru-RU") : shipment.dateLabel}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Позиций</span>
            <span className="font-mono font-medium text-foreground">{shipment.items.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Отгрузил</span>
            {shippedBy ? (
              <span className="font-medium text-foreground">{shippedBy}</span>
            ) : (
              <span className="text-muted-foreground italic">не зафиксировано</span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Фото</span>
            <span className="font-mono font-medium text-foreground">
              {photosCount} из {shipment.items.length}
            </span>
          </div>
        </div>

        {shipment.items.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <Inbox size={22} className="text-muted-foreground/50" />
            В накладной нет позиций
          </div>
        ) : (
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Товар</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Кол-во</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Ед.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Источник / склад</th>
                  {showItemDates && (
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Дата</th>
                  )}
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">Фото</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shipment.items.map((it) => {
                  const photoUrl = it.photoUrl;
                  const sourceLabel = SUPPLY_SOURCE_SHIPPED_LABELS[it.supplySource];

                  return (
                    <tr key={it.id} className="align-middle">
                      <td className="px-3 py-2 text-sm text-foreground">
                        <span className="font-medium">{it.productName}</span>

                        {it.kitGroupKey ? (
                          <span
                            className="mt-0.5 flex w-fit max-w-[220px] items-center gap-1 text-[10px] font-semibold text-primary"
                            title={`из комплекта «${(it.kitName || "").trim() || "Комплект"}»${it.quantityPerKit != null ? ` ×${it.quantityPerKit}` : ""}`}
                          >
                            <Package size={10} className="shrink-0" />
                            <span className="truncate">
                              из комплекта «{(it.kitName || "").trim() || "Комплект"}»
                              {it.quantityPerKit != null ? ` ×${it.quantityPerKit}` : ""}
                            </span>
                          </span>
                        ) : null}

                        {/* null (комментария не было) и непустая строка — разные
                            случаи: у бэкфилл-строк здесь лежит пояснение с
                            бэкенда, и оно должно рендериться. Пустую строку и
                            пробелы отсекаем отдельно, чтобы не показывать «""». */}
                        {it.comment != null && it.comment.trim() !== "" && (
                          <p
                            className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground italic"
                            title={it.comment.trim()}
                          >
                            "{it.comment.trim()}"
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-foreground whitespace-nowrap">
                        {it.quantity.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{it.unit}</td>
                      <td className="px-3 py-2 text-xs">
                        {sourceLabel ? (
                          <span className="font-medium text-foreground">{sourceLabel}</span>
                        ) : it.warehouseName ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <Building2 size={11} className="text-blue-600 dark:text-blue-400" />
                            {it.warehouseName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">склад не зафиксирован</span>
                        )}
                      </td>
                      {showItemDates && (
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {it.shippedAt ? new Date(it.shippedAt).toLocaleString("ru-RU") : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        {photoUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto(photoUrl)}
                            title="Открыть фото"
                            className="inline-block overflow-hidden rounded border border-border hover:border-primary transition-colors"
                          >
                            <img
                              src={photoUrl}
                              alt={`Фото ${it.productName}`}
                              className="h-8 w-8 object-cover bg-background"
                            />
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                            <Camera size={12} /> нет
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewPhoto && (
        <PhotoLightbox src={previewPhoto} alt="Фото отгрузки" onClose={() => setPreviewPhoto(null)} />
      )}
    </div>
  );
}

export function WarehousePage({
  role,
  projectState,
  onOpenProject,
}: {
  role: Role;
  projectState: ProjectState;
  /** Opens the project page — called after a project is reverted to editing. */
  onOpenProject?: (projectId: number) => void;
}) {
  const isWarehouseUser = role === "warehouse";
  const isPm = role === "pm" || role === "admin";
  // "director" — легаси-алиас commercial_director, см. ProjectPage.tsx:4071.
  const isCommercialDirector = role === "commercial_director" || (role as string) === "director";
  // Отметка "отправлено со склада поставщика" — решение PM и Комдира,
  // а не кладовщика (у таких позиций нет резерва на нашем складе).
  const canShipDirect = isPm || isCommercialDirector;

  const [tab, setTab] = useState<"stock" | "arrivals" | "shipments">("stock");

  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(DEFAULT_WAREHOUSES);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "all">("all");

  const [stock, setStock] = useState<StockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "reserved" | "brak">("all");
  const [stockSearch, setStockSearch] = useState("");
  const [stockSortField, setStockSortField] = useState<StockQuantityField | null>("available");
  const [stockSortDir, setStockSortDir] = useState<"asc" | "desc">("desc");
  const [isStockSortMenuOpen, setIsStockSortMenuOpen] = useState(false);
  // Поле "Наименование" по умолчанию readOnly для директора; клик/фокус на
  // нём не редактирует его напрямую, а открывает renameUnlockTarget —
  // диалог подтверждения ДО того, как директор начал печатать (см.
  // openRenameUnlock/confirmRenameUnlock ниже). unlockedRenameProductId —
  // строка (по item.id), для которой это подтверждение уже получено и
  // textarea реально редактируема; nameTextareaRefs нужен, чтобы
  // программно сфокусировать её сразу после подтверждения.
  const [renameUnlockTarget, setRenameUnlockTarget] = useState<{
    rowId: number;
    productId: number;
    name: string;
  } | null>(null);
  const [unlockedRenameProductId, setUnlockedRenameProductId] = useState<number | null>(null);
  const nameTextareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const [renamingProductId, setRenamingProductId] = useState<number | null>(null);
  const [deleteProductTarget, setDeleteProductTarget] = useState<StockRow | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [deleteProductError, setDeleteProductError] = useState<string | null>(null);

  const [arrivals, setArrivals] = useState<ArrivalRow[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [arrivalsError, setArrivalsError] = useState<string | null>(null);
  const [arrivalSearch, setArrivalSearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ArrivalRow | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ArrivalRow | null>(null);
  const [cancellingReceiptId, setCancellingReceiptId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArrivalRow | null>(null);
  const [deletingReceiptId, setDeletingReceiptId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ПМ отклоняет позицию прихода (в отличие от handleToggleCancel выше —
  // тот для кладовщика). После успешного отклонения, если позиция была
  // привязана к проекту, сразу открываем «Заявку на приход» с
  // предзаполненными товаром/количеством/складом — см. handleDenySuccess.
  const [denyTarget, setDenyTarget] = useState<ArrivalRow | null>(null);
  const [denyingReceiptId, setDenyingReceiptId] = useState<number | null>(null);
  const [markingSupplierDirectId, setMarkingSupplierDirectId] = useState<number | null>(null);
  // Подтверждение перед "От поставщика": действие закрывает приход (denied)
  // без возможности вернуть, поэтому клик только открывает диалог.
  const [supplierDirectTarget, setSupplierDirectTarget] = useState<ArrivalRow | null>(null);
  const [supplierDirectError, setSupplierDirectError] = useState<string | null>(null);
  const [denyError, setDenyError] = useState<string | null>(null);

  // Заявка на приход, открытая из деньга — держим вместе с id исходного
  // прихода, чтобы принудительно пересоздавать модалку (через key) при
  // повторных деньгах подряд, а не полагаться только на условный рендер.
  const [reorderRequest, setReorderRequest] = useState<{ prefill: IncomeRequestPrefill; sourceReceiptId: number } | null>(null);

  // NEW: раскрытие двух сворачиваемых уровней вкладки "Приход" — склада
  // (уровень 1) и проекта внутри склада (уровень 2), независимо друг от
  // друга. Значение — список открытых ключей для Radix Accordion
  // (type="multiple"). Ключ проекта составной,
  // `${warehouseKey}::${projectKey}`: один и тот же проект может встретиться
  // под разными складами. Состояние держим здесь, а не внутри аккордеона,
  // чтобы оно переживало и схлопывание склада (Radix размонтирует содержимое),
  // и полные перезагрузки arrivals после действий — handleConfirmSuccess и
  // т.п. его не трогают.
  // Склады в активном списке раскрываются сами при первой загрузке (см. эффект
  // ниже), проекты внутри них — нет; в истории по умолчанию свёрнуто всё.
  const [expandedArrivalWarehouses, setExpandedArrivalWarehouses] = useState<string[]>([]);
  const [expandedArrivalGroups, setExpandedArrivalGroups] = useState<string[]>([]);
  const [expandedArrivalHistoryWarehouses, setExpandedArrivalHistoryWarehouses] = useState<string[]>([]);
  const [expandedArrivalHistoryGroups, setExpandedArrivalHistoryGroups] = useState<string[]>([]);

  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);
  const [shipmentSearch, setShipmentSearch] = useState("");

  // Раскрытие групп-проектов в истории отгрузок — список открытых ключей для
  // Radix Accordion (type="multiple"), как на вкладке "Приход". Состояние
  // держим здесь, чтобы оно переживало перезагрузку списка после отгрузки
  // (loadShipments) и схлопывание аккордеона.
  const [expandedShipmentGroups, setExpandedShipmentGroups] = useState<string[]>([]);

  const [shipmentDetailsTarget, setShipmentDetailsTarget] = useState<ShipmentRow | null>(null);

  const [pendingShipments, setPendingShipments] = useState<PendingShipmentProjectRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  // Ключ вида "{projectId}:{warehouseId}" — раздельный loading-статус для
  // кнопок "Список KAR"/"Список AB", чтобы не путать их с обычным
  // "Список" (downloadingChecklistId) при параллельных загрузках.
  const [downloadingWarehouseChecklistKey, setDownloadingWarehouseChecklistKey] = useState<string | null>(null);

  // Ключ группы — String(projectId), как и раньше: уровень один, составные
  // ключи (как у проектов внутри складов на "Приходе") здесь не нужны.
  const [expandedPendingShipmentGroups, setExpandedPendingShipmentGroups] = useState<string[]>([]);

  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showIncomeRequestModal, setShowIncomeRequestModal] = useState(false);

  const [downloadingChecklistId, setDownloadingChecklistId] = useState<number | null>(null);

  useEffect(() => {
    loadWarehousesList();
    loadStock();
    loadArrivals();
    loadShipments();
    loadPendingShipments();
  }, []);

  const loadWarehousesList = async () => {
    try {
      const list = await fetchWarehouseList();
      if (list && list.length > 0) {
        setWarehouses(list);
      }
    } catch (e) {
      console.error("Не удалось загрузить справочник складов, используем производный список", e);
    }
  };

  const loadStock = async () => {
    setStockLoading(true);
    setStockError(null);
    try {
      const data = await fetchWarehouseStocks();
      setWarehouses((prev) => (prev.length > 0 ? prev : deriveWarehouses(data)));
      setStock(data.map(mapStock));
    } catch (e) {
      setStockError(e instanceof Error ? e.message : "Не удалось загрузить остатки склада");
    } finally {
      setStockLoading(false);
    }
  };

  // Автоподгонка высоты <textarea> под содержимое — без неё однострочный
  // инпут либо обрезал длинные названия по ширине, либо заставлял листать
  // текст внутри узкого поля (см. баг: "Набор резцов по дереву Китай
  // компл" — конец не влезал). Textarea вместо <input> переносит текст на
  // несколько строк, как уже сделано для "Исходный товар"/триггера
  // "Совпавший товар" на ProjectPage; высота растёт по scrollHeight и на
  // вводе, и сразу после revert (см. ниже), чтобы поле не оставалось
  // "растянутым" под уже не показываемый текст.
  const autoResizeNameTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Инлайн-переименование товара (только commercial_director). Поле
  // readOnly, пока строка не в unlockedRenameProductId — клик/фокус на нём
  // не редактирует его напрямую, а сразу открывает диалог подтверждения
  // (см. openRenameUnlock ниже), ДО того как директор вообще начал
  // печатать. Только после явного "Изменить" в этом диалоге поле
  // становится редактируемым и получает фокус (см. useEffect по
  // unlockedRenameProductId ниже) — а вот САМО сохранение при уходе с
  // поля (blur/Enter) происходит уже без второго диалога, напрямую (см.
  // handleProductNameBlur), раз подтверждение на вход в редактирование
  // уже было получено.
  const openRenameUnlock = (item: StockRow) => {
    setRenameUnlockTarget({ rowId: item.id, productId: item.productId, name: item.name });
  };

  const closeRenameUnlock = () => {
    setRenameUnlockTarget(null);
  };

  const confirmRenameUnlock = () => {
    if (!renameUnlockTarget) return;
    setUnlockedRenameProductId(renameUnlockTarget.rowId);
    setRenameUnlockTarget(null);
  };

  // Фокус переносим сюда (а не сразу в confirmRenameUnlock), потому что на
  // момент вызова confirmRenameUnlock textarea в DOM ещё readOnly —
  // readOnly=false применится только после ре-рендера с новым
  // unlockedRenameProductId, и .focus() нужно вызывать уже после него.
  useEffect(() => {
    if (unlockedRenameProductId === null) return;
    nameTextareaRefs.current.get(unlockedRenameProductId)?.focus();
  }, [unlockedRenameProductId]);

  // Сохранение по blur/Enter — без диалога (подтверждение уже получено на
  // входе в редактирование, см. openRenameUnlock/confirmRenameUnlock
  // выше). Как и раньше у cost_price-подобных полей: сохраняем, только
  // если значение реально изменилось; при ошибке (в т.ч. 400 "имя уже
  // занято" — см. throwWithDetail в api.ts) — toast + revert значения.
  // В любом случае (сохранили, ошиблись или ничего не поменяли) поле
  // возвращается в readOnly.
  const handleProductNameBlur = async (
    item: StockRow,
    event: React.FocusEvent<HTMLTextAreaElement>,
  ) => {
    const previous = item.name;
    const target = event.target;
    const nextName = target.value.trim();

    if (!nextName) {
      toast.error("Название товара не может быть пустым");
      target.value = previous;
      autoResizeNameTextarea(target);
      setUnlockedRenameProductId(null);
      return;
    }
    if (nextName === previous) {
      setUnlockedRenameProductId(null);
      return;
    }

    setRenamingProductId(item.productId);
    try {
      const updated = await updateProductName(item.productId, nextName);
      setStock((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, name: updated.name } : row)),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось изменить название товара");
      target.value = previous;
      autoResizeNameTextarea(target);
    } finally {
      setRenamingProductId(null);
      setUnlockedRenameProductId(null);
    }
  };

  // Удаление товара (только commercial_director) — кнопка всегда видна,
  // но задизейблена, пока на складе есть остаток/резерв/брак (см. условие
  // в рендере таблицы). Подтверждение — тот же ConfirmDialog, что и у
  // удаления заявки на приход (openDeleteReceipt выше), не window.confirm.
  const openDeleteProduct = (item: StockRow) => {
    setDeleteProductError(null);
    setDeleteProductTarget(item);
  };

  const closeDeleteProduct = () => {
    if (deletingProductId !== null) return;
    setDeleteProductTarget(null);
    setDeleteProductError(null);
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProductTarget) return;
    const target = deleteProductTarget;

    setDeletingProductId(target.productId);
    setDeleteProductError(null);
    try {
      await deleteProduct(target.productId);
      setStock((prev) => prev.filter((row) => row.id !== target.id));
      setDeleteProductTarget(null);
    } catch (error) {
      setDeleteProductError(
        error instanceof Error ? error.message : "Не удалось удалить товар",
      );
    } finally {
      setDeletingProductId(null);
    }
  };

  const loadArrivals = async () => {
    setArrivalsLoading(true);
    setArrivalsError(null);
    try {
      const data = await fetchWarehouseReceipts();
      setArrivals(data.map(mapReceipt));
    } catch (e) {
      setArrivalsError(e instanceof Error ? e.message : "Не удалось загрузить данные о приходах");
    } finally {
      setArrivalsLoading(false);
    }
  };

  const loadShipments = async () => {
    setShipmentsLoading(true);
    setShipmentsError(null);
    try {
      const data = await fetchWarehouseShipments();
      setShipments(data.map(mapShipment));
    } catch (e) {
      setShipmentsError(e instanceof Error ? e.message : "Не удалось загрузить отгрузки");
    } finally {
      setShipmentsLoading(false);
    }
  };

  const loadPendingShipments = async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const data: ShipmentPendingProject[] = await fetchPendingShipments();
      setPendingShipments(
        data.map((p) => ({
          projectId: p.project_id,
          projectName: p.project_name,
          items: p.items.map((it) => {
            const availableWarehouses = (it.available_warehouses || []).map((w) => ({
              warehouseId: w.warehouse_id,
              warehouseName: w.warehouse_name,
            }));
            return {
              id: it.id,
              productName: it.product_name,
              quantity: it.quantity,
              unit: it.unit,
              checked: false,
              warehouseId: availableWarehouses[0]?.warehouseId ?? null,
              availableWarehouses,
              photo: null,
              kitGroupKey: it.kit_group_key ?? null,
              kitName: it.kit_name ?? null,
              kitQuantity: it.kit_quantity ?? null,
              quantityPerKit: it.quantity_per_kit ?? null,
              supplySource: it.supply_source ?? "stock",
            };
          }),
        }))
      );
    } catch (e) {
      setPendingError(e instanceof Error ? e.message : "Не удалось загрузить проекты для отгрузки");
    } finally {
      setPendingLoading(false);
    }
  };

  const toggleShipmentItemChecked = (projectId: number, itemId: number) => {
    setPendingShipments((prev) =>
      prev.map((p) =>
        p.projectId !== projectId
          ? p
          : {
              ...p,
              items: p.items.map((it) => (it.id === itemId ? { ...it, checked: !it.checked } : it)),
            }
      )
    );
  };

  const setShipmentItemWarehouse = (projectId: number, itemId: number, warehouseId: number) => {
    setPendingShipments((prev) =>
      prev.map((p) =>
        p.projectId !== projectId
          ? p
          : {
              ...p,
              items: p.items.map((it) => (it.id === itemId ? { ...it, warehouseId } : it)),
            }
      )
    );
  };

  const setShipmentItemPhoto = (projectId: number, itemId: number, file: File | null) => {
    setPendingShipments((prev) =>
      prev.map((p) =>
        p.projectId !== projectId
          ? p
          : {
              ...p,
              items: p.items.map((it) =>
                it.id === itemId ? { ...it, photo: file, photoUploadProgress: null } : it
              ),
              error: null,
            }
      )
    );
  };

  const setShipmentItemPhotoProgress = (projectId: number, itemId: number, percent: number) => {
    setPendingShipments((prev) =>
      prev.map((p) =>
        p.projectId !== projectId
          ? p
          : {
              ...p,
              items: p.items.map((it) =>
                it.id === itemId ? { ...it, photoUploadProgress: percent } : it
              ),
            }
      )
    );
  };

  const handleSendToShipment = async (projectId: number) => {
    const proj = pendingShipments.find((p) => p.projectId === projectId);
    if (!proj) return;

    const checkedItems = proj.items.filter((it) => it.checked);

    if (checkedItems.length === 0) return;

    if (!checkedItems.every((it) => it.warehouseId)) {
      setPendingShipments((prev) =>
        prev.map((p) =>
          p.projectId === projectId
            ? { ...p, error: "Выберите склад для каждой отмеченной позиции" }
            : p
        )
      );
      return;
    }

    setPendingShipments((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, submitting: true, error: null } : p))
    );

    try {
      await shipProjectItemsPerWarehouse(
        projectId,
        checkedItems.map((it) => ({ item_id: it.id, warehouse_id: it.warehouseId as number }))
      );

      // Фото — отдельно на каждую отгружаемую позицию, но необязательно:
      // грузим только те позиции, для которых кладовщик реально прикрепил файл.
      // Presigned-флоу — это два независимых сетевых запроса (PUT в R2, потом
      // подтверждение на бэкенде), и ошибка на любом из них не должна
      // блокировать саму отгрузку (она уже прошла шагом выше) — только
      // всплыть пользователю через alert, т.к. позиция тут же исчезает из
      // списка и локальное состояние ошибки на строке никто не увидит.
      const photoFailures: string[] = [];

      await Promise.all(
        checkedItems
          .filter((it) => it.photo)
          .map(async (it) => {
            const file = it.photo as File;
            let objectKey: string;
            try {
              const presign = await presignShipmentPhotoUpload(
                projectId,
                file.type || "application/octet-stream",
                file.name,
                it.id
              );
              await uploadFileToR2(presign.upload_url, file, (percent) =>
                setShipmentItemPhotoProgress(projectId, it.id, percent)
              );
              objectKey = presign.object_key;
            } catch (photoErr) {
              console.error(`Не удалось загрузить фото для позиции ${it.id}`, photoErr);
              photoFailures.push(`«${it.productName}»: не удалось загрузить фото`);
              return;
            }

            try {
              await uploadShipmentPhoto(projectId, objectKey, it.id);
            } catch (confirmErr) {
              console.error(`Фото для позиции ${it.id} загружено, но не сохранено`, confirmErr);
              photoFailures.push(`«${it.productName}»: фото загружено, но не удалось сохранить`);
            }
          })
      );

      if (photoFailures.length > 0) {
        alert(`Отгрузка оформлена, но есть проблемы с фото:\n${photoFailures.join("\n")}`);
      }

      const remainingCount = proj.items.length - checkedItems.length;

      setPendingShipments((prev) =>
        prev
          .map((p) =>
            p.projectId !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.filter((it) => !it.checked),
                  submitting: false,
                  error: null,
                }
          )
          .filter((p) => p.projectId !== projectId || p.items.length > 0)
      );

      if (remainingCount === 0) {
        try {
          await sendProjectToDocuments(projectId);
        } catch (statusErr) {
          console.error("Не удалось перевести проект в статус 'Ожидание документов'", statusErr);
        }
      }

      loadShipments();
      loadStock();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setPendingShipments((prev) =>
        prev.map((p) =>
          p.projectId === projectId
            ? {
                ...p,
                submitting: false,
                error: typeof detail === "string" ? detail : "Не удалось отправить на отгрузку",
              }
            : p
        )
      );
    }
  };

  // Отгрузка позиций мимо нашего склада (прямая от поставщика).
  // Не требует warehouseId и не трогает фото/резервы — отдельный путь от
  // handleSendToShipment. Локально убираем отгруженные позиции сразу, а
  // loadPendingShipments() остаётся источником истины.
  const handleShipDirect = async (projectId: number) => {
    const proj = pendingShipments.find((p) => p.projectId === projectId);
    if (!proj) return;

    const targets = proj.items.filter((it) => it.checked);
    if (targets.length === 0) return;

    const shippedIds = new Set(targets.map((it) => it.id));

    setPendingShipments((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, submitting: true, error: null } : p))
    );

    try {
      const itemIds = targets.map((it) => it.id);
      await shipFromSupplier(projectId, itemIds);

      setPendingShipments((prev) =>
        prev
          .map((p) =>
            p.projectId !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.filter((it) => !shippedIds.has(it.id)),
                  submitting: false,
                  error: null,
                }
          )
          .filter((p) => p.projectId !== projectId || p.items.length > 0)
      );

      await loadPendingShipments();
      loadShipments();
    } catch (e) {
      const message =
        e instanceof SupplySourceMismatchError
          ? formatSupplySourceMismatch(e)
          : e instanceof Error && e.message
            ? e.message
            : "Не удалось отметить отгрузку со склада поставщика";
      setPendingShipments((prev) =>
        prev.map((p) => (p.projectId === projectId ? { ...p, submitting: false, error: message } : p))
      );
    }
  };

  const handleConfirmSuccess = async (confirmedReceipt: ArrivalRow | null) => {
    let freshArrivals: ArrivalRow[] = arrivals;
    try {
      const data = await fetchWarehouseReceipts();
      freshArrivals = data.map(mapReceipt);
      setArrivals(freshArrivals);
    } catch (e) {
      console.error("Не удалось обновить список приходов", e);
    }
    loadStock();

    const projectId = confirmedReceipt?.projectId;
    // Приходы без проекта (например, из "Заявки на приход" от ПМ) не должны
    // переводить проект на отгрузку — им просто некого переводить.
    if (!projectId) return;

    const projectReceipts = freshArrivals.filter((r) => r.projectId === projectId);
    const allDone = projectReceipts.length > 0 && projectReceipts.every((r) => r.status !== "pending");

    if (allDone) {
      try {
        await sendProjectToShipment(projectId);
        loadPendingShipments();
      } catch (e) {
        console.error("Не удалось перевести проект в статус 'На отгрузке'", e);
      }
    }
  };

  const handleDownloadChecklist = async (projectId: number, projectName: string) => {
    setDownloadingChecklistId(projectId);
    try {
      await downloadShipmentChecklist(projectId, { projectName });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Не удалось скачать список на отгрузку");
    } finally {
      setDownloadingChecklistId(null);
    }
  };

  // "Список KAR"/"Список AB" — тот же .docx-генератор, что и обычный
  // "Список" выше, с warehouseId для фильтрации позиций на backend (см.
  // ПРЕДПОЛОЖЕНИЕ у downloadShipmentChecklist в api.ts). warehouseName —
  // то же WarehouseInfo.name, что и подпись "Список {wh.code}" ниже,
  // никакого отдельного словаря кодов на фронте не заводим. Раздельный
  // downloadingWarehouseChecklistKey — чтобы не путать спиннер с обычным
  // "Список" (downloadingChecklistId), если их скачивают почти одновременно.
  const handleDownloadWarehouseChecklist = async (
    projectId: number,
    projectName: string,
    warehouseId: number,
    warehouseName: string,
  ) => {
    const key = `${projectId}:${warehouseId}`;
    setDownloadingWarehouseChecklistKey(key);
    try {
      await downloadShipmentChecklist(projectId, { warehouseId, projectName, warehouseName });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Не удалось скачать список на отгрузку по складу");
    } finally {
      setDownloadingWarehouseChecklistKey((current) => (current === key ? null : current));
    }
  };

  // По умолчанию печатает всё (глобальная кнопка над списком), но принимает и
  // подмножество — шапка склада передаёт свои позиции и свой заголовок.
  const handlePrintArrivals = (rowsToPrint: ArrivalRow[] = arrivals, title = "Список приходов") => {
    const rows = rowsToPrint
      .map(
        (a) => `
          <tr>
            <td>${escapeHtml(a.project)}</td>
            <td>${escapeHtml(a.receiptNumber)}</td>
            <td>${escapeHtml(a.date)}</td>
            <td>${escapeHtml(a.warehouseName)}</td>
            <td>${escapeHtml(a.supplier)}</td>
            <td>${escapeHtml(a.sku)}</td>
            <td>${escapeHtml(a.item)}</td>
            <td style="text-align:center">${a.qty}</td>
            <td>${escapeHtml(a.unit)}</td>
            <td style="text-align:center">${
              a.status === "cancelled"
                ? "Отклонено"
                : a.status === "denied"
                  ? arrivalDirectShipLabel(a) ?? "Отклонено ПМ"
                  : a.status === "arrived"
                    ? "Принято"
                    : "В пути"
            }</td>
          </tr>`
      )
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            p.meta { font-size: 12px; color: #555; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f2f2f2; text-transform: uppercase; font-size: 10px; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p class="meta">Сформировано: ${new Date().toLocaleString("ru-RU")}</p>
          <table>
            <thead>
              <tr>
                <th>Проект</th>
                <th>№ Прихода</th>
                <th>Дата</th>
                <th>Склад</th>
                <th>Поставщик</th>
                <th>Артикул</th>
                <th>Товар</th>
                <th>Кол-во</th>
                <th>Ед.</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;

    const printWindow = window.open("", "_blank", "width=1000,height=700");
    if (!printWindow) {
      alert("Не удалось открыть окно печати. Проверьте, что всплывающие окна разрешены.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const handleToggleCancel = async (receipt: ArrivalRow) => {
    setCancellingReceiptId(receipt.id);
    try {
      const updated = await setReceiptCancelled(receipt.id, receipt.status !== "cancelled");
      setArrivals((prev) => prev.map((r) => (r.id === updated.id ? mapReceipt(updated) : r)));
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Не удалось изменить статус прихода");
    } finally {
      setCancellingReceiptId(null);
    }
  };

  // PM удаляет свою заявку на приход (отправил по ошибке), пока кладовщик её не принял.
  // Подтверждение — своё окно ConfirmDialog, а не системный window.confirm.
  const openDeleteReceipt = (receipt: ArrivalRow) => {
    setDeleteError(null);
    setDeleteTarget(receipt);
  };

  const closeDeleteReceipt = () => {
    if (deletingReceiptId !== null) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmDeleteReceipt = async () => {
    if (!deleteTarget) return;
    const receipt = deleteTarget;

    setDeletingReceiptId(receipt.id);
    setDeleteError(null);
    try {
      await deleteIncomeRequest(receipt.id);
      setArrivals((prev) => prev.filter((r) => r.id !== receipt.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Не удалось удалить заявку на приход");
      // возможно, кладовщик уже принял/отклонил её — подтягиваем актуальный список
      loadArrivals();
    } finally {
      setDeletingReceiptId(null);
    }
  };

  // ПМ отклоняет позицию прихода — в отличие от handleToggleCancel (склад)
  // это отдельное действие, доступное самому ПМ прямо из карточки прихода.
  const openDenyReceipt = (receipt: ArrivalRow) => {
    setDenyError(null);
    setDenyTarget(receipt);
  };

  const closeDenyReceipt = () => {
    if (denyingReceiptId !== null) return;
    setDenyTarget(null);
    setDenyError(null);
  };

  const confirmDenyReceipt = async () => {
    if (!denyTarget) return;
    const receipt = denyTarget;

    setDenyingReceiptId(receipt.id);
    setDenyError(null);
    try {
      const updated = await denyIncomeReceipt(receipt.id);
      setArrivals((prev) => prev.map((r) => (r.id === updated.id ? mapReceipt(updated) : r)));
      setDenyTarget(null);

      // Позиция была привязана к проекту — сразу предлагаем пересоздать её
      // через «Заявку на приход», предзаполненную тем же товаром/кол-вом/
      // складом. Без projectId (ручной приход кладовщика без проекта)
      // предлагать пересоздание через project-linked заявку не имеет смысла.
      if (receipt.projectId != null && receipt.warehouseId != null) {
        setReorderRequest({
          sourceReceiptId: receipt.id,
          prefill: {
            projectId: receipt.projectId,
            projectName: receipt.project,
            productId: receipt.productId,
            productName: receipt.item,
            quantity: receipt.qty,
            unit: receipt.unit,
            warehouseId: receipt.warehouseId,
          },
        });
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setDenyError(typeof detail === "string" ? detail : e instanceof Error ? e.message : "Не удалось отклонить приход");
    } finally {
      setDenyingReceiptId(null);
    }
  };

  const openSupplierDirect = (receipt: ArrivalRow) => {
    setSupplierDirectError(null);
    setSupplierDirectTarget(receipt);
  };

  const closeSupplierDirect = () => {
    if (markingSupplierDirectId !== null) return;
    setSupplierDirectTarget(null);
    setSupplierDirectError(null);
  };

  // ПМ/Комдир: приход не нужен, товар отгружает сам поставщик со своего
  // склада. Backend переводит позицию в supplier_direct и закрывает приход
  // (denied) — обновляем строку из ответа, полный перезапрос списка не нужен.
  const confirmMarkSupplierDirect = async () => {
    if (!supplierDirectTarget) return;
    const receipt = supplierDirectTarget;

    setMarkingSupplierDirectId(receipt.id);
    setSupplierDirectError(null);
    try {
      const updated = await markReceiptSupplierDirect(receipt.id);
      // Источник — из ответа мутации; захардкоженный "supplier_direct" —
      // только деградация, если backend не вернул supply_source (null/нет поля).
      setArrivals((prev) =>
        prev.map((r) =>
          r.id !== receipt.id
            ? r
            : updated && typeof updated.id === "number"
              ? { ...mapReceipt(updated), supplySource: updated.supply_source ?? "supplier_direct" }
              : { ...r, status: "denied", supplySource: "supplier_direct" }
        )
      );
      setSupplierDirectTarget(null);
    } catch (e) {
      setSupplierDirectError(e instanceof Error ? e.message : "Не удалось пометить приход");
      // возможно, кладовщик уже принял приход — подтягиваем актуальный список
      loadArrivals();
    } finally {
      setMarkingSupplierDirectId(null);
    }
  };

  // Кнопка "От поставщика" — только для проектных приходов, которые ещё
  // ждут кладовщика; у заявок ПМ без проекта флаг бессмыслен.
  const renderSupplierDirectLink = (a: ArrivalRow) =>
    canShipDirect && a.projectId != null ? (
      <button
        onClick={() => openSupplierDirect(a)}
        disabled={markingSupplierDirectId === a.id}
        title="Со склада поставщика: товар отгружает сам поставщик, приход не нужен"
        className={`${ARRIVAL_ACTION_BTN} border-blue-200 dark:border-blue-400/30 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-400/15`}
      >
        <Truck size={12} />
        От поставщика
      </button>
    ) : null;

  // Поиск на вкладке "Приход" — по всем полям строки: товар, артикул,
  // проект, поставщик, склад, номер прихода.
  const filteredArrivals = useMemo(() => {
    const q = arrivalSearch.trim().toLowerCase();
    if (!q) return arrivals;
    return arrivals.filter(
      (a) =>
        a.item.toLowerCase().includes(q) ||
        a.sku.toLowerCase().includes(q) ||
        a.project.toLowerCase().includes(q) ||
        a.supplier.toLowerCase().includes(q) ||
        a.warehouseName.toLowerCase().includes(q) ||
        a.receiptNumber.toLowerCase().includes(q)
    );
  }, [arrivals, arrivalSearch]);

  // Приходы делятся на два дерева одинаковой структуры (склад → проект →
  // дата): "в работе" и "история". Дата-группа уезжает в историю, когда в ней
  // не осталось позиций, ждущих кладовщика, поэтому частично принятый проект
  // попадает в оба дерева — с разными датами в каждом.
  const { active: activeArrivals, history: historyArrivals } = useMemo(
    () => splitArrivalsByCompletion(filteredArrivals),
    [filteredArrivals]
  );

  const arrivalWarehouseGroups = useMemo<ArrivalWarehouseGroup[]>(
    () => buildArrivalWarehouseGroups(activeArrivals),
    [activeArrivals]
  );

  const arrivalWarehouseHistoryGroups = useMemo<ArrivalWarehouseGroup[]>(
    () => buildArrivalWarehouseGroups(historyArrivals),
    [historyArrivals]
  );

  // При активном поиске все найденные склады и проекты раскрыты принудительно,
  // чтобы совпадения были видны без клика: в value аккордеонов уходит
  // объединение ручного состояния со всеми ключами результата. Само ручное
  // состояние не трогаем — как только строка поиска очищается, value
  // откатывается на него, и вид возвращается к тому, что было до поиска.
  // Поэтому же onValueChange на время поиска заморожен: Radix отдал бы в него
  // отфильтрованное ОБЪЕДИНЕНИЕ, и клик по стрелке затёр бы запомненный выбор
  // пользователя на «всё найденное, кроме кликнутого».
  const isSearchingArrivals = arrivalSearch.trim().length > 0;

  const warehouseAccordionValue = useMemo(
    () => forcedExpansion(expandedArrivalWarehouses, warehouseKeysOf(arrivalWarehouseGroups), isSearchingArrivals),
    [isSearchingArrivals, expandedArrivalWarehouses, arrivalWarehouseGroups]
  );

  const projectAccordionValue = useMemo(
    () => forcedExpansion(expandedArrivalGroups, projectKeysOf(arrivalWarehouseGroups), isSearchingArrivals),
    [isSearchingArrivals, expandedArrivalGroups, arrivalWarehouseGroups]
  );

  const historyWarehouseAccordionValue = useMemo(
    () =>
      forcedExpansion(
        expandedArrivalHistoryWarehouses,
        warehouseKeysOf(arrivalWarehouseHistoryGroups),
        isSearchingArrivals
      ),
    [isSearchingArrivals, expandedArrivalHistoryWarehouses, arrivalWarehouseHistoryGroups]
  );

  const historyProjectAccordionValue = useMemo(
    () =>
      forcedExpansion(
        expandedArrivalHistoryGroups,
        projectKeysOf(arrivalWarehouseHistoryGroups),
        isSearchingArrivals
      ),
    [isSearchingArrivals, expandedArrivalHistoryGroups, arrivalWarehouseHistoryGroups]
  );

  // Склады активного списка раскрыты по умолчанию — проставляем один раз, когда
  // приходы впервые приехали с бэка. Ref-флаг обязателен: без него ручное
  // сворачивание всех складов выглядело бы как "ещё не инициализировано" и
  // тут же отменялось повторным автораскрытием. Пока идёт поиск, инициализацию
  // не делаем — иначе в ручное состояние попали бы только найденные склады.
  const didExpandArrivalWarehouses = useRef(false);
  useEffect(() => {
    if (didExpandArrivalWarehouses.current || isSearchingArrivals) return;
    if (arrivalWarehouseGroups.length === 0) return;
    didExpandArrivalWarehouses.current = true;
    setExpandedArrivalWarehouses(warehouseKeysOf(arrivalWarehouseGroups));
  }, [arrivalWarehouseGroups, isSearchingArrivals]);

  // Поиск на вкладке "Отгрузка" — по названию товара и по проекту, общий для
  // обоих разделов (проекты к отгрузке и история). Если совпал сам проект —
  // показываем все его позиции; иначе фильтруем позиции по товару и
  // оставляем только проекты/накладные, где такие позиции остались.
  const filteredPendingShipments = useMemo(() => {
    const q = shipmentSearch.trim().toLowerCase();
    if (!q) return pendingShipments;
    return pendingShipments
      .map((p) =>
        p.projectName.toLowerCase().includes(q)
          ? p
          : { ...p, items: p.items.filter((it) => it.productName.toLowerCase().includes(q)) }
      )
      .filter((p) => p.items.length > 0);
  }, [pendingShipments, shipmentSearch]);

  const filteredShipmentsForHistory = useMemo(() => {
    const q = shipmentSearch.trim().toLowerCase();
    if (!q) return shipments;
    return shipments
      .map((s) =>
        s.projectName.toLowerCase().includes(q)
          ? s
          : { ...s, items: s.items.filter((it) => it.productName.toLowerCase().includes(q)) }
      )
      .filter((s) => s.items.length > 0);
  }, [shipments, shipmentSearch]);

  // История отгрузок, сгруппированная по проекту — та же схема, что у
  // buildArrivalProjectGroups, но порядок групп по свежести последней отгрузки
  // (а не по числу ожидающих позиций): история читается сверху вниз как лента.
  const shipmentHistoryGroups = useMemo<ShipmentHistoryGroup[]>(() => {
    const map = new Map<string, ShipmentHistoryGroup>();

    filteredShipmentsForHistory.forEach((s) => {
      const key = String(s.projectId);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          projectName: s.projectName,
          shipments: [],
          itemsCount: 0,
          photosCount: 0,
          lastShipmentLabel: "—",
          lastShipmentTs: null,
        };
        map.set(key, group);
      }
      group.shipments.push(s);
      group.itemsCount += s.items.length;
      group.photosCount += s.items.filter((it) => it.photoUrl).length;

      const ts = s.shippedAt ? new Date(s.shippedAt).getTime() : NaN;
      if (Number.isFinite(ts) && (group.lastShipmentTs == null || ts > group.lastShipmentTs)) {
        group.lastShipmentTs = ts;
        group.lastShipmentLabel = new Date(ts).toLocaleDateString("ru-RU");
      }
    });

    const groups = Array.from(map.values());

    groups.forEach((group) => {
      group.shipments.sort((a, b) => {
        const aTs = a.shippedAt ? new Date(a.shippedAt).getTime() : 0;
        const bTs = b.shippedAt ? new Date(b.shippedAt).getTime() : 0;
        return bTs - aTs;
      });
    });

    groups.sort((a, b) => (b.lastShipmentTs ?? 0) - (a.lastShipmentTs ?? 0));

    return groups;
  }, [filteredShipmentsForHistory]);

  // То же, что warehouseAccordionValue/projectAccordionValue для "Прихода", но
  // для двух разделов "Отгрузки": при активном поиске найденные группы
  // раскрыты принудительно (в value уходит объединение ручного состояния со
  // всеми ключами результата), а ручное состояние не трогается — после очистки
  // поиска value откатывается на него.
  // onValueChange на время поиска заморожен по той же причине: Radix отдал бы
  // в него отфильтрованное ОБЪЕДИНЕНИЕ, и клик по стрелке затёр бы
  // запомненный выбор пользователя на «всё найденное, кроме кликнутого».
  const isSearchingShipments = shipmentSearch.trim().length > 0;

  const pendingShipmentAccordionValue = useMemo(() => {
    if (!isSearchingShipments) return expandedPendingShipmentGroups;
    const allPendingKeys = filteredPendingShipments.map((p) => String(p.projectId));
    return Array.from(new Set([...expandedPendingShipmentGroups, ...allPendingKeys]));
  }, [isSearchingShipments, expandedPendingShipmentGroups, filteredPendingShipments]);

  const shipmentHistoryAccordionValue = useMemo(() => {
    if (!isSearchingShipments) return expandedShipmentGroups;
    const allHistoryKeys = shipmentHistoryGroups.map((g) => g.key);
    return Array.from(new Set([...expandedShipmentGroups, ...allHistoryKeys]));
  }, [isSearchingShipments, expandedShipmentGroups, shipmentHistoryGroups]);

  const filteredStock = useMemo(() => {
    return stock
      .filter((item) => {
        if (selectedWarehouseId === "all") return true;
        return (item.perWarehouse[selectedWarehouseId] || 0) > 0;
      })
      .filter((item) =>
        stockFilter === "all" ? true :
        stockFilter === "low" ? item.available < 50 :
        stockFilter === "brak" ? item.defective > 0 :
        item.reserved > 0
      )
      .filter((item) =>
        stockSearch.trim() === ""
          ? true
          : item.name.toLowerCase().includes(stockSearch.trim().toLowerCase()) ||
            item.sku.toLowerCase().includes(stockSearch.trim().toLowerCase())
      )
      .slice()
      .sort((a, b) => {
        if (!stockSortField) return 0;
        const diff = a[stockSortField] - b[stockSortField];
        return stockSortDir === "asc" ? diff : -diff;
      });
  }, [stock, selectedWarehouseId, stockFilter, stockSearch, stockSortField, stockSortDir]);

  // Дерево приходов склад → проект → дата. Одна и та же разметка рисует и
  // активный список, и историю — отличаются только набором групп и
  // состояниями раскрытия, поэтому это функция, а не отдельный компонент:
  // обработчики строк (приём, отклонение, удаление) берутся из замыкания,
  // без прокидывания десятка пропов.
  const renderArrivalTree = ({
    groups,
    warehouseValue,
    onWarehouseValueChange,
    projectValue,
    onProjectValueChange,
    onPrintWarehouse,
  }: {
    groups: ArrivalWarehouseGroup[];
    warehouseValue: string[];
    onWarehouseValueChange: (value: string[]) => void;
    projectValue: string[];
    onProjectValueChange: (value: string[]) => void;
    // Не задан — кнопки печати в шапках складов нет (так рисуется история:
    // печатаем только то, что в работе).
    onPrintWarehouse?: (group: ArrivalWarehouseGroup) => void;
  }) => (
    <Accordion
      type="multiple"
      value={warehouseValue}
      onValueChange={onWarehouseValueChange}
      className="flex flex-col"
    >
      {groups.map((warehouseGroup) => (
        <AccordionItem key={warehouseGroup.key} value={warehouseGroup.key} className="border-border">
          {/* Кнопка печати — рядом с триггером, а не внутри: триггер сам является
              <button>. Фон держит эта строка, ховер остаётся на кликабельной части. */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40">
            <div className="min-w-0 flex-1">
              <AccordionTrigger className="items-center gap-3 rounded-none px-4 py-3.5 transition-colors hover:bg-muted/60 hover:no-underline [&>svg]:order-first [&>svg]:translate-y-0">
                <span className="flex flex-1 flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5">
                    <Warehouse size={16} className="shrink-0 text-blue-600 dark:text-blue-400" />
                    <span className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">{warehouseGroup.warehouseName}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {warehouseGroup.items.length} позиций
                      </span>
                    </span>
                  </span>
                  <ArrivalStatusBadges counts={warehouseGroup} />
                </span>
              </AccordionTrigger>
            </div>

            {onPrintWarehouse && (
              <button
                onClick={() => onPrintWarehouse(warehouseGroup)}
                disabled={warehouseGroup.items.length === 0}
                title="Распечатать приходы этого склада"
                className="mr-4 flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText size={13} />
                Распечатать
              </button>
            )}
          </div>

          <AccordionContent className="p-0">
            <Accordion
              type="multiple"
              value={projectValue}
              onValueChange={onProjectValueChange}
              className="flex flex-col border-t border-border pl-4"
            >
              {warehouseGroup.projectGroups.map((group) => {
                const groupKey = `${warehouseGroup.key}::${group.key}`;

                return (
                  <AccordionItem key={groupKey} value={groupKey} className="border-border">
                    <AccordionTrigger className="items-center gap-3 rounded-none bg-background/60 px-4 py-3.5 transition-colors hover:bg-muted/50 hover:no-underline [&>svg]:order-first [&>svg]:translate-y-0">
                      <span className="flex flex-1 flex-wrap items-center justify-between gap-3">
                        <span className="flex flex-col">
                          <span className="text-sm font-bold text-foreground">{group.projectName}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {group.items.length} позиций
                          </span>
                        </span>

                        <span className="flex items-center gap-2 flex-wrap">
                          <ArrivalStatusBadges counts={group} />
                          <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                            {group.lastMovementLabel}
                          </span>
                        </span>
                      </span>
                    </AccordionTrigger>

                    <AccordionContent className="p-0">
                      {group.dateGroups.map((dateGroup) => (
                        <div key={dateGroup.key} className="flex flex-col border-t border-border/60">
                          {/* Уровень 3 — не аккордеон: статичный разделитель над таблицей */}
                          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-1.5">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <Clock size={11} className="shrink-0" />
                              {dateGroup.dateLabel}
                            </span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {dateGroup.items.length} позиций
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b border-border bg-background/60">
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">№ Прихода</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Когда придет товар</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Склад</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Поставщик</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">Артикул</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Название товара</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Количество</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Ед. изм.</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Статус приема</th>
                                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Действия</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {dateGroup.items.map((a) => {
                                  const isCancelled = a.status === "cancelled";
                                  const isDenied = a.status === "denied";
                                  const isArrived = a.status === "arrived";

                                  return (
                                    <tr key={a.id} className={`hover:bg-background/50 transition-colors ${isCancelled || isDenied ? "opacity-50 bg-background" : ""}`}>
                                      <td className="px-4 py-3.5 text-xs font-mono font-medium text-foreground">
                                        {a.receiptNumber}
                                      </td>

                                      <td className="px-4 py-3.5 text-sm text-muted-foreground">
                                        {a.date}
                                      </td>

                                      <td className="px-4 py-3.5 text-sm font-medium text-foreground">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-foreground text-xs font-semibold">
                                          <Building2 size={12} className="text-blue-600 dark:text-blue-400" />
                                          {a.warehouseName}
                                        </span>
                                      </td>

                                      <td className="px-4 py-3.5 text-sm font-medium text-foreground">
                                        {a.supplier}
                                      </td>

                                      <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                                        {a.sku}
                                      </td>

                                      <td className="px-4 py-3.5 text-sm text-foreground font-medium">
                                        <div className="flex flex-col gap-1">
                                          <span>{a.item}</span>
                                          {a.kit_group_key ? (
                                            <span
                                              className="inline-flex w-fit max-w-[220px] items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                                              title={`из комплекта «${(a.kit_name || "").trim() || "Комплект"}»${a.quantity_per_kit != null ? ` ×${a.quantity_per_kit}` : ""}`}
                                            >
                                              <Package size={10} className="shrink-0" />
                                              <span className="truncate">
                                                из комплекта «{(a.kit_name || "").trim() || "Комплект"}»
                                                {a.quantity_per_kit != null ? ` ×${a.quantity_per_kit}` : ""}
                                              </span>
                                            </span>
                                          ) : null}
                                          {a.kit_group_key && a.kit_quantity != null ? (
                                            <span className="text-[11px] text-muted-foreground">
                                              комплектов в проекте: {a.kit_quantity}
                                            </span>
                                          ) : null}
                                        </div>
                                      </td>

                                      <td className="px-4 py-3.5 text-sm font-mono font-bold text-foreground text-center">
                                        {a.qty.toLocaleString("ru-RU")}
                                        {a.actualQuantity !== null && a.actualQuantity !== a.qty && (
                                          <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">факт: {a.actualQuantity}</span>
                                        )}
                                      </td>

                                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                                        {a.unit}
                                      </td>

                                      <td className="px-4 py-3.5 text-center">
                                        {isCancelled ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-400/20 text-red-700 dark:text-red-300 whitespace-nowrap" title="Отменено">
                                            <XCircle size={14} /> Отклонено
                                          </span>
                                        ) : isDenied && arrivalDirectShipLabel(a) ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-400/20 text-sky-700 dark:text-sky-300 whitespace-nowrap" title="Приход не нужен: товар придёт мимо нашего склада">
                                            <Truck size={14} /> {arrivalDirectShipLabel(a)}
                                          </span>
                                        ) : isDenied ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-400/20 text-rose-700 dark:text-rose-300 whitespace-nowrap" title="Отклонено ПМ">
                                            <XCircle size={14} /> Отклонено ПМ
                                          </span>
                                        ) : isArrived ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-400/20 text-green-700 dark:text-green-300 whitespace-nowrap" title="Принято кладовщиком">
                                            <CheckCircle2 size={14} /> Принято
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-200 whitespace-nowrap" title="Ожидается доставка">
                                            <Clock size={14} /> В пути
                                          </span>
                                        )}
                                      </td>

                                      <td className="px-4 py-3.5 text-center">
                                        {isCancelled ? (
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="text-xs text-muted-foreground italic">Приход отменен</span>
                                            {isWarehouseUser && (
                                              <button
                                                onClick={() => handleToggleCancel(a)}
                                                disabled={cancellingReceiptId === a.id}
                                                title="Вернуть в работу"
                                                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                              >
                                                {cancellingReceiptId === a.id ? "…" : "Вернуть"}
                                              </button>
                                            )}
                                          </div>
                                        ) : isDenied ? (
                                          <span className="text-xs text-muted-foreground italic">
                                            {arrivalDirectShipLabel(a) ? "Приход не требуется" : "Заявка отклонена ПМ"}
                                          </span>
                                        ) : isArrived ? (
                                          <button
                                            onClick={() => setDetailsTarget(a)}
                                            className="flex flex-col items-center group cursor-pointer"
                                            title="Посмотреть детали приёма"
                                          >
                                            <span className="text-xs font-semibold text-green-700 dark:text-green-300 flex items-center gap-1 group-hover:underline">
                                              <PackageCheck size={14} /> Зачислено
                                            </span>
                                            {a.warehouseComment && (
                                              <span className="text-[11px] text-muted-foreground italic max-w-[150px] truncate" title={a.warehouseComment}>
                                                "{a.warehouseComment}"
                                              </span>
                                            )}
                                          </button>
                                        ) : isWarehouseUser ? (
                                          <div className="flex items-center justify-center gap-2">
                                            <button
                                              onClick={() => setConfirmTarget(a)}
                                              title="Принять приход"
                                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-400/20 text-green-700 dark:text-green-300 hover:bg-green-200 transition-colors"
                                            >
                                              <CheckCircle2 size={16} />
                                            </button>
                                            <button
                                              onClick={() => handleToggleCancel(a)}
                                              disabled={cancellingReceiptId === a.id}
                                              title="Отклонить приход"
                                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 dark:bg-red-400/20 text-red-700 dark:text-red-300 hover:bg-red-200 transition-colors disabled:opacity-50"
                                            >
                                              {cancellingReceiptId === a.id ? (
                                                <Loader2 size={16} className="animate-spin" />
                                              ) : (
                                                <XCircle size={16} />
                                              )}
                                            </button>
                                          </div>
                                        ) : isPm ? (
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="text-xs text-muted-foreground italic">Ожидает кладовщика</span>
                                            {/* Действие зависит от источника записи: свою заявку ПМ
                                                удаляет (её ещё никто не согласовывал), а проектный
                                                приход из Закупок только отклоняет — удалить его нельзя,
                                                за ним стоит строка проекта. */}
                                            <div className="flex flex-wrap items-center justify-center gap-2">
                                              {a.source === "pm_request" ? (
                                                <button
                                                  onClick={() => openDeleteReceipt(a)}
                                                  title="Удалить заявку, если отправили по ошибке"
                                                  className={`${ARRIVAL_ACTION_BTN} border-red-200 dark:border-red-400/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-400/15`}
                                                >
                                                  <Trash2 size={12} />
                                                  Удалить
                                                </button>
                                              ) : (
                                                <button
                                                  onClick={() => openDenyReceipt(a)}
                                                  title="Отклонить эту позицию прихода"
                                                  className={`${ARRIVAL_ACTION_BTN} border-red-200 dark:border-red-400/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-400/15`}
                                                >
                                                  <XCircle size={12} />
                                                  Отклонить
                                                </button>
                                              )}
                                              {renderSupplierDirectLink(a)}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="text-xs text-muted-foreground italic">Ожидает кладовщика</span>
                                            {renderSupplierDirectLink(a)}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  return (
    <PageWrap
      title="Склад"
      subtitle={`Управление остатками, резервом и отгрузками по ${warehouses.length} складам`}
      actions={
        isPm && (
          <button
            onClick={() => setShowIncomeRequestModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]"
          >
            <PackagePlus size={14} /> Заявка на приход
          </button>
        )
      }
    >
      {showAddStockModal && (
        <AddStockModal warehouses={warehouses} onClose={() => setShowAddStockModal(false)} onSuccess={() => { loadStock(); loadArrivals(); }} />
      )}

      {showIncomeRequestModal && (
        <IncomeRequestModal
          key="manual"
          warehouses={warehouses}
          stock={stock}
          onClose={() => setShowIncomeRequestModal(false)}
          onSuccess={() => {
            loadArrivals();
            setTab("arrivals");
          }}
        />
      )}

      {reorderRequest && (
        <IncomeRequestModal
          // Разные деньги подряд должны каждый раз давать чистый маунт —
          // ключ на id исходного прихода гарантирует это, даже если бы
          // условный рендер сам по себе этого не обеспечил (см. Step 4).
          key={`reorder-${reorderRequest.sourceReceiptId}`}
          warehouses={warehouses}
          stock={stock}
          prefill={reorderRequest.prefill}
          onClose={() => setReorderRequest(null)}
          onSuccess={() => {
            setReorderRequest(null);
            loadArrivals();
            setTab("arrivals");
          }}
        />
      )}

      {supplierDirectTarget && (
        <ConfirmDialog
          title="Отметить «от поставщика»?"
          description="Приход будет отклонён — товар поступит напрямую от поставщика, без прихода на наш склад. Отменить это действие нельзя."
          confirmLabel="Подтвердить"
          loading={markingSupplierDirectId === supplierDirectTarget.id}
          error={supplierDirectError}
          onConfirm={confirmMarkSupplierDirect}
          onCancel={closeSupplierDirect}
        >
          <p className="text-xs font-mono text-muted-foreground">{supplierDirectTarget.receiptNumber}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{supplierDirectTarget.item}</p>
          <p className="mt-2 text-xs font-mono font-semibold text-foreground">
            {supplierDirectTarget.qty.toLocaleString("ru-RU")} {supplierDirectTarget.unit}
          </p>
        </ConfirmDialog>
      )}

      {denyTarget && (
        <ConfirmDialog
          title="Отклонить эту позицию прихода?"
          description="Позиция будет помечена отклонённой. Если она привязана к проекту, сразу откроется заявка на приход для пересоздания."
          confirmLabel="Отклонить"
          loading={denyingReceiptId === denyTarget.id}
          error={denyError}
          onConfirm={confirmDenyReceipt}
          onCancel={closeDenyReceipt}
        >
          <p className="text-xs font-mono text-muted-foreground">{denyTarget.receiptNumber}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{denyTarget.item}</p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="font-mono font-semibold text-foreground">
              {denyTarget.qty.toLocaleString("ru-RU")} {denyTarget.unit}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
              <Building2 size={11} className="text-blue-600 dark:text-blue-400" />
              {denyTarget.warehouseName}
            </span>
          </div>
          {denyTarget.projectId != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Проект: <span className="font-medium text-foreground">{denyTarget.project}</span>
            </p>
          )}
        </ConfirmDialog>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Удалить заявку на приход?"
          description="Кладовщик получит уведомление. Это действие нельзя отменить."
          confirmLabel="Удалить"
          loading={deletingReceiptId === deleteTarget.id}
          error={deleteError}
          onConfirm={confirmDeleteReceipt}
          onCancel={closeDeleteReceipt}
        >
          <p className="text-xs font-mono text-muted-foreground">{deleteTarget.receiptNumber}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{deleteTarget.item}</p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="font-mono font-semibold text-foreground">
              {deleteTarget.qty.toLocaleString("ru-RU")} {deleteTarget.unit}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
              <Building2 size={11} className="text-blue-600 dark:text-blue-400" />
              {deleteTarget.warehouseName}
            </span>
          </div>
        </ConfirmDialog>
      )}

      {renameUnlockTarget && (
        <ConfirmDialog
          title={`Изменить название товара «${renameUnlockTarget.name}»?`}
          confirmLabel="Изменить"
          tone="primary"
          onConfirm={confirmRenameUnlock}
          onCancel={closeRenameUnlock}
        />
      )}

      {deleteProductTarget && (
        <ConfirmDialog
          title="Удалить товар?"
          description="Товар будет удалён из каталога. Это действие нельзя отменить."
          confirmLabel="Удалить"
          loading={deletingProductId === deleteProductTarget.productId}
          error={deleteProductError}
          onConfirm={confirmDeleteProduct}
          onCancel={closeDeleteProduct}
        >
          <p className="text-xs font-mono text-muted-foreground">{deleteProductTarget.sku}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{deleteProductTarget.name}</p>
        </ConfirmDialog>
      )}

      {confirmTarget && (
        <ConfirmReceiptModal receipt={confirmTarget} onClose={() => setConfirmTarget(null)} onSuccess={() => handleConfirmSuccess(confirmTarget)} />
      )}

     {detailsTarget && (
  <ReceiptDetailsModal
    receipt={detailsTarget}
    canEdit={isWarehouseUser}
    onClose={() => setDetailsTarget(null)}
    onSuccess={(updated) => {
      setArrivals((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setDetailsTarget(updated);
      loadStock(); // остатки/брак на складе изменились — перезагружаем таблицу
    }}
  />
)}

      {shipmentDetailsTarget && (
        <ShipmentDetailsModal
          shipment={shipmentDetailsTarget}
          onClose={() => setShipmentDetailsTarget(null)}
        />
      )}

      {showShipmentModal && (
        <ShipmentModal onClose={() => setShowShipmentModal(false)} onSuccess={loadShipments} />
      )}

      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {[{ key: "stock" as const, label: "Остатки" }, { key: "arrivals" as const, label: "Приход" }, { key: "shipments" as const, label: "Отгрузка" }].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Поиск по наименованию…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card"
              />
            </div>

            <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden bg-card p-0.5">
              <button
                onClick={() => setSelectedWarehouseId("all")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${selectedWarehouseId === "all" ? "bg-slate-800 text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Building2 size={12} /> Все склады
              </button>
              {warehouses.map((wh) => (
                <button
                  key={wh.id}
                  onClick={() => setSelectedWarehouseId(wh.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${selectedWarehouseId === wh.id ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {wh.code || wh.name}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                onClick={() => setIsStockSortMenuOpen((v) => !v)}
                className={`text-xs flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg border transition-all duration-150 active:scale-95 ${
                  stockSortField
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                <ArrowUpDown
                  size={12}
                  className={`transition-transform duration-200 ${isStockSortMenuOpen ? "rotate-180" : ""}`}
                />
                {stockSortField
                  ? `${STOCK_SORT_OPTIONS.find((o) => o.field === stockSortField)?.label} ${stockSortDir === "asc" ? "↑" : "↓"}`
                  : "Сортировать"}
              </button>

              {isStockSortMenuOpen && (
                <>
                  {/* Клик вне меню закрывает его */}
                  <div className="fixed inset-0 z-10" onClick={() => setIsStockSortMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 origin-top-right">
                    <button
                      onClick={() => {
                        setStockSortField(null);
                        setIsStockSortMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-muted transition-colors text-muted-foreground"
                    >
                      Без сортировки
                      {!stockSortField && <Check size={12} className="text-primary animate-in fade-in zoom-in duration-150" />}
                    </button>
                    <div className="h-px bg-muted my-1" />
                    {STOCK_SORT_OPTIONS.map((opt, i) => (
                      <button
                        key={opt.field}
                        onClick={() => {
                          if (stockSortField === opt.field) {
                            // Повторный клик по тому же типу количества — меняем направление
                            setStockSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          } else {
                            setStockSortField(opt.field);
                            setStockSortDir("desc");
                          }
                          setIsStockSortMenuOpen(false);
                        }}
                        style={{ animationDelay: `${i * 20}ms` }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-muted transition-colors text-foreground animate-in fade-in slide-in-from-top-1 duration-150 fill-mode-both"
                      >
                        <span>
                          {opt.label}
                          {stockSortField === opt.field && (
                            <span className="text-muted-foreground ml-1">{stockSortDir === "asc" ? "↑" : "↓"}</span>
                          )}
                        </span>
                        {stockSortField === opt.field && <Check size={12} className="text-primary animate-in fade-in zoom-in duration-150" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {stockLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Загрузка остатков…</p>
              </div>
            ) : filteredStock.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground"><Inbox size={22} className="text-muted-foreground/50" />Нет данных об остатках</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-background/60">
                      <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">Артикул</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Наименование</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">Ед. изм.</th>
                      {warehouses.map((wh) => (
                        <th key={wh.id} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">{wh.code || wh.name}</th>
                      ))}
                      <th className="px-4 py-2.5 text-xs font-semibold text-foreground uppercase tracking-wide text-right bg-muted/70 whitespace-nowrap">Всего</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">В резерве</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">Брак</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">Доступно</th>
                      {isCommercialDirector && (
                        <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center whitespace-nowrap"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStock.map((item) => {
                      const blocksDelete = item.reserved !== 0 || item.defective !== 0 || item.total !== 0;
                      return (
                      <tr key={item.id} className="hover:bg-background/50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{item.sku}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          {isCommercialDirector ? (() => {
                            const isUnlocked = unlockedRenameProductId === item.id;
                            return (
                              <textarea
                                  key={`${item.id}-name-${item.name}`}
                                  ref={(el) => {
                                    if (el) {
                                      nameTextareaRefs.current.set(item.id, el);
                                      autoResizeNameTextarea(el);
                                    } else {
                                      nameTextareaRefs.current.delete(item.id);
                                    }
                                  }}
                                  rows={1}
                                  defaultValue={item.name}
                                  readOnly={!isUnlocked}
                                  disabled={renamingProductId === item.productId}
                                  onMouseDown={(event) => {
                                    if (!isUnlocked) {
                                      event.preventDefault();
                                      openRenameUnlock(item);
                                    }
                                  }}
                                  onFocus={(event) => {
                                    if (!isUnlocked) {
                                      event.target.blur();
                                      openRenameUnlock(item);
                                    }
                                  }}
                                  onInput={(event) => autoResizeNameTextarea(event.currentTarget)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  onBlur={(event) => {
                                    if (isUnlocked) void handleProductNameBlur(item, event);
                                  }}
                                  className={`w-full resize-none overflow-hidden px-2 py-1 text-sm font-medium border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted ${
                                    isUnlocked ? "border-primary cursor-text" : "border-border cursor-pointer"
                                  }`}
                              />
                            );
                          })() : (
                            item.name
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.unit}</td>
                        {warehouses.map((wh) => (
                          <td key={wh.id} className="px-4 py-3 text-sm font-mono text-foreground text-right whitespace-nowrap">
                            {(item.perWarehouse[wh.id] || 0).toLocaleString("ru-RU")}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm font-mono text-foreground text-right font-bold bg-background whitespace-nowrap">
                          {item.total.toLocaleString("ru-RU")}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-violet-600 dark:text-violet-400 text-right whitespace-nowrap">
                          {item.reserved.toLocaleString("ru-RU")}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-right whitespace-nowrap">
                          {item.defective > 0 ? (
                            <span className="text-destructive font-semibold">{item.defective.toLocaleString("ru-RU")}</span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-green-600 dark:text-green-400 font-semibold whitespace-nowrap">
                          {item.available.toLocaleString("ru-RU")}
                        </td>
                        {isCommercialDirector && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {blocksDelete ? null : (
                              <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => openDeleteProduct(item)}
                                    aria-label={`Удалить товар ${item.name}`}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/20 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "arrivals" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={arrivalSearch}
                onChange={(e) => setArrivalSearch(e.target.value)}
                placeholder="Поиск по товару или артикулу…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card"
              />
            </div>
            <button
              // Обязательно через стрелку: передача handlePrintArrivals напрямую
              // отдала бы в rowsToPrint событие клика вместо arrivals.
              onClick={() => handlePrintArrivals()}
              disabled={arrivalsLoading || arrivals.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={14} />
              Распечатать список
            </button>
          </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {arrivalsError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-400/15 border-b border-red-200 dark:border-red-400/25">
              <AlertTriangle size={15} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{arrivalsError}</p>
            </div>
          )}

          {arrivalsLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Загрузка приходов…</p>
            </div>
          ) : arrivals.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground"><Inbox size={22} className="text-muted-foreground/50" />Нет данных о приходах</div>
          ) : arrivalWarehouseGroups.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              <Inbox size={22} className="text-muted-foreground/50" />
              {/* Активный список пуст по двум разным причинам: поиск ничего не
                  нашёл либо все приходы уже приняты и уехали в историю ниже. */}
              {isSearchingArrivals ? "Ничего не найдено" : "Нет приходов в работе — завершённые в «Истории» ниже"}
            </div>
          ) : (
            renderArrivalTree({
              groups: arrivalWarehouseGroups,
              warehouseValue: warehouseAccordionValue,
              onWarehouseValueChange: isSearchingArrivals ? () => {} : setExpandedArrivalWarehouses,
              projectValue: projectAccordionValue,
              onProjectValueChange: isSearchingArrivals ? () => {} : setExpandedArrivalGroups,
              // Печатаем ровно то, что видно в активном дереве: с учётом поиска,
              // без истории.
              onPrintWarehouse: (group) =>
                handlePrintArrivals(group.items, `Приход — ${group.warehouseName}`),
            })
          )}
        </div>

        {arrivalWarehouseHistoryGroups.length > 0 && (
          <>
            <div className="flex items-center gap-2 mt-8 mb-3">
              <History size={15} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">История</h3>
              <span className="text-xs text-muted-foreground">{historyArrivals.length} позиций</span>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {renderArrivalTree({
                groups: arrivalWarehouseHistoryGroups,
                warehouseValue: historyWarehouseAccordionValue,
                onWarehouseValueChange: isSearchingArrivals ? () => {} : setExpandedArrivalHistoryWarehouses,
                projectValue: historyProjectAccordionValue,
                onProjectValueChange: isSearchingArrivals ? () => {} : setExpandedArrivalHistoryGroups,
              })}
            </div>
          </>
        )}
        </>
      )}

      {tab === "shipments" && (
        <>
          <div className="relative mb-4 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={shipmentSearch}
              onChange={(e) => setShipmentSearch(e.target.value)}
              placeholder="Поиск по товару…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card"
            />
          </div>

          {pendingError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg mb-4">
              <AlertTriangle size={15} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{pendingError}</p>
            </div>
          )}

          {pendingLoading ? (
            <div className="flex flex-col items-center justify-center py-10 bg-card rounded-lg border border-border mb-6">
              <Loader2 size={22} className="animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Загрузка проектов на отгрузку…</p>
            </div>
          ) : pendingShipments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground bg-card rounded-lg border border-dashed border-border mb-6">
              Нет проектов, готовых к отгрузке
            </div>
          ) : filteredPendingShipments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground bg-card rounded-lg border border-dashed border-border mb-6">
              Ничего не найдено
            </div>
          ) : (
            <Accordion
              type="multiple"
              value={pendingShipmentAccordionValue}
              onValueChange={isSearchingShipments ? () => {} : setExpandedPendingShipmentGroups}
              className="space-y-4 mb-8"
            >
              {filteredPendingShipments.map((proj) => {
                const checkedItems = proj.items.filter((it) => it.checked);
                const canSubmit =
                  checkedItems.length > 0 &&
                  checkedItems.every((it) => it.warehouseId) &&
                  !proj.submitting;

                let helperText = "";
                if (!canSubmit && !proj.submitting) {
                  if (checkedItems.length === 0) {
                    helperText = "Отметьте хотя бы одну позицию для отгрузки";
                  } else if (!checkedItems.every((it) => it.warehouseId)) {
                    helperText = "Выберите склад для каждой отмеченной позиции";
                  }
                }

                const projectKey = String(proj.projectId);

                return (
                  <AccordionItem
                    key={projectKey}
                    value={projectKey}
                    // last:border-b возвращает нижнюю рамку, которую снимает
                    // last:border-b-0 из AccordionItem: здесь элементы — не строки
                    // списка с разделителями, а отдельные карточки с рамкой по кругу.
                    className="bg-card rounded-lg border border-border last:border-b shadow-sm overflow-hidden"
                  >
                    {/* Кнопка "Список" и ProjectRevertControl лежат рядом с
                        AccordionTrigger, а не внутри: триггер — это <button>, и
                        вложенные в него кнопки/меню были бы невалидной вложенностью
                        интерактивных элементов. Поэтому и stopPropagation на них
                        больше не нужен — клик по шапке больше не тогглит группу. */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-background border-b border-border">
                      <div className="min-w-0 flex-1">
                        <AccordionTrigger className="items-center gap-3 rounded-none px-5 py-3.5 transition-colors hover:bg-muted/50 hover:no-underline [&>svg]:order-first [&>svg]:translate-y-0">
                          {/* flex-1 обязателен: у триггера justify-between, и без
                              растягивания текста шеврон с order-first ушёл бы влево,
                              а название прижалось бы к правому краю триггера. */}
                          <span className="flex flex-1 flex-col">
                            <span className="text-sm font-bold text-foreground">{proj.projectName}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {proj.items.length} позиций к сборке
                              {checkedItems.length > 0 && ` · отмечено ${checkedItems.length}`}
                            </span>
                          </span>
                        </AccordionTrigger>
                      </div>

                      <div className="flex items-center gap-2 pr-5">
                        <button
                          onClick={() => handleDownloadChecklist(proj.projectId, proj.projectName)}
                          disabled={downloadingChecklistId === proj.projectId}
                          title="Распечатать список на отгрузку"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-background disabled:opacity-50"
                        >
                          {downloadingChecklistId === proj.projectId ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <FileText size={14} />
                          )}
                          Список
                        </button>
                        {warehouses.map((wh) => {
                          const isDownloading =
                            downloadingWarehouseChecklistKey === `${proj.projectId}:${wh.id}`;
                          return (
                            <button
                              key={wh.id}
                              type="button"
                              onClick={() =>
                                handleDownloadWarehouseChecklist(proj.projectId, proj.projectName, wh.id, wh.name)
                              }
                              disabled={isDownloading}
                              title={`Распечатать список на отгрузку по складу «${wh.name}»`}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-background disabled:opacity-50"
                            >
                              {isDownloading ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <FileText size={14} />
                              )}
                              Список {wh.code}
                            </button>
                          );
                        })}
                        <span className="px-2.5 py-1 text-xs font-semibold bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 rounded-full flex items-center gap-1">
                          <PackageCheck size={12} /> Зарезервировано
                        </span>
                        {/* GET /warehouse/shipments/pending не отдаёт status проекта —
                            сам факт присутствия в этом списке означает, что проект уже
                            на этапе "На отгрузке" (иначе он не попал бы в pending-выборку
                            бэкенда), поэтому currentStatus передаём фиксированным. */}
                        <ProjectRevertControl
                          projectId={proj.projectId}
                          currentStatus="На отгрузке"
                          onReverted={async () => {
                            // Сразу убираем строку локально — не ждём
                            // ответа рефетча, чтобы проект не "висел" на
                            // экране лишний цикл сети. loadPendingShipments
                            // ниже подтягивает настоящее состояние с
                            // backend и служит источником истины: если
                            // проект туда вернётся, это будет означать,
                            // что backend не снял резерв при откате.
                            setPendingShipments((prev) =>
                              prev.filter((p) => p.projectId !== proj.projectId),
                            );
                            await loadPendingShipments();
                            if (role === "pm" || role === "commercial_director") {
                              onOpenProject?.(proj.projectId);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <AccordionContent className="p-0">
                      {proj.error && (
                        <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-xs">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          {proj.error}
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-border bg-background/40">
                              <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left w-10"></th>
                              <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Товар</th>
                              <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Кол.</th>
                              <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Ед.</th>
                              <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Склад</th>
                              <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Фото</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {proj.items.map((it) => (
                              <tr key={it.id} className={`hover:bg-background/40 transition-colors ${it.checked ? "bg-primary/5" : ""}`}>
                                <td className="px-5 py-3 text-center">
                                {(isWarehouseUser || canShipDirect) && (
                                <input
                                  type="checkbox"
                                  checked={it.checked}
                                  // Для кладовщика без склада отметить нельзя (как раньше);
                                  // PM/Комдир отмечают и прямые позиции, у которых
                                  // availableWarehouses пуст.
                                  disabled={proj.submitting || (isWarehouseUser && !it.warehouseId)}
                                  onChange={() => toggleShipmentItemChecked(proj.projectId, it.id)}
                                  className="w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
                                />
                                )}
                                </td>
                                <td className="px-5 py-3 text-sm font-medium text-foreground">
                                  <div className="flex flex-col gap-1">
                                    <span>{it.productName}</span>
                                    <SupplySourceBadge source={it.supplySource} />
                                    {it.kitGroupKey ? (
                                      <span
                                        className="inline-flex w-fit max-w-[220px] items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                                        title={`из комплекта «${(it.kitName || "").trim() || "Комплект"}»${it.quantityPerKit != null ? ` ×${it.quantityPerKit}` : ""}`}
                                      >
                                        <Package size={10} className="shrink-0" />
                                        <span className="truncate">
                                          из комплекта «{(it.kitName || "").trim() || "Комплект"}»
                                          {it.quantityPerKit != null ? ` ×${it.quantityPerKit}` : ""}
                                        </span>
                                      </span>
                                    ) : null}
                                    {it.kitGroupKey && it.kitQuantity != null ? (
                                      <span className="text-[11px] text-muted-foreground">
                                        комплектов в проекте: {it.kitQuantity}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-5 py-3 text-sm font-mono text-foreground text-center">{it.quantity}</td>
                                <td className="px-5 py-3 text-xs text-muted-foreground">{it.unit}</td>
                                <td className="px-5 py-3">
                                  {it.availableWarehouses.length === 0 ? (
                                    // supplier_direct не резервируется на нашем складе по
                                    // дизайну — это ожидаемое состояние, а не нехватка товара.
                                    SUPPLY_SOURCE_PENDING_SHIPMENT_LABELS[it.supplySource] ? (
                                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                        {SUPPLY_SOURCE_PENDING_SHIPMENT_LABELS[it.supplySource]}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-destructive italic">Нет резерва ни на одном складе</span>
                                    )
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <Building2 size={13} className="text-muted-foreground" />
                                      <select
                                        value={it.warehouseId ?? ""}
                                        onChange={(e) => setShipmentItemWarehouse(proj.projectId, it.id, Number(e.target.value))}
                                        disabled={proj.submitting}
                                        className="text-sm border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-primary bg-card"
                                      >
                                        {it.availableWarehouses.map((wh) => (
                                          <option key={wh.warehouseId} value={wh.warehouseId}>
                                            {wh.warehouseName}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </td>
                                <td className="px-5 py-3">
                                  {isWarehouseUser && it.checked ? (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <label
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-lg cursor-pointer transition-colors ${
                                            it.photo
                                              ? "border-green-300 dark:border-green-400/40 bg-green-50 dark:bg-green-400/10 text-green-700 dark:text-green-300"
                                              : "border-dashed border-border text-muted-foreground hover:bg-background"
                                          }`}
                                        >
                                          {it.photo ? <CheckCircle2 size={13} /> : <Camera size={13} className="text-primary" />}
                                          <span className="truncate max-w-[110px]">{it.photo ? it.photo.name : "Приложить фото"}</span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            disabled={proj.submitting}
                                            onChange={(e) => setShipmentItemPhoto(proj.projectId, it.id, e.target.files?.[0] || null)}
                                          />
                                        </label>
                                        {it.photo ? (
                                          <button
                                            type="button"
                                            onClick={() => setShipmentItemPhoto(proj.projectId, it.id, null)}
                                            disabled={proj.submitting}
                                            title="Убрать фото"
                                            className="text-muted-foreground hover:text-destructive"
                                          >
                                            <X size={13} />
                                          </button>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground/70 italic whitespace-nowrap">необязательно</span>
                                        )}
                                      </div>
                                      {proj.submitting && it.photo && it.photoUploadProgress != null && (
                                        <div className="h-1 w-28 rounded-full bg-muted overflow-hidden">
                                          <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${it.photoUploadProgress}%` }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/60 italic">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {canShipDirect && (
                        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3.5 border-t border-border bg-background/40">
                          <button
                            type="button"
                            onClick={() => handleShipDirect(proj.projectId)}
                            disabled={proj.submitting || checkedItems.length === 0}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-border text-foreground hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {proj.submitting ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
                            Отправлено со склада поставщика
                          </button>
                        </div>
                      )}

                      {isWarehouseUser && (
                        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3.5 border-t border-border bg-background/40">
                          <div className="flex flex-col items-end gap-1">
                            {helperText && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">{helperText}</p>
                            )}
                            <button
                              onClick={() => handleSendToShipment(proj.projectId)}
                              disabled={!canSubmit}
                              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors ${
                                canSubmit
                                  ? "bg-green-600 hover:bg-success/90 text-white cursor-pointer"
                                  : "bg-slate-200 text-muted-foreground cursor-not-allowed"
                              }`}
                            >
                              {proj.submitting ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
                              Отправить на отгрузку{checkedItems.length > 0 ? ` (${checkedItems.length})` : ""}
                            </button>
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          <div className="flex items-center gap-2 mb-3">
            <Truck size={15} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">История отгрузок</h3>
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
          {shipmentsError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-400/15 border-b border-red-200 dark:border-red-400/25">
              <AlertTriangle size={15} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{shipmentsError}</p>
            </div>
          )}

          {shipmentsLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Загрузка отгрузок…</p>
            </div>
          ) : shipments.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground"><Inbox size={22} className="text-muted-foreground/50" />Нет данных об отгрузках</div>
          ) : shipmentHistoryGroups.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground"><Inbox size={22} className="text-muted-foreground/50" />Ничего не найдено</div>
          ) : (
            <Accordion
              type="multiple"
              value={shipmentHistoryAccordionValue}
              onValueChange={isSearchingShipments ? () => {} : setExpandedShipmentGroups}
              className="flex flex-col"
            >
              {shipmentHistoryGroups.map((group) => (
                <AccordionItem key={group.key} value={group.key} className="border-border">
                  <AccordionTrigger className="items-center gap-3 rounded-none bg-background/60 px-4 py-3.5 transition-colors hover:bg-muted/50 hover:no-underline [&>svg]:order-first [&>svg]:translate-y-0">
                    <span className="flex flex-1 flex-wrap items-center justify-between gap-3">
                      <span className="flex flex-col">
                        <span className="text-sm font-bold text-foreground">{group.projectName}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {group.shipments.length} отгрузок · {group.itemsCount} позиций
                        </span>
                      </span>

                      <span className="flex items-center gap-2 flex-wrap">
                        {group.photosCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-400/20 text-primary whitespace-nowrap">
                            <Camera size={12} /> фото {group.photosCount}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-400/20 text-green-700 dark:text-green-300 whitespace-nowrap">
                          <CheckCircle2 size={12} /> отгружено {group.itemsCount}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">{group.lastShipmentLabel}</span>
                      </span>
                    </span>
                  </AccordionTrigger>

                  <AccordionContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-background/60">
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">№ Накладной</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Дата</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Товары</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center whitespace-nowrap">Позиций</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Фото</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Отгрузил</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Статус</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {group.shipments.map((s, index) => {
                            const photosCount = s.items.filter((it) => it.photoUrl).length;
                            const shippedBy = s.items.find((it) => it.shippedBy)?.shippedBy || null;
                            const productSummary = s.items.map((it) => it.productName).join(", ");

                            return (
                              <tr
                                key={s.id ?? `${group.key}-${index}`}
                                onClick={() => setShipmentDetailsTarget(s)}
                                title="Открыть детали отгрузки"
                                className="hover:bg-background/50 transition-colors cursor-pointer"
                              >
                                <td className="px-4 py-3.5 text-xs font-mono font-medium text-foreground whitespace-nowrap">
                                  {s.id != null ? `№${s.id}` : "—"}
                                </td>
                                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{s.dateLabel}</td>
                                <td className="px-4 py-3.5 text-sm text-foreground">
                                  <span className="block max-w-[320px] truncate" title={productSummary}>
                                    {productSummary || "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-sm font-mono font-bold text-foreground text-center">
                                  {s.items.length}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  {photosCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                                      <Camera size={13} /> {photosCount}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/60 italic">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-sm text-foreground">
                                  {shippedBy ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                                      <User size={12} className="text-muted-foreground" />
                                      {shippedBy}
                                    </span>
                                  ) : (
                                    <span
                                      className="text-xs text-muted-foreground/60 italic"
                                      title="Не зафиксировано — отгрузка до внедрения учёта исполнителя"
                                    >
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-400/20 text-green-700 dark:text-green-300 whitespace-nowrap">
                                    <CheckCircle2 size={14} /> {s.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
          </div>
        </>
      )}
    </PageWrap>
  );
}