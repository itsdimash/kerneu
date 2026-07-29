import { useState, useEffect, useMemo } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import { ShipmentModal } from "../app/components/modals/ShipmentModal";
import { Chip } from "../app/components/common/Chip";
import { Truck, Search, Eye, AlertTriangle, Loader2, Plus, X, PackageCheck, Building2 } from "lucide-react";
import type { ProjectState, BannerVariant, Role } from "../types";
import {
  fetchWarehouseStocks,
  fetchWarehouseReceipts,
  fetchWarehouseList,
  postWarehouseIncome,
  updateReceiptStatus,
  reserveProjectItems,
  shipProjectItems,
  fetchWarehouseShipments,
  WarehouseStockResponse,
  WarehouseReceiptResponse,
  WarehouseInfo,
  ReceiptStatusValue,
} from "../api/api";

// Стандартные склады по умолчанию, если бэкенд возвращает пустой список
const DEFAULT_WAREHOUSES: WarehouseInfo[] = [
  { id: 1, name: "Карабулак", code: "Кар" },
  { id: 2, name: "Абишова", code: "Аб" },
];

type StockRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  perWarehouse: Record<number, number>; // warehouse_id -> actual_quantity
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
  supplier: string;
  item: string;
  qty: number;
  unit: string;
  status: string;
};

type ShipmentRow = {
  id: number;
  projectId: number;
  date: string;
  project: string;
  items: number;
  status: string;
};

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
    // Достаем название проекта или пишем его ID
    project: item.project_name || (item.project_id ? `Проект #${item.project_id}` : "—"), 
    date: item.date ? new Date(item.date).toLocaleDateString("ru-RU") : "—",
    supplier: item.supplier?.supplier_name || item.supplier?.name || `Поставщик #${item.supplier_id}`,
    item: item.product?.name || `Товар #${item.product_id}`,
    qty: item.quantity,
    unit: item.product?.unit || "шт",
    status: item.status?.toLowerCase() || "pending",
  };
}

const RECEIPT_STATUS_FLOW: ReceiptStatusValue[] = ["pending", "transit", "arrived"];

function nextReceiptStatus(current: string): ReceiptStatusValue | null {
  const idx = RECEIPT_STATUS_FLOW.indexOf(current as ReceiptStatusValue);
  if (idx === -1 || idx === RECEIPT_STATUS_FLOW.length - 1) return null;
  return RECEIPT_STATUS_FLOW[idx + 1];
}

const RECEIPT_STATUS_LABEL: Record<string, string> = {
  pending: "В ожидании",
  transit: "В пути",
  arrived: "Прибыл",
};

// ==========================================
// Модалка оприходования товара
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
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ")
          : e instanceof Error
          ? e.message
          : "Не удалось оприходовать товар";
      setError(message);
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
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
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
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
          >
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

