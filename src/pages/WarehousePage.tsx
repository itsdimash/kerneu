import { useState, useEffect, useMemo } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
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
} from "lucide-react";
import type { ProjectState, BannerVariant, Role } from "../types";
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
  WarehouseStockResponse,
  WarehouseReceiptResponse,
  WarehouseInfo,
  ShipmentPendingProject,
} from "../api/api";

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
  date: string;
  warehouseName: string; // Новое поле: на какой склад придет товар
  supplier: string;
  item: string;
  qty: number;
  unit: string;
  status: string; // 'pending' | 'arrived' | 'cancelled'
  actualQuantity: number | null;
  warehouseComment: string | null;
  photoPath: string | null;
  confirmedAt: string | null;
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
};

type PendingShipmentProjectRow = {
  projectId: number;
  projectName: string;
  items: PendingShipmentItemRow[];
  submitting?: boolean;
  error?: string | null;
};

// Склады как отдельного справочника на бэке нет — реальные id/название склада
// приходят вложенными внутрь каждого товара в /warehouse/stocks (item.stocks[].warehouse_id/warehouse_name).
// Поэтому список складов для колонок таблицы собираем из этих данных, а не из отдельного (несуществующего) эндпоинта.
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

function mapReceipt(item: WarehouseReceiptResponse): ArrivalRow {
  return {
    id: item.id,
    receiptNumber: item.receipt_number || `ПР-${item.id}`,
    project: item.project_name || (item.project_id ? `Проект #${item.project_id}` : "—"),
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Добавить товар на склад</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Склад *</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB] bg-white text-slate-700 font-medium"
            >
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">ID товара *</label>
            <input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              type="number"
              placeholder="Например, 12"
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Количество *</label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              placeholder="Например, 500"
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">ID поставщика *</label>
            <input
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              type="number"
              placeholder="Например, 3"
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">
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
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const qty = Number(actualQuantity);
    if (!actualQuantity || Number.isNaN(qty) || qty < 0) {
      setError("Укажите корректное фактическое количество");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await confirmReceipt(receipt.id, { actual_quantity: qty, comment, photo });
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">
            Подтвердить приход {receipt.receiptNumber}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          {receipt.item} · план {receipt.qty} {receipt.unit} · {receipt.supplier} ({receipt.warehouseName})
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Сколько пришло на самом деле *
            </label>
            <input
              value={actualQuantity}
              onChange={(e) => setActualQuantity(e.target.value)}
              type="number"
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Комментарий кладовщика</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Например: 2 шт с повреждённой упаковкой"
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB] resize-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600">
              <Camera size={15} className="text-[#2563EB]" />
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
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">
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
// (для кладовщика — с возможностью поправить фото/комментарий)
// ==========================================
const RECEIPT_PHOTO_BASE = "http://localhost:8000";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">
            Приход {receipt.receiptNumber}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between"><span className="text-slate-500">Товар</span><span className="font-medium text-slate-800 text-right">{receipt.item}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Поставщик</span><span className="font-medium text-slate-800">{receipt.supplier}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Склад</span><span className="font-medium text-slate-800">{receipt.warehouseName}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">План / Факт</span><span className="font-mono font-medium text-slate-800">{receipt.qty} / {receipt.actualQuantity ?? "—"} {receipt.unit}</span></div>
          {receipt.confirmedAt && (
            <div className="flex justify-between"><span className="text-slate-500">Подтверждено</span><span className="font-medium text-slate-800">{new Date(receipt.confirmedAt).toLocaleString("ru-RU")}</span></div>
          )}
        </div>

        {photoUrl && !editing && (
          <img src={photoUrl} alt="Фото товара" className="w-full rounded-lg border border-[#E2E8F0] mb-4 max-h-64 object-contain bg-slate-50" />
        )}

        {!editing ? (
          <>
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 mb-1">Комментарий кладовщика</p>
              <p className="text-sm text-slate-700 italic">
                {receipt.warehouseComment ? `"${receipt.warehouseComment}"` : "Без комментария"}
              </p>
            </div>

            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-[#E2E8F0] text-slate-700 hover:bg-slate-50"
              >
                <Camera size={14} /> Изменить фото / комментарий
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Комментарий кладовщика</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB] resize-none"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600">
                <Camera size={15} className="text-[#2563EB]" />
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
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] disabled:opacity-60"
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
  const shipmentLocked = !projectState.contractSigned;

  useEffect(() => {
    loadStock();
    loadArrivals();
    loadShipments();
    loadPendingShipments();
  }, []);

  const loadStock = async () => {
    setStockLoading(true);
    setStockError(null);
    try {
      const data = await fetchWarehouseStocks();
      setWarehouses(deriveWarehouses(data));
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

  // Проекты, у которых все позиции уже зарезервированы (резерв ставится
  // автоматически после подтверждения клиентом) и ждут, пока кладовщик
  // физически соберёт товар и отметит все позиции галочками.
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

  // Кладовщик отметил все позиции проекта (у каждой уже выбран свой склад,
  // т.к. резерв мог физически лежать на разных складах) — отгружаем
  // каждую позицию с её собственного склада и убираем проект из списка ожидающих.
  const handleSendToShipment = async (projectId: number) => {
    const proj = pendingShipments.find((p) => p.projectId === projectId);
    if (!proj) return;
    if (proj.items.length === 0 || !proj.items.every((it) => it.checked && it.warehouseId)) return;

    setPendingShipments((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, submitting: true, error: null } : p))
    );

    try {
      await shipProjectItemsPerWarehouse(
        projectId,
        proj.items.map((it) => ({ item_id: it.id, warehouse_id: it.warehouseId as number }))
      );
      setPendingShipments((prev) => prev.filter((p) => p.projectId !== projectId));
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

  const handleConfirmSuccess = () => {
    loadArrivals();
    loadStock();
  };

  const handleToggleCancel = async (receipt: ArrivalRow) => {
    setCancellingReceiptId(receipt.id);
    try {
      await setReceiptCancelled(receipt.id, receipt.status !== "cancelled");
      await loadArrivals();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setArrivalsError(typeof detail === "string" ? detail : "Не удалось изменить статус отмены");
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
      );
  }, [stock, selectedWarehouseId, stockFilter, stockSearch]);

  const warehouseBanner: { variant: BannerVariant; text: string } = shipmentLocked
    ? { variant: "neutral", text: "Раздел «Склад» доступен для просмотра остатков." }
    : { variant: "info", text: "Товары по проекту поступили на склад." };

  return (
    <PageWrap title="Склад" subtitle={`Управление остатками, резервом и отгрузками по ${warehouses.length} складам`}>
      {showAddStockModal && (
        <AddStockModal warehouses={warehouses} onClose={() => setShowAddStockModal(false)} onSuccess={() => { loadStock(); loadArrivals(); }} />
      )}

      {confirmTarget && (
        <ConfirmReceiptModal receipt={confirmTarget} onClose={() => setConfirmTarget(null)} onSuccess={handleConfirmSuccess} />
      )}

      {detailsTarget && (
        <ReceiptDetailsModal
          receipt={detailsTarget}
          canEdit={isWarehouseUser}
          onClose={() => setDetailsTarget(null)}
          onSuccess={(updated) => {
            setArrivals((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setDetailsTarget(updated);
          }}
        />
      )}

      {showShipmentModal && (
    <ShipmentModal onClose={() => setShowShipmentModal(false)} onSuccess={loadShipments} />
  )}


      <InfoBanner variant={warehouseBanner.variant} text={warehouseBanner.text} />

      <div className="flex items-center gap-1 mb-6 border-b border-[#E2E8F0]">
        {[{ key: "stock" as const, label: "Остатки" }, { key: "arrivals" as const, label: "Приход" }, { key: "shipments" as const, label: "Отгрузка" }].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Поиск по наименованию…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB] bg-white"
              />
            </div>

            <div className="flex items-center gap-1 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white p-0.5">
              <button
                onClick={() => setSelectedWarehouseId("all")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${selectedWarehouseId === "all" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Building2 size={12} /> Все склады
              </button>
              {warehouses.map((wh) => (
                <button
                  key={wh.id}
                  onClick={() => setSelectedWarehouseId(wh.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${selectedWarehouseId === wh.id ? "bg-[#2563EB] text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {wh.code || wh.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            {stockLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[#2563EB] mb-2" />
                <p className="text-sm text-slate-500">Загрузка остатков…</p>
              </div>
            ) : filteredStock.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">Нет данных об остатках</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">Артикул</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Наименование</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">Ед. изм.</th>
                      {warehouses.map((wh) => (
                        <th key={wh.id} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right whitespace-nowrap">{wh.code || wh.name}</th>
                      ))}
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-800 uppercase tracking-wide text-right bg-slate-100/70 whitespace-nowrap">Всего</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right whitespace-nowrap">В резерве</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right whitespace-nowrap">Брак</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right whitespace-nowrap">Доступно</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredStock.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{item.sku}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.name}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{item.unit}</td>
                        {warehouses.map((wh) => (
                          <td key={wh.id} className="px-4 py-3 text-sm font-mono text-slate-700 text-right whitespace-nowrap">
                            {(item.perWarehouse[wh.id] || 0).toLocaleString("ru-RU")}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm font-mono text-slate-900 text-right font-bold bg-slate-50 whitespace-nowrap">
                          {item.total.toLocaleString("ru-RU")}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-violet-600 text-right whitespace-nowrap">
                          {item.reserved.toLocaleString("ru-RU")}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-right whitespace-nowrap">
                          {item.defective > 0 ? (
                            <span className="text-red-600 font-semibold">{item.defective.toLocaleString("ru-RU")}</span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-green-600 font-semibold whitespace-nowrap">
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
        <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
          {arrivalsError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border-b border-red-200">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{arrivalsError}</p>
            </div>
          )}

          {arrivalsLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[#2563EB] mb-2" />
              <p className="text-sm text-slate-500">Загрузка приходов…</p>
            </div>
          ) : arrivals.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">Нет данных о приходах</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Название проекта</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">№ Прихода</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Когда придет товар</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Склад</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Поставщик</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Название товара</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Количество</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Ед. изм.</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Статус приема</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Действия кладовщика</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {arrivals.map((a) => {
                    const isCancelled = a.status === "cancelled";
                    const isArrived = a.status === "arrived";

                    return (
                      <tr key={a.id} className={`hover:bg-slate-50/50 transition-colors ${isCancelled ? "opacity-50 bg-slate-50" : ""}`}>
                        {/* 1. Название проекта */}
                        <td className="px-4 py-3.5 text-sm font-bold text-blue-700 bg-blue-50/30">
                          {a.project}
                        </td>

                        {/* 2. Номер прихода */}
                        <td className="px-4 py-3.5 text-xs font-mono font-medium text-slate-700">
                          {a.receiptNumber}
                        </td>

                        {/* 3. Когда придет товар */}
                        <td className="px-4 py-3.5 text-sm text-slate-600">
                          {a.date}
                        </td>

                        {/* 4. На какой склад (1-ый или 2-ой) */}
                        <td className="px-4 py-3.5 text-sm font-medium text-slate-800">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                            <Building2 size={12} className="text-blue-600" />
                            {a.warehouseName}
                          </span>
                        </td>

                        {/* 5. Название поставщика */}
                        <td className="px-4 py-3.5 text-sm font-medium text-slate-800">
                          {a.supplier}
                        </td>

                        {/* 6. Название товара */}
                        <td className="px-4 py-3.5 text-sm text-slate-800 font-medium">
                          {a.item}
                        </td>

                        {/* 7. Количество */}
                        <td className="px-4 py-3.5 text-sm font-mono font-bold text-slate-900 text-center">
                          {a.qty.toLocaleString("ru-RU")}
                          {a.actualQuantity !== null && a.actualQuantity !== a.qty && (
                            <span className="block text-xs font-normal text-amber-600">факт: {a.actualQuantity}</span>
                          )}
                        </td>

                        {/* 8. Ед. изм. */}
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {a.unit}
                        </td>

                        {/* 9. Икс или галочка в зависимости от того, принял ли склад */}
                        <td className="px-4 py-3.5 text-center">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700" title="Отменено">
                              <XCircle size={14} /> Отклонено
                            </span>
                          ) : isArrived ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700" title="Принято кладовщиком">
                              <CheckCircle2 size={14} /> Принято
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800" title="Ожидается доставка">
                              <Clock size={14} /> В пути
                            </span>
                          )}
                        </td>

                        {/* 10. Действия кладовщика: галочка — принять (открывает окно с фото/количеством/комментарием), крестик — отклонить */}
                        <td className="px-4 py-3.5 text-center">
                          {isCancelled ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs text-slate-400 italic">Приход отменен</span>
                              {isWarehouseUser && (
                                <button
                                  onClick={() => handleToggleCancel(a)}
                                  disabled={cancellingReceiptId === a.id}
                                  title="Вернуть в работу"
                                  className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
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
                              <span className="text-xs font-semibold text-green-700 flex items-center gap-1 group-hover:underline">
                                <PackageCheck size={14} /> Зачислено
                              </span>
                              {a.warehouseComment && (
                                <span className="text-[11px] text-slate-500 italic max-w-[150px] truncate" title={a.warehouseComment}>
                                  "{a.warehouseComment}"
                                </span>
                              )}
                            </button>
                          ) : isWarehouseUser ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setConfirmTarget(a)}
                                title="Принять приход"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                              <button
                                onClick={() => handleToggleCancel(a)}
                                disabled={cancellingReceiptId === a.id}
                                title="Отклонить приход"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
                              >
                                {cancellingReceiptId === a.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <XCircle size={16} />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Ожидает кладовщика</span>
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
          {/* --- Проекты, готовые к отгрузке: чекбоксы по позициям + выбор склада --- */}
          {pendingError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{pendingError}</p>
            </div>
          )}

          {pendingLoading ? (
            <div className="flex flex-col items-center justify-center py-10 bg-white rounded-lg border border-[#E2E8F0] mb-6">
              <Loader2 size={22} className="animate-spin text-[#2563EB] mb-2" />
              <p className="text-sm text-slate-500">Загрузка проектов на отгрузку…</p>
            </div>
          ) : pendingShipments.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400 bg-white rounded-lg border border-dashed border-[#E2E8F0] mb-6">
              Нет проектов, готовых к отгрузке
            </div>
          ) : (
            <div className="space-y-4 mb-8">
              {pendingShipments.map((proj) => {
                const allChecked = proj.items.length > 0 && proj.items.every((it) => it.checked && it.warehouseId);
                const canSubmit = allChecked && !proj.submitting;

                return (
                  <div key={proj.projectId} className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-50 border-b border-[#E2E8F0]">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{proj.projectName}</h3>
                        <p className="text-xs text-slate-500">{proj.items.length} позиций к сборке</p>
                      </div>
                      <span className="px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 rounded-full flex items-center gap-1">
                        <PackageCheck size={12} /> Зарезервировано
                      </span>
                    </div>

                    {proj.error && (
                      <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        {proj.error}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] bg-slate-50/40">
                            <th className="px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left w-10"></th>
                            <th className="px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Товар</th>
                            <th className="px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Кол.</th>
                            <th className="px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Ед.</th>
                            <th className="px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Склад</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {proj.items.map((it) => (
                            <tr key={it.id} className="hover:bg-slate-50/40 transition-colors">
                              <td className="px-5 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={it.checked}
                                  disabled={!isWarehouseUser || proj.submitting || !it.warehouseId}
                                  onChange={() => toggleShipmentItemChecked(proj.projectId, it.id)}
                                  className="w-4 h-4 accent-[#2563EB] cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="px-5 py-3 text-sm font-medium text-slate-800">{it.productName}</td>
                              <td className="px-5 py-3 text-sm font-mono text-slate-700 text-center">{it.quantity}</td>
                              <td className="px-5 py-3 text-xs text-slate-500">{it.unit}</td>
                              <td className="px-5 py-3">
                                {it.availableWarehouses.length === 0 ? (
                                  <span className="text-xs text-red-500 italic">Нет резерва ни на одном складе</span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <Building2 size={13} className="text-slate-400" />
                                    <select
                                      value={it.warehouseId ?? ""}
                                      onChange={(e) => setShipmentItemWarehouse(proj.projectId, it.id, Number(e.target.value))}
                                      disabled={proj.submitting}
                                      className="text-sm border border-[#E2E8F0] rounded-lg px-2 py-1 focus:outline-none focus:border-[#2563EB] bg-white"
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {isWarehouseUser && (
                      <div className="flex items-center justify-end px-5 py-3.5 border-t border-[#E2E8F0] bg-slate-50/40">
                        <button
                          onClick={() => handleSendToShipment(proj.projectId)}
                          disabled={!canSubmit}
                          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors ${
                            canSubmit
                              ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                              : "bg-slate-200 text-slate-400 cursor-not-allowed"
                          }`}
                        >
                          {proj.submitting ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
                          Отправить на отгрузку
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* --- История уже отгруженного --- */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
          {shipmentsError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border-b border-red-200">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{shipmentsError}</p>
            </div>
          )}

          {shipmentsLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[#2563EB] mb-2" />
              <p className="text-sm text-slate-500">Загрузка отгрузок…</p>
            </div>
          ) : shipments.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">Нет данных об отгрузках</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">№ Накладной</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Проект</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Дата</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Количество позиций</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {shipments.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3.5 text-xs font-mono font-medium text-slate-700">№{s.id}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-slate-800">{s.project}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{s.date}</td>
                      <td className="px-4 py-3.5 text-sm font-mono font-bold text-slate-900 text-center">{s.items}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
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