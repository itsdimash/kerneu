import { useState, useEffect, useMemo } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { ShipmentModal } from "../app/components/modals/ShipmentModal";
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
} from "lucide-react";
import type { ProjectState, Role } from "../types";
import {
  fetchWarehouseStocks,
  fetchWarehouseReceipts,
  postWarehouseIncome,
  setReceiptCancelled,
  confirmReceipt,
  updateReceiptDetails,
  reserveProjectItems,
  shipProjectItems,
  shipProjectItemsPerWarehouse,
  fetchWarehouseShipments,
  fetchPendingShipments,
  fetchWarehouseList,
  downloadShipmentChecklist,
  uploadShipmentPhoto,
  resolveDefectReplacement,
  WarehouseStockResponse,
  WarehouseReceiptResponse,
  WarehouseInfo,
  ShipmentPendingProject,
} from "../api/api";

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
  sku: string;
  name: string;
  unit: string;
  perWarehouse: Record<number, number>;
  total: number;
  reserved: number;
  defective: number;
  available: number;
};

type ArrivalRow = {
  id: number;
  receiptNumber: string;
  project: string;
  projectId: number | null;
  date: string;
  warehouseName: string;
  supplier: string;
  item: string;
  qty: number;
  unit: string;
  status: string;
  actualQuantity: number | null;
  warehouseComment: string | null;
  photoPath: string | null;
  confirmedAt: string | null;
  defectiveQuantity: number;
  defectResolved: boolean;
};

