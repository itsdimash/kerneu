import { X, FileText, Download, AlertTriangle } from "lucide-react";
import type { Invoice } from "../../../data/invoices";
import { fmt } from "../../../lib/format";

const STATUS_PILL_CLS: Record<string, string> = {
  pending: "bg-warning-muted text-warning ring-1 ring-warning/25",
  approved: "bg-success-muted text-success ring-1 ring-success/25",
  rejected: "bg-destructive-muted text-destructive ring-1 ring-destructive/20",
  paid: "bg-info-muted text-info ring-1 ring-info/25",
};

export function InvoiceDetailModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-foreground/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">{invoice.id}</h2>
            <p className="text-sm text-muted-foreground">{invoice.supplier}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            {[["Поставщик",invoice.supplier],["Сумма факт",fmt(invoice.amount)],["Сумма план",fmt(invoice.planned)],[`Отклонение`,`+${invoice.deviation}%`],["К оплате до",invoice.dueDate],["Статус",invoice.status]].map(([l,v]) => (
              <div key={l}>
                <dt className="text-xs text-muted-foreground mb-0.5">{l}</dt>
                {l === "Статус" ? (
                  <dd>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_PILL_CLS[v] ?? "bg-muted text-muted-foreground ring-1 ring-border"}`}>
                      {v}
                    </span>
                  </dd>
                ) : (
                  <dd className={`text-sm font-medium ${l === "Отклонение" && invoice.deviation > 10 ? "text-destructive" : "text-foreground"}`}>{v}</dd>
                )}
              </div>
            ))}
          </div>

          {/* Deviation alert */}
          {invoice.deviation > 10 && (
            <div className="flex items-start gap-2.5 p-3 bg-destructive-muted border border-destructive/20 rounded-lg">
              <AlertTriangle size={14} className="text-destructive mt-0.5" />
              <p className="text-sm text-destructive">Отклонение превышает 10%. Требуется комментарий ПМ и одобрение Комдира.</p>
            </div>
          )}

          {/* Attached file */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Приложенный файл</h3>
            <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg">
              <FileText size={16} className="text-muted-foreground" />
              <div className="flex-1"><p className="text-sm text-foreground/80">{invoice.id}_счёт.pdf</p><p className="text-xs text-muted-foreground">PDF · 142 КБ</p></div>
              <button className="flex items-center gap-1 text-xs text-primary hover:underline"><Download size={12} />Скачать</button>
            </div>
          </div>

          {/* History */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">История</h3>
            <div className="space-y-2">
              {[
                { action: "Счёт создан",              date: "15.07.2024", who: "А. Петров (PM)" },
                { action: "Отправлен на согласование", date: "16.07.2024", who: "А. Петров (PM)" },
                invoice.status !== "pending" ? { action: invoice.status === "approved" ? "Одобрен" : invoice.status === "rejected" ? "Отклонён" : "Оплачен", date: "17.07.2024", who: "Д. Мансуров (Комдир)" } : null,
              ].filter(Boolean).map((h, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <div><p className="text-foreground/80">{(h as {action:string}).action}</p><p className="text-xs text-muted-foreground">{(h as {date:string;who:string}).date} · {(h as {who:string}).who}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Comment */}
          {invoice.comment && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Комментарий ПМ</h3>
              <p className="text-sm text-foreground/80 bg-muted px-4 py-3 rounded-lg border border-border italic">{invoice.comment}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">Закрыть</button>
        </div>
      </div>
    </div>
  );
}
