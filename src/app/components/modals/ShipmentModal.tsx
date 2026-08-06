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
    <div className="fixed inset-0 bg-foreground/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Заявка на отгрузку</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-muted-foreground mb-4">Укажите количество товара для отгрузки по проекту</p>
          <div className="space-y-2">
            {stock.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg transition-colors hover:border-primary/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Доступно: {item.available.toLocaleString("ru-RU")} {item.unit}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <input type="number" min={0} max={item.available} value={qtys[item.id] || ""}
                    onChange={e => setQtys(q => ({ ...q, [item.id]: Math.min(parseInt(e.target.value)||0, item.available) }))}
                    placeholder="0"
                    className="w-20 px-2 py-1.5 text-sm border border-input bg-input-background rounded-md text-right focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                  <span className="text-xs text-muted-foreground w-8">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">Отмена</button>
          <button onClick={handleSubmit} disabled={submitting || Object.values(qtys).every(q => !q)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:bg-muted disabled:text-muted-foreground">
            {submitting ? <><Loader2 size={13} className="animate-spin" />Оформление…</> : <><Truck size={13} />Сформировать заявку</>}
          </button>
        </div>
      </div>
    </div>
  );
}
