import { useState } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import { ShipmentModal } from "../app/components/modals/ShipmentModal";
import { Chip } from "../app/components/common/Chip";
import { Truck, Search, Eye, AlertTriangle } from "lucide-react";
import type { ProjectState, BannerVariant } from "../types";
import { STOCK_INIT, ARRIVALS, SHIPMENTS } from "../data/stock";

export function WarehousePage({ projectState }: { projectState: ProjectState }) {
  const [tab, setTab] = useState<"stock" | "arrivals" | "shipments">("stock");
  const [stock, setStock] = useState(STOCK_INIT);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "reserved" | "brak">("all");
  const shipmentLocked = !projectState.contractSigned;

  const handleShipment = (items: { id: number; qty: number }[]) => {
    setStock(s => s.map(item => {
      const req = items.find(i => i.id === item.id);
      if (!req || !req.qty) return item;
      return { ...item, reserved: item.reserved + req.qty, available: item.available - req.qty };
    }));
  };

  const filteredStock = stock.filter(item =>
    stockFilter === "all" ? true :
    stockFilter === "low" ? item.available < 200 :
    stockFilter === "brak" ? item.defective > 0 :
    item.reserved > 0
  );

  const warehouseBanner: { variant: BannerVariant; text: string } = shipmentLocked
    ? { variant: "neutral", text: "Раздел «Склад» доступен для просмотра остатков. Формирование заявок на отгрузку станет доступно после поступления товаров на склад." }
    : { variant: "info",    text: "Товары по проекту поступили на склад. Вы можете сформировать заявку на отгрузку." };

  return (
    <PageWrap title="Склад" subtitle="Управление остатками, резервом и отгрузками"
      actions={
        <AppTooltip text={shipmentLocked ? "Доступно после поступления товаров на склад" : ""}>
          <button onClick={() => !shipmentLocked && setShowShipmentModal(true)} disabled={shipmentLocked}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${shipmentLocked ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"}`}>
            <Truck size={14} /> Сформировать заявку на отгрузку
          </button>
        </AppTooltip>
      }>

      {showShipmentModal && <ShipmentModal stock={stock} onClose={() => setShowShipmentModal(false)} onSubmit={handleShipment} />}

      <InfoBanner variant={warehouseBanner.variant} text={warehouseBanner.text} />

      <div className="flex items-center gap-1 mb-6 border-b border-[#E2E8F0]">
        {[{ key: "stock" as const, label: "Остатки" }, { key: "arrivals" as const, label: "Приход" }, { key: "shipments" as const, label: "Отгрузка" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Поиск по наименованию…" className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB] bg-white" />
            </div>
            <div className="flex items-center gap-1 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
              {[{ key: "all" as const, label: "Все" }, { key: "low" as const, label: "Низкий" }, { key: "reserved" as const, label: "В резерве" }, { key: "brak" as const, label: "Брак" }].map(f => (
                <button key={f.key} onClick={() => setStockFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${stockFilter === f.key ? "bg-[#2563EB] text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                {["Артикул","Наименование","Ед. изм.","Всего","В резерве","Брак","Доступно","Статус"].map((h,i) => (
                  <th key={h} className={`px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide ${i >= 3 && i <= 6 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredStock.map(item => {
                  const low = item.available < 200;
                  const pct = item.total > 0 ? item.reserved / item.total : 0;
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${low ? "bg-red-50/20" : ""}`}>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{item.sku}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-800">{item.name}</p>
                        <div className="mt-1 w-24 bg-slate-100 rounded-full h-1">
                          <div className="h-1 rounded-full bg-violet-500" style={{ width: `${pct * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-700 text-right">{item.total.toLocaleString("ru-RU")}</td>
                      <td className="px-4 py-3 text-sm font-mono text-violet-600 text-right">{item.reserved.toLocaleString("ru-RU")}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {item.defective > 0
                          ? <span className="text-red-600 font-semibold">{item.defective.toLocaleString("ru-RU")}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right"><span className={`text-sm font-mono font-semibold ${low ? "text-red-600" : "text-green-600"}`}>{item.available.toLocaleString("ru-RU")}</span></td>
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
          </div>
        </>
      )}

      {tab === "arrivals" && (
        <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
              {["№ Прихода","Дата","Поставщик","Наименование","Кол-во","Ед.","Статус"].map(h => (
                <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {ARRIVALS.map(a => (
                <tr key={a.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{a.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{a.date}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{a.supplier}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{a.item}</td>
                  <td className="px-4 py-3 text-sm font-mono">{a.qty.toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.unit}</td>
                  <td className="px-4 py-3"><Chip status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "shipments" && (
        <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
              {["№ Отгрузки","Дата","Проект","Позиций","Статус",""].map(h => (
                <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {SHIPMENTS.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{s.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.date}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{s.project}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{s.items} позиции</td>
                  <td className="px-4 py-3"><Chip status={s.status} /></td>
                  <td className="px-4 py-3"><button className="text-xs px-2.5 py-1 border border-[#E2E8F0] rounded hover:bg-slate-50 text-slate-600 flex items-center gap-1"><Eye size={11} />Детали</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageWrap>
  );
}