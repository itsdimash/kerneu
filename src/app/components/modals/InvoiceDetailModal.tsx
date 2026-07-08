import { X, FileText, Download, AlertTriangle } from "lucide-react";
import type { Invoice } from "../../../data/invoices";
import { fmt } from "../../../lib/format";
export function InvoiceDetailModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{invoice.id}</h2>
            <p className="text-sm text-slate-500">{invoice.supplier}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
            {[["Поставщик",invoice.supplier],["Сумма факт",fmt(invoice.amount)],["Сумма план",fmt(invoice.planned)],[`Отклонение`,`+${invoice.deviation}%`],["К оплате до",invoice.dueDate],["Статус",invoice.status]].map(([l,v]) => (
              <div key={l}><dt className="text-xs text-slate-400 mb-0.5">{l}</dt><dd className={`text-sm font-medium ${l === "Отклонение" && invoice.deviation > 10 ? "text-red-600" : "text-slate-800"}`}>{v}</dd></div>
            ))}
          </div>

          {/* Deviation alert */}
          {invoice.deviation > 10 && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={14} className="text-red-500 mt-0.5" />
              <p className="text-sm text-red-700">Отклонение превышает 10%. Требуется комментарий ПМ и одобрение Комдира.</p>
            </div>
          )}

          {/* Attached file */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Приложенный файл</h3>
            <div className="flex items-center gap-3 px-4 py-3 border border-[#E2E8F0] rounded-lg">
              <FileText size={16} className="text-slate-400" />
              <div className="flex-1"><p className="text-sm text-slate-700">{invoice.id}_счёт.pdf</p><p className="text-xs text-slate-400">PDF · 142 КБ</p></div>
              <button className="flex items-center gap-1 text-xs text-[#2563EB] hover:underline"><Download size={12} />Скачать</button>
            </div>
          </div>

          {/* History */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">История</h3>
            <div className="space-y-2">
              {[
                { action: "Счёт создан",              date: "15.07.2024", who: "А. Петров (PM)" },
                { action: "Отправлен на согласование", date: "16.07.2024", who: "А. Петров (PM)" },
                invoice.status !== "pending" ? { action: invoice.status === "approved" ? "Одобрен" : invoice.status === "rejected" ? "Отклонён" : "Оплачен", date: "17.07.2024", who: "Д. Мансуров (Комдир)" } : null,
              ].filter(Boolean).map((h, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-2 flex-shrink-0" />
                  <div><p className="text-slate-700">{(h as {action:string}).action}</p><p className="text-xs text-slate-400">{(h as {date:string;who:string}).date} · {(h as {who:string}).who}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Comment */}
          {invoice.comment && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Комментарий ПМ</h3>
              <p className="text-sm text-slate-600 bg-slate-50 px-4 py-3 rounded-lg border border-[#E2E8F0] italic">{invoice.comment}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#E2E8F0] flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-[#E2E8F0] rounded-lg hover:bg-slate-50 transition-colors">Закрыть</button>
        </div>
      </div>
    </div>
  );
}
