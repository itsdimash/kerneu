import React, { useState } from "react";
import type { Role, Page, ProjectState, Receipt } from "../types";
import { StatCard } from "../app/components/common/StatCard";
import { SectionHeader } from "../app/components/common/SectionHeader";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Chip } from "../app/components/common/Chip";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import { fmt, daysFromNow, deadlineBadge, getNavAvail } from "../lib/format";
import { INVOICES_INIT } from "../data/invoices";
import { STOCK_INIT } from "../data/stock";
import { AlertTriangle, CheckCircle2, Loader2, Send, Truck, Upload } from "lucide-react";
import { KP_ITEMS_INIT } from "../data/kpItems";
import type { KPItem } from "../types";
import { Check, FileCheck, XCircle } from "lucide-react";
import { ReceiptStatusBadge } from "../app/components/common/ReceiptStatusBadge";
import type { KPItemStatus } from "../types";
import { ACTIVE_PROJECT } from "../data/projects";



export function ProjectPagePM({ onNavigate, projectState, onKpSent, receipts }: {
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  onKpSent: () => void;
  receipts: Receipt[];
}) {
  const [fileUploaded, setFileUploaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [kpItems, setKpItems] = useState<KPItem[]>([]);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(projectState.kpSent);

  const hasMissingPrice = kpItems.some(i => i.price === 0);
  const canSend = fileUploaded && !hasMissingPrice && !sent;

  const handleFileUpload = () => {
    setFileUploaded(true);
    setAnalyzing(true);
    setTimeout(() => { setAnalyzing(false); setKpItems(KP_ITEMS_INIT); }, 1800);
  };

  const updatePrice = (id: number, price: number) => {
    setKpItems(items => items.map(item =>
      item.id === id ? { ...item, price, total: price * item.qty, priceStatus: price > 0 ? "history" : "not_found" } : item
    ));
  };

  const handleSend = () => {
    if (!canSend) return;
    setSending(true);
    setTimeout(() => { setSending(false); setSent(true); onKpSent(); }, 1500);
  };

  const displayed = showOnlyMissing ? kpItems.filter(i => i.price === 0) : kpItems;
  const total = kpItems.reduce((s, i) => s + i.total, 0);

  const statusRowBg = (s: KPItemStatus) =>
    s === "found" ? "bg-green-50/40" : s === "history" ? "bg-amber-50/40" : "bg-yellow-50/60";
  const statusDot = (s: KPItemStatus) =>
    s === "found" ? "🟢" : s === "history" ? "🟡" : "🔴";
  const statusLabel = (s: KPItemStatus) =>
    s === "found" ? "Найдено" : s === "history" ? "Из истории" : "Не найдено";

  const STAGES = [
    { label: "КП",       done: true           },
    { label: "Договор",  done: projectState.kpApproved },
    { label: "Подпись",  done: projectState.contractSigned },
    { label: "Закупка",  done: false          },
    { label: "Склад",    done: false          },
    { label: "Документы",done: false          },
  ];

  return (
    <PageWrap title="Офисный комплекс «Башня»" subtitle="ООО «СтройТех» · А. Петров · 15.08.2024"
      actions={<div className="flex items-center gap-2"><Chip status="active" /><Chip status="kp" /></div>}>

      {/* Stage timeline */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 mb-6 overflow-x-auto">
        <div className="flex items-start min-w-max">
          {STAGES.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${step.done ? "bg-[#2563EB] border-[#2563EB] text-white" : i === 1 && !projectState.kpApproved ? "bg-white border-amber-400 text-amber-500" : "bg-white border-[#E2E8F0] text-slate-400"}`}>
                  {step.done ? <Check size={12} /> : i + 1}
                </div>
                <span className={`text-xs mt-1.5 ${step.done ? "text-[#2563EB]" : "text-slate-400"}`}>{step.label}</span>
              </div>
              {i < STAGES.length - 1 && <div className={`h-0.5 w-16 mx-1 mb-4 ${step.done ? "bg-[#2563EB]" : "bg-[#E2E8F0]"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          {/* File upload */}
          {!fileUploaded ? (
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Загрузить файл КП</h3>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => { e.preventDefault(); setIsDragOver(false); handleFileUpload(); }}
                onClick={handleFileUpload}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${isDragOver ? "border-[#2563EB] bg-blue-50" : "border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-blue-50/30"}`}>
                <Upload size={22} className={`mx-auto mb-2 ${isDragOver ? "text-[#2563EB]" : "text-slate-400"}`} />
                <p className="text-sm text-slate-600 mb-1">Перетащите файл или <span className="text-[#2563EB]">выберите</span></p>
                <p className="text-xs text-slate-400">PDF, XLSX, DOC до 20 МБ</p>
              </div>
            </div>
          ) : analyzing ? (
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-8 flex flex-col items-center justify-center">
              <Loader2 size={28} className="animate-spin text-[#2563EB] mb-3" />
              <p className="text-sm font-medium text-slate-700">Анализ файла…</p>
              <p className="text-xs text-slate-400 mt-1">Подбираем цены из базы данных</p>
            </div>
          ) : (
            <>
              {/* Banner */}
              {hasMissingPrice && (
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                  <AlertTriangle size={15} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-800">Цены, отсутствующие в БД, выделены жёлтым. Введите цену вручную, затем нажмите «Отправить».</p>
                </div>
              )}

              {/* Legend + filter */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>🟢 Найдено</span><span>🟡 Из истории</span><span>🔴 Не найдено</span>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={showOnlyMissing} onChange={e => setShowOnlyMissing(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#2563EB]" />
                  Показать только позиции без цены
                </label>
              </div>

              {/* KP table */}
              <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                    {["","Наименование","Кол-во","Ед.","Цена","Сумма","Статус"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {displayed.map(item => (
                      <tr key={item.id} className={`transition-colors ${statusRowBg(item.priceStatus)}`}>
                        <td className="px-4 py-3 text-base">{statusDot(item.priceStatus)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{item.name}</td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-700">{item.qty.toLocaleString("ru-RU")}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>
                        <td className="px-4 py-3">
                          {item.priceStatus === "not_found" ? (
                            <input type="number" min={0} placeholder="Ввести вручную"
                              onChange={e => updatePrice(item.id, parseFloat(e.target.value) || 0)}
                              className="w-36 px-2 py-1 text-sm border border-yellow-300 rounded bg-white focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20" />
                          ) : (
                            <span className="text-sm font-mono text-slate-900">{item.price.toLocaleString("ru-RU")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-slate-900">
                          {item.total > 0 ? item.total.toLocaleString("ru-RU") : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ring-1 ${
                            item.priceStatus === "found"     ? "bg-green-50 text-green-700 ring-green-200" :
                            item.priceStatus === "history"   ? "bg-amber-50 text-amber-700 ring-amber-200" :
                                                               "bg-yellow-50 text-yellow-700 ring-yellow-300"
                          }`}>{statusLabel(item.priceStatus)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {!showOnlyMissing && (
                    <tfoot><tr className="border-t border-[#E2E8F0] bg-slate-50/60">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900" colSpan={5}>Итого</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900 font-mono">{fmt(total)}</td>
                      <td />
                    </tr></tfoot>
                  )}
                </table>
              </div>

              {/* Send button */}
              <div className="flex items-center gap-3">
                <AppTooltip text={!canSend && !sent ? "Заполните цены для всех позиций" : ""}>
                  <button onClick={handleSend} disabled={!canSend || sending || sent}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                      sent ? "bg-green-600 text-white cursor-default" :
                      canSend && !sending ? "bg-[#2563EB] hover:bg-[#1d4ed8] text-white" :
                      "bg-slate-200 text-slate-400 cursor-not-allowed"
                    }`}>
                    {sending ? <><Loader2 size={14} className="animate-spin" />Отправка…</> :
                     sent    ? <><CheckCircle2 size={14} />КП отправлено</> :
                               <><Send size={14} />Отправить Комдиру на утверждение</>}
                  </button>
                </AppTooltip>
                {!canSend && !sent && <p className="text-xs text-slate-400">Заполните цены для всех позиций</p>}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Детали проекта</h3>
            <dl className="space-y-2.5">
              {[["Бюджет","12 500 000 ₸"],["Маржа","24.5%"],["Дедлайн","15.08.2024"],["Менеджер","А. Петров"],["Клиент","ООО «СтройТех»"],["Договор","ДГ-2024-0041"]].map(([l,v]) => (
                <div key={l} className="flex items-start justify-between gap-3">
                  <dt className="text-xs text-slate-400">{l}</dt>
                  <dd className="text-xs font-medium text-slate-700 text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Чеки по проекту — only this project's receipts */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Чеки по проекту</h3>
        {(() => {
          const mine = receipts.filter(r => r.project === ACTIVE_PROJECT.name);
          const rejected = mine.filter(r => r.status === "Отклонен").length;
          return (
            <>
              {rejected > 0 && (
                <div className="flex items-center gap-2 mb-3 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                  <span className="text-sm text-red-700">Бухгалтерия отклонила {rejected} чек(а). Проверьте документы и загрузите корректные версии.</span>
                </div>
              )}
              <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                    {["Файл чека","Дата","Сумма","Статус"].map((h,i) => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {mine.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">По этому проекту чеков пока нет</td></tr>
                    ) : mine.map(r => (
                      <tr key={r.id} className={`transition-colors ${r.status === "Отклонен" ? "bg-red-50/40 ring-1 ring-inset ring-red-200" : "hover:bg-slate-50/50"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileCheck size={14} className="text-slate-400 flex-shrink-0" />
                            <span className="text-sm text-[#2563EB] hover:underline cursor-pointer">{r.fileName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{r.uploadDate}</td>
                        <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-slate-800">{fmt(r.amount)}</td>
                        <td className="px-4 py-3"><ReceiptStatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>
    </PageWrap>
  );
}

export function ProjectPageDirector({ projectState, onKpApproved }: {
  projectState: ProjectState; onKpApproved: () => void;
}) {
  const [decision, setDecision] = useState<null | boolean>(null);
  const [deciding, setDeciding] = useState(false);

  const decide = (approve: boolean) => {
    setDeciding(true);
    setTimeout(() => { setDeciding(false); setDecision(approve); if (approve) onKpApproved(); }, 1200);
  };

  return (
    <PageWrap title="Офисный комплекс «Башня»" subtitle="ООО «СтройТех» · Проверка КП"
      actions={<div className="flex items-center gap-2"><Chip status="review" /><Chip status="kp" /></div>}>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                {["Наименование","Кол-во","Ед.","Цена","Сумма"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {KP_ITEMS_INIT.filter(i => i.price > 0).map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-700">{item.name}</td>
                    <td className="px-4 py-3 text-sm font-mono">{item.qty.toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>
                    <td className="px-4 py-3 text-sm font-mono">{item.price.toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold">{item.total.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Решение по КП</h3>
            {deciding ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin text-[#2563EB]" />Сохранение решения…</div>
            ) : decision === null ? (
              <div className="flex items-center gap-3">
                <button onClick={() => decide(true)} className="flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"><CheckCircle2 size={15} /> Одобрить КП</button>
                <button onClick={() => decide(false)} className="flex items-center gap-2 px-5 py-2.5 bg-white text-red-600 text-sm font-medium rounded-lg border border-[#E2E8F0] hover:bg-red-50 transition-colors"><XCircle size={15} /> Отклонить КП</button>
              </div>
            ) : decision ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200"><CheckCircle2 size={16} className="text-green-600" /><span className="text-sm font-medium text-green-700">КП одобрено · 17.07.2024</span></div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 rounded-lg border border-red-200"><XCircle size={16} className="text-red-600" /><span className="text-sm font-medium text-red-700">КП отклонено · 17.07.2024</span></div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Детали</h3>
            <dl className="space-y-2.5">
              {[["Сумма КП","2 760 000 ₸"],["Маржа","24.5%"],["Клиент","ООО «СтройТех»"],["PM","А. Петров"],["Дедлайн","15.08.2024"]].map(([l,v]) => (
                <div key={l} className="flex justify-between gap-3"><dt className="text-xs text-slate-400">{l}</dt><dd className="text-xs font-medium text-slate-700">{v}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

export function ProjectPageAccountant() {
  return (
    <PageWrap title="Офисный комплекс «Башня»" subtitle="ООО «СтройТех» · Счета и оплата">
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
            {["Счёт","Поставщик","Сумма","Статус",""].map(h => <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {INVOICES_INIT.slice(0,3).map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 text-xs font-mono text-slate-600">{inv.id}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{inv.supplier}</td>
                <td className="px-4 py-3 text-sm font-mono text-slate-900">{fmt(inv.amount)}</td>
                <td className="px-4 py-3"><Chip status={inv.status} /></td>
                <td className="px-4 py-3">{inv.status === "approved" && <button className="text-xs px-2.5 py-1 bg-[#16A34A] text-white rounded font-medium hover:bg-green-700 transition-colors">Оплатить</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

export function ProjectPageWarehouse() {
  return (
    <PageWrap title="Офисный комплекс «Башня»" subtitle="ООО «СтройТех» · Резерв и отгрузка">
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Резерв под проект</h3>
        <div className="space-y-2">
          {STOCK_INIT.slice(0,4).map(item => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b border-[#E2E8F0] last:border-0">
              <span className="text-sm text-slate-700">{item.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-violet-600 font-medium">{item.reserved} {item.unit} зарезервировано</span>
                <span className="text-xs text-green-600 font-medium">{item.available} доступно</span>
              </div>
            </div>
          ))}
        </div>
        <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1d4ed8] transition-colors"><Truck size={14} /> Оформить отгрузку</button>
      </div>
    </PageWrap>
  );
}

export function ProjectPage({ role, onNavigate, projectState, onKpSent, onKpApproved, receipts }: {
  role: Role; onNavigate: (p: Page) => void; projectState: ProjectState;
  onKpSent: () => void; onKpApproved: () => void; receipts: Receipt[];
}) {
  if (role === "pm")        return <ProjectPagePM onNavigate={onNavigate} projectState={projectState} onKpSent={onKpSent} receipts={receipts} />;
  if (role === "director")  return <ProjectPageDirector projectState={projectState} onKpApproved={onKpApproved} />;
  if (role === "accountant")return <ProjectPageAccountant />;
  return <ProjectPageWarehouse />;
}