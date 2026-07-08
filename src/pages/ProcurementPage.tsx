import { useState } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Tooltip } from "../app/components/common/Tooltip";
import { StatCard } from "../app/components/common/StatCard";
import { Chip } from "../app/components/common/Chip";
import { InvoiceDetailModal } from "../app/components/modals/InvoiceDetailModal";
import { fmt } from "../lib/format";
import { Invoice, INVOICES_INIT } from "../data/invoices";
import type { Role, ProjectState,  BannerVariant } from "../types";
import { Plus, ClipboardList, DollarSign, Clock, XCircle, Loader2, Check, Edit3, Trash2, Eye, AlertTriangle, X } from "lucide-react";
export function ProcurementPage({ role, projectState }: { role: Role; projectState: ProjectState }) {
  const [invoices, setInvoices] = useState(INVOICES_INIT);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const THRESHOLD = 10;
  const actionsLocked = !projectState.contractSigned;

  const updateStatus = (id: string, status: string) => {
    setLoadingId(id);
    setTimeout(() => {
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
      setLoadingId(null);
    }, 900);
  };

  const procBanner: { variant: BannerVariant; text: string } = actionsLocked
    ? { variant: "neutral", text: "Раздел «Закупки» доступен только для просмотра. Для создания и согласования счетов необходимо подписать договор с клиентом." }
    : { variant: "success", text: "Договор подписан. Вы можете создавать счета и отправлять их на согласование." };

  return (
    <PageWrap title="Закупки" subtitle="Управление счетами и согласование"
      actions={role === "pm" ? (
        <Tooltip text={actionsLocked ? "Доступно после подписания договора" : ""}>
          <button disabled={actionsLocked}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${actionsLocked ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"}`}>
            <Plus size={14} /> Добавить счёт
          </button>
        </Tooltip>
      ) : undefined}>

      {selectedInvoice && <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}

      <InfoBanner variant={procBanner.variant} text={procBanner.text} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Всего счетов" value={String(invoices.length)} sub="По проекту" icon={ClipboardList} />
        <StatCard label="Ожидают оплаты" value={fmt(invoices.filter(i => i.status==="approved").reduce((s,i)=>s+i.amount,0))} sub="Одобрены" icon={DollarSign} iconColor="text-green-500" iconBg="bg-green-50" />
        <StatCard label="На согласовании" value={String(invoices.filter(i=>i.status==="pending").length)} sub="Ожидают решения" icon={Clock} iconColor="text-amber-500" iconBg="bg-amber-50" />
        <StatCard label="Отклонено" value={String(invoices.filter(i=>i.status==="rejected").length)} sub="Нужна корректировка" icon={XCircle} iconColor="text-red-500" iconBg="bg-red-50" />
      </div>

      {invoices.some(i => i.deviation > THRESHOLD && i.status === "pending") && (
        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200 mb-5">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Счета с превышением порогового отклонения ({THRESHOLD}%)</p>
            <p className="text-xs text-red-600 mt-0.5">Счета с отклонением свыше {THRESHOLD}% требуют обязательного комментария ПМ и одобрения Комдира.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
            {["№ Счёта","Поставщик","Сумма факт","Сумма план","Откл. %","К оплате до","Статус","Комментарий ПМ","Действие"].map(h => (
              <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {invoices.map(inv => {
              const highDev = inv.deviation > THRESHOLD;
              const comment = comments[inv.id] || "";
              const needsComment = highDev && inv.status === "pending" && !comment;
              const isLoading = loadingId === inv.id;

              return (
                <tr key={inv.id}
                  className={`transition-colors cursor-pointer ${highDev && inv.status === "pending" ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/50"}`}
                  onClick={() => setSelectedInvoice(inv)}>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{inv.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{inv.supplier}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-900">{fmt(inv.amount)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{fmt(inv.planned)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${highDev ? "bg-red-100 text-red-700" : inv.deviation > 5 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>+{inv.deviation}%</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{inv.dueDate}</td>
                  <td className="px-4 py-3"><Chip status={inv.status} /></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {inv.comment ? (
                      <span className="text-xs text-slate-600 italic">{inv.comment}</span>
                    ) : role === "pm" && inv.status === "pending" ? (
                      <input value={comment} onChange={e => setComments(c => ({ ...c, [inv.id]: e.target.value }))}
                        placeholder={highDev ? "Обязателен *" : "Комментарий…"}
                        className={`text-xs px-2 py-1 border rounded w-40 focus:outline-none focus:border-[#2563EB] ${needsComment ? "border-red-300 bg-red-50/30 placeholder-red-400" : "border-[#E2E8F0]"}`} />
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      {isLoading ? (
                        <Loader2 size={14} className="animate-spin text-[#2563EB]" />
                      ) : (
                        <>
                          {role === "director" && inv.status === "pending" && (
                            <>
                              <button onClick={() => updateStatus(inv.id, "approved")} className="w-7 h-7 flex items-center justify-center rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors" title="Одобрить"><Check size={12} /></button>
                              <button onClick={() => updateStatus(inv.id, "rejected")} className="w-7 h-7 flex items-center justify-center rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors" title="Отклонить"><X size={12} /></button>
                            </>
                          )}
                          {role === "pm" && inv.status === "pending" && (
                            <>
                              <Tooltip text={actionsLocked ? "Доступно после подписания договора" : needsComment ? "Заполните комментарий ПМ" : ""}>
                                <button disabled={needsComment || actionsLocked}
                                  onClick={() => !needsComment && !actionsLocked && updateStatus(inv.id, "approved")}
                                  className={`text-xs px-2.5 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${(needsComment || actionsLocked) ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"}`}>
                                  Отправить
                                </button>
                              </Tooltip>
                              <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Редактировать"><Edit3 size={12} /></button>
                              <button onClick={() => updateStatus(inv.id, "rejected")} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Отменить"><Trash2 size={12} /></button>
                            </>
                          )}
                          {role === "accountant" && inv.status === "approved" && (
                            <button onClick={() => updateStatus(inv.id, "paid")} className="text-xs px-2.5 py-1.5 bg-[#16A34A] text-white rounded font-medium hover:bg-green-700 transition-colors">Оплатить</button>
                          )}
                          {(role === "warehouse" || (role !== "pm" && role !== "director" && role !== "accountant")) && (
                            <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400"><Eye size={12} /></button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">Нажмите на строку счёта для просмотра деталей</p>
    </PageWrap>
  );
}