type ShipmentRow = {
  id: number;
  projectId: number;
  date: string;
  project: string;
  items: number;
  status: string;
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

function mapReceipt(item: WarehouseReceiptResponse): ArrivalRow {
  return {
    id: item.id,
    receiptNumber: item.receipt_number || `ПР-${item.id}`,
    project: item.project_name || (item.project_id ? `Проект #${item.project_id}` : "—"),
    projectId: item.project_id ?? null,
    date: item.date ? new Date(item.date).toLocaleDateString("ru-RU") : "—",
    warehouseName: item.warehouse?.name || (item.warehouse_id ? `Склад №${item.warehouse_id}` : "—"),
    supplier: item.supplier?.supplier_name || item.supplier?.name || `Поставщик #${item.supplier_id}`,
    item: item.product?.name || `Товар #${item.product_id}`,
    qty: item.quantity,
    unit: item.product?.unit || "шт",
    status: item.status?.toLowerCase() || "pending",
    actualQuantity: item.actual_quantity ?? null,
    warehouseComment: item.warehouse_comment ?? null,
    photoPath: item.photo_path ?? null,
    confirmedAt: item.confirmed_at ?? null,
    defectiveQuantity: item.defective_quantity ?? 0,
    defectResolved: item.defect_resolved ?? false,
  };
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
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

    try {
      await confirmReceipt(receipt.id, {
        actual_quantity: qty,
        defective_quantity: defQty,
        comment,
        photo,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Не удалось подтвердить приход");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
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
            <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg cursor-pointer hover:bg-background text-muted-foreground">
              <Camera size={15} className="text-primary" />
              {photo ? photo.name : "Прикрепить фото товара"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              />
            </label>
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
// Модалка просмотра деталей уже подтверждённого прихода
// ==========================================
const RECEIPT_PHOTO_BASE = "";

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
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const photoUrl = receipt.photoPath
    ? `${RECEIPT_PHOTO_BASE}/${receipt.photoPath.replace(/^\//, "")}`
    : null;

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateReceiptDetails(receipt.id, { comment, photo });
      onSuccess(mapReceipt(updated));
      setEditing(false);
      setPhoto(null);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Не удалось сохранить изменения");
    } finally {
      setSubmitting(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
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
          <img src={photoUrl} alt="Фото товара" className="w-full rounded-lg border border-border mb-4 max-h-64 object-contain bg-background" />
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
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WarehousePage({ role, projectState }: { role: Role; projectState: ProjectState }) {
  const isWarehouseUser = role === "warehouse";

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

  const [arrivals, setArrivals] = useState<ArrivalRow[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [arrivalsError, setArrivalsError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ArrivalRow | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ArrivalRow | null>(null);
  const [cancellingReceiptId, setCancellingReceiptId] = useState<number | null>(null);

  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);

  const [pendingShipments, setPendingShipments] = useState<PendingShipmentProjectRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);

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
      setShipments(
        data.map((item) => ({
          id: item.id,
          projectId: item.project_id,
          date: item.date ? new Date(item.date).toLocaleDateString("ru-RU") : "—",
          project: item.project_name,
          items: item.items_count,
          status: item.status,
        }))
      );
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
              items: p.items.map((it) => (it.id === itemId ? { ...it, photo: file } : it)),
              error: null,
            }
      )
    );
  };

  const handleSendToShipment = async (projectId: number) => {
    const proj = pendingShipments.find((p) => p.projectId === projectId);
    if (!proj) return;

    const checkedItems = proj.items.filter((it) => it.checked);

    if (checkedItems.length === 0) return;

    if (!checkedItems.every((it) => it.warehouseId && it.photo)) {
      setPendingShipments((prev) =>
        prev.map((p) =>
          p.projectId === projectId
            ? { ...p, error: "Выберите склад и приложите фото для каждой отмеченной позиции" }
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

      // Фото — отдельно на каждую отгружаемую позицию.
      // NOTE: uploadShipmentPhoto нужно расширить в api.ts третьим необязательным
      // параметром itemId, чтобы фото сохранялось в shipment_photos с привязкой
      // к project_item_id, а не только к проекту.
      await Promise.all(
        checkedItems.map((it) =>
          uploadShipmentPhoto(projectId, it.photo as File, it.id).catch((photoErr) => {
            console.error(`Не удалось загрузить фото для позиции ${it.id}`, photoErr);
          })
        )
      );

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

  const handleDownloadChecklist = async (projectId: number) => {
    setDownloadingChecklistId(projectId);
    try {
      await downloadShipmentChecklist(projectId);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Не удалось скачать список на отгрузку");
    } finally {
      setDownloadingChecklistId(null);
    }
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

  return (
    <PageWrap title="Склад" subtitle={`Управление остатками, резервом и отгрузками по ${warehouses.length} складам`}>
      {showAddStockModal && (
        <AddStockModal warehouses={warehouses} onClose={() => setShowAddStockModal(false)} onSuccess={() => { loadStock(); loadArrivals(); }} />
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStock.map((item) => (
                      <tr key={item.id} className="hover:bg-background/50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{item.sku}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{item.name}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "arrivals" && (
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-background/60">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Название проекта</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">№ Прихода</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Когда придет товар</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Склад</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Поставщик</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Название товара</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Количество</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Ед. изм.</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Статус приема</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Действия кладовщика</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {arrivals.map((a) => {
                    const isCancelled = a.status === "cancelled";
                    const isArrived = a.status === "arrived";

                    return (
                      <tr key={a.id} className={`hover:bg-background/50 transition-colors ${isCancelled ? "opacity-50 bg-background" : ""}`}>
                        <td className="px-4 py-3.5 text-sm font-bold text-blue-700 dark:text-blue-300 bg-blue-50/30 dark:bg-blue-400/15">
                          {a.project}
                        </td>

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

                        <td className="px-4 py-3.5 text-sm text-foreground font-medium">
                          {a.item}
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
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Ожидает кладовщика</span>
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
      )}

      {tab === "shipments" && (
        <>
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
          ) : (
            <div className="space-y-4 mb-8">
              {pendingShipments.map((proj) => {
                const checkedItems = proj.items.filter((it) => it.checked);
                const canSubmit =
                  checkedItems.length > 0 &&
                  checkedItems.every((it) => it.warehouseId && it.photo) &&
                  !proj.submitting;

                let helperText = "";
                if (!canSubmit && !proj.submitting) {
                  if (checkedItems.length === 0) {
                    helperText = "Отметьте хотя бы одну позицию для отгрузки";
                  } else if (!checkedItems.every((it) => it.warehouseId)) {
                    helperText = "Выберите склад для каждой отмеченной позиции";
                  } else if (!checkedItems.every((it) => it.photo)) {
                    helperText = "Прикрепите фото для каждой отмеченной позиции";
                  }
                }

                return (
                  <div key={proj.projectId} className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-background border-b border-border">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{proj.projectName}</h3>
                        <p className="text-xs text-muted-foreground">
                          {proj.items.length} позиций к сборке
                          {checkedItems.length > 0 && ` · отмечено ${checkedItems.length}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadChecklist(proj.projectId)}
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
                        <span className="px-2.5 py-1 text-xs font-semibold bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 rounded-full flex items-center gap-1">
                          <PackageCheck size={12} /> Зарезервировано
                        </span>
                      </div>
                    </div>

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
                              {isWarehouseUser && (
                              <input
                                type="checkbox"
                                checked={it.checked}
                                disabled={proj.submitting || !it.warehouseId}
                                onChange={() => toggleShipmentItemChecked(proj.projectId, it.id)}
                                className="w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
                              />
                              )}
                              </td>
                              <td className="px-5 py-3 text-sm font-medium text-foreground">{it.productName}</td>
                              <td className="px-5 py-3 text-sm font-mono text-foreground text-center">{it.quantity}</td>
                              <td className="px-5 py-3 text-xs text-muted-foreground">{it.unit}</td>
                              <td className="px-5 py-3">
                                {it.availableWarehouses.length === 0 ? (
                                  <span className="text-xs text-destructive italic">Нет резерва ни на одном складе</span>
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
                                ) : (
                                  <span className="text-xs text-muted-foreground/60 italic">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

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
                  </div>
                );
              })}
            </div>
          )}

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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-background/60">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">№ Накладной</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Проект</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Дата</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Количество позиций</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shipments.map((s) => (
                    <tr key={s.id} className="hover:bg-background/50 transition-colors">
                      <td className="px-4 py-3.5 text-xs font-mono font-medium text-foreground">№{s.id}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-foreground">{s.project}</td>
                      <td className="px-4 py-3.5 text-sm text-muted-foreground">{s.date}</td>
                      <td className="px-4 py-3.5 text-sm font-mono font-bold text-foreground text-center">{s.items}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-400/20 text-green-700 dark:text-green-300">
                          <CheckCircle2 size={14} /> {s.status || "Отгружено"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </>
      )}
    </PageWrap>
  );
}
