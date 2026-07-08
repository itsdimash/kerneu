import { useState } from "react";
import { X, Truck, Loader2 } from "lucide-react";
import type { StockItem } from "../../../data/stock";
export function ShipmentModal({ stock, onClose, onSubmit }: {
  stock: StockItem[]; onClose: () => void;
  onSubmit: (items: { id: number; qty: number }[]) => void;
}) {
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      onSubmit(Object.entries(qtys).filter(([,q]) => q > 0).map(([id,qty]) => ({ id: parseInt(id), qty })));
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-slate-900">Заявка на отгрузку</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-slate-500 mb-4">Укажите количество товара для отгрузки по проекту</p>
          <div className="space-y-2">
            {stock.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 border border-[#E2E8F0] rounded-lg hover:border-slate-300">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-400">Доступно: {item.available.toLocaleString("ru-RU")} {item.unit}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <input type="number" min={0} max={item.available} value={qtys[item.id] || ""}
                    onChange={e => setQtys(q => ({ ...q, [item.id]: Math.min(parseInt(e.target.value)||0, item.available) }))}
                    placeholder="0"
                    className="w-20 px-2 py-1.5 text-sm border border-[#E2E8F0] rounded-md text-right focus:outline-none focus:border-[#2563EB]" />
                  <span className="text-xs text-slate-400 w-8">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-[#E2E8F0] rounded-lg hover:bg-slate-50 transition-colors">Отмена</button>
          <button onClick={handleSubmit} disabled={submitting || Object.values(qtys).every(q => !q)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#2563EB] text-white font-medium rounded-lg hover:bg-[#1d4ed8] transition-colors disabled:bg-slate-200 disabled:text-slate-400">
            {submitting ? <><Loader2 size={13} className="animate-spin" />Оформление…</> : <><Truck size={13} />Сформировать заявку</>}
          </button>
        </div>
      </div>
    </div>
  );
}