export function WarehousePage({
  role,
  projectState,
}: {
  role: Role;
  projectState: ProjectState;
}) {
  const isWarehouseUser = role === "warehouse";
  const isPMUser = role === "pm" || role === "admin"; // Доступ для ПМ и админов

  const [tab, setTab] = useState<"stock" | "arrivals" | "shipments">("stock");

  // Если с API склады еще не пришли, используем DEFAULT_WAREHOUSES
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
  const [updatingReceiptId, setUpdatingReceiptId] = useState<number | null>(null);

  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);
  const [reservingProjectId, setReservingProjectId] = useState<number | null>(null);
  const [shippingProjectId, setShippingProjectId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const shipmentLocked = !projectState.contractSigned;

  useEffect(() => {
    loadWarehouses();
    loadStock();
    loadArrivals();
    loadShipments();
  }, []);

  const loadWarehouses = async () => {
    try {
      const data = await fetchWarehouseList();
      if (data && data.length > 0) {
        setWarehouses(data);
      }
    } catch (e) {
      console.error("Не удалось загрузить список складов, используем по умолчанию:", e);
    }
  };

  const loadStock = async () => {
    setStockLoading(true);
    setStockError(null);
    try {
      const data = await fetchWarehouseStocks();
      setStock(data.map(mapStock));
    } catch (e) {
      console.error(e);
      setStockError(e instanceof Error ? e.message : "Не удалось загрузить остатки склада");
    } finally {
      setStockLoading(false);
    }
  };

  const syncStockSilently = async () => {
    try {
      const data = await fetchWarehouseStocks();
      setStock(data.map(mapStock));
    } catch (e) {
      console.error("Фоновая синхронизация остатков не удалась:", e);
    }
  };

  const syncArrivalsSilently = async () => {
    try {
      const data = await fetchWarehouseReceipts();
      setArrivals(data.map(mapReceipt));
    } catch (e) {
      console.error("Фоновая синхронизация приходов не удалась:", e);
    }
  };

  const handleStockAdded = () => {
    syncStockSilently();
    syncArrivalsSilently();
  };

  const loadArrivals = async () => {
    setArrivalsLoading(true);
    setArrivalsError(null);
    try {
      const data = await fetchWarehouseReceipts();
      setArrivals(data.map(mapReceipt));
    } catch (e) {
      console.error(e);
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
      console.error(e);
      setShipmentsError(e instanceof Error ? e.message : "Не удалось загрузить отгрузки");
    } finally {
      setShipmentsLoading(false);
    }
  };

  const syncShipmentsSilently = async () => {
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
      console.error("Фоновая синхронизация отгрузок не удалась:", e);
    }
  };

  const handleReserveProject = async (projectId: number) => {
    const warehouseId = selectedWarehouseId !== "all" ? selectedWarehouseId : warehouses[0]?.id ?? 1;
    setReservingProjectId(projectId);
    setActionMessage(null);
    try {
      await reserveProjectItems(projectId, warehouseId);
      setActionMessage({ type: "success", text: `Проект #${projectId} зарезервирован` });
      syncStockSilently();
      syncShipmentsSilently();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : e instanceof Error
          ? e.message
          : "Не удалось зарезервировать проект";
      setActionMessage({ type: "error", text: message });
    } finally {
      setReservingProjectId(null);
    }
  };

  const handleShipProject = async (projectId: number) => {
    const warehouseId = selectedWarehouseId !== "all" ? selectedWarehouseId : warehouses[0]?.id ?? 1;
    setShippingProjectId(projectId);
    setActionMessage(null);
    try {
      await shipProjectItems(projectId, warehouseId);
      setActionMessage({ type: "success", text: `Проект #${projectId} отгружен` });
      syncStockSilently();
      syncShipmentsSilently();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : e instanceof Error
          ? e.message
          : "Не удалось отгрузить проект";
      setActionMessage({ type: "error", text: message });
    } finally {
      setShippingProjectId(null);
    }
  };

  const handleShipment = (items: { id: number; qty: number }[]) => {
    setStock((s) =>
      s.map((item) => {
        const req = items.find((i) => i.id === item.id);
        if (!req || !req.qty) return item;
        return { ...item, reserved: item.reserved + req.qty, available: item.available - req.qty };
      })
    );
  };

  const handleAdvanceReceiptStatus = async (receiptId: number, currentStatus: string) => {
    const next = nextReceiptStatus(currentStatus);
    if (!next) return;

    const warehouseId = selectedWarehouseId !== "all" ? selectedWarehouseId : warehouses[0]?.id ?? 1;
    setUpdatingReceiptId(receiptId);
    try {
      await updateReceiptStatus(receiptId, next, warehouseId);
      await loadArrivals();
      if (next === "arrived") {
        await loadStock();
      }
    } catch (e) {
      setArrivalsError(e instanceof Error ? e.message : "Не удалось обновить статус прихода");
    } finally {
      setUpdatingReceiptId(null);
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
    ? { variant: "neutral", text: "Раздел «Склад» доступен для просмотра остатков. Формирование заявок на отгрузку станет доступно после поступления товаров на склад." }
    : { variant: "info", text: "Товары по проекту поступили на склад. Вы можете сформировать заявку на отгрузку." };

  return (
    <PageWrap
      title="Склад"
      subtitle={`Управление остатками, резервом и отгрузками по ${warehouses.length} складам`}
    >
      {showShipmentModal && (
        <ShipmentModal stock={stock} onClose={() => setShowShipmentModal(false)} onSubmit={handleShipment} />
      )}

      {showAddStockModal && (
        <AddStockModal warehouses={warehouses} onClose={() => setShowAddStockModal(false)} onSuccess={handleStockAdded} />
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

            {/* Фильтр по складам доступен и ПМ, и Складу */}
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
                  title={wh.name}
                >
                  {wh.code || wh.name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
              {[{ key: "all" as const, label: "Все" }, { key: "low" as const, label: "Низкий" }, { key: "reserved" as const, label: "В резерве" }, { key: "brak" as const, label: "Брак" }].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStockFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${stockFilter === f.key ? "bg-[#2563EB] text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            
          </div>

          {stockError && (
            <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 border border-red-300 rounded-lg">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{stockError}</p>
            </div>
          )}

          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            {stockLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[#2563EB] mb-2" />
                <p className="text-sm text-slate-500">Загрузка остатков…</p>
              </div>
            ) : filteredStock.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                {stockSearch.trim() !== "" || stockFilter !== "all" || selectedWarehouseId !== "all"
                  ? "Ничего не найдено по заданным условиям"
                  : "Нет данных об остатках"}
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">Артикул</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">Наименование</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">Ед. изм.</th>

                    {/* ОТОБРАЖЕНИЕ ВСЕХ СКЛАДОВ (Склад 1, Склад 2) для всех аккаунтов */}
                    {warehouses.map((wh) => (
  <th
    key={wh.id}
    className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-right"
    title={wh.name}
  >
    {wh.code || wh.name}
  </th>
))}

                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-800 uppercase tracking-wide text-right bg-slate-100/70">
                      Всего
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">В резерве</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Брак</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Доступно</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredStock.map((item) => {
                    const low = item.available < 50;
                    const pct = item.total > 0 ? item.reserved / item.total : 0;
                    return (
                      <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${low ? "bg-red-50/20" : ""}`}>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{item.sku}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-slate-800">{item.name}</p>
                          <div className="mt-1 w-24 bg-slate-100 rounded-full h-1">
                            <div className="h-1 rounded-full bg-violet-500" style={{ width: `${pct * 100}%` }} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>

                        {/* Количество на каждом отдельном складе */}
{warehouses.map((wh) => (
  <td key={wh.id} className="px-4 py-3 text-sm font-mono text-slate-700 text-right">
    {(item.perWarehouse[wh.id] || 0).toLocaleString("ru-RU")}
  </td>
))}

                        {/* Общее количество по всем складам */}
                        <td className="px-4 py-3 text-sm font-mono text-slate-900 text-right font-bold bg-slate-50">
                          {item.total.toLocaleString("ru-RU")}
                        </td>

                        <td className="px-4 py-3 text-sm font-mono text-violet-600 text-right">{item.reserved.toLocaleString("ru-RU")}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {item.defective > 0 ? (
                            <span className="text-red-600 font-semibold">{item.defective.toLocaleString("ru-RU")}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-mono font-semibold ${low ? "text-red-600" : "text-green-600"}`}>{item.available.toLocaleString("ru-RU")}</span>
                        </td>
                        <td className="px-4 py-3">
                          {low ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded ring-1 ring-red-200"><AlertTriangle size={10} /> Низкий</span>
                          ) : (
                            <span className="inline-flex text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded ring-1 ring-green-200">В норме</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "arrivals" && (
        <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
          {arrivalsError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border-b border-red-200">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
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
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                  {[
                    "Проект", "№ Прихода", "Дата (Ожидается)", "Поставщик", "Наименование", "Кол-во", "Ед. изм.", "Статус",
                    ...(isWarehouseUser ? [""] : []),
                  ].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {arrivals.map((a) => {
                  const next = nextReceiptStatus(a.status);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-sm font-semibold text-blue-700 bg-blue-50/30">
                          {a.project}
                      </td>
                        
                      <td className="px-4 py-3 text-xs font-mono font-medium text-slate-700">{a.receiptNumber}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{a.date}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{a.supplier}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{a.item}</td>
                      <td className="px-4 py-3 text-sm font-mono font-bold text-slate-900">{a.qty.toLocaleString("ru-RU")}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.unit}</td>
                      <td className="px-4 py-3"><Chip status={a.status} /></td>
                      {isWarehouseUser && (
                        <td className="px-4 py-3">
                          {next ? (
                            <button
                              onClick={() => handleAdvanceReceiptStatus(a.id, a.status)}
                              disabled={updatingReceiptId === a.id}
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1 border border-[#E2E8F0] rounded hover:bg-slate-50 text-slate-600 disabled:opacity-50"
                            >
                              {updatingReceiptId === a.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <PackageCheck size={11} />
                              )}
                              {RECEIPT_STATUS_LABEL[next] ? `→ ${RECEIPT_STATUS_LABEL[next]}` : "Обновить"}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "shipments" && (
        <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
          {actionMessage && (
            <div
              className={`flex items-start gap-3 p-4 border-b ${
                actionMessage.type === "success"
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <p className={`text-sm ${actionMessage.type === "success" ? "text-emerald-700" : "text-red-700"}`}>
                {actionMessage.text}
              </p>
            </div>
          )}

          {shipmentsError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border-b border-red-200">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
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
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                  {["№ Отгрузки", "Дата", "Проект", "Позиций", "Статус", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{s.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{s.project}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{s.items} позиции</td>
                    <td className="px-4 py-3"><Chip status={s.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button className="text-xs px-2.5 py-1 border border-[#E2E8F0] rounded hover:bg-slate-50 text-slate-600 flex items-center gap-1">
                          <Eye size={11} />Детали
                        </button>
                        {isWarehouseUser && (
                          <>
                            <button
                              onClick={() => handleReserveProject(s.projectId)}
                              disabled={reservingProjectId === s.projectId}
                              className="text-xs px-2.5 py-1 border border-emerald-200 rounded hover:bg-emerald-50 text-emerald-700 flex items-center gap-1 disabled:opacity-50"
                            >
                              {reservingProjectId === s.projectId ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <PackageCheck size={11} />
                              )}
                              В резерв
                            </button>
                            <button
                              onClick={() => handleShipProject(s.projectId)}
                              disabled={shippingProjectId === s.projectId}
                              className="text-xs px-2.5 py-1 border border-[#2563EB]/30 rounded hover:bg-blue-50 text-[#2563EB] flex items-center gap-1 disabled:opacity-50"
                            >
                              {shippingProjectId === s.projectId ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Truck size={11} />
                              )}
                              Отгрузить
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </PageWrap>
  );
}