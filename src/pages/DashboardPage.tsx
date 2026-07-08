import React from "react";
import type { Role, Page, Receipt } from "../types";
import { StatCard } from "../app/components/common/StatCard";
import { SectionHeader } from "../app/components/common/SectionHeader";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Chip } from "../app/components/common/Chip";
import { ReceiptStatusBadge } from "../app/components/common/ReceiptStatusBadge";
import { fmt, daysFromNow, deadlineBadge } from "../lib/format";
import { PROJECTS } from "../data/projects";
import { Plus, FolderOpen, Send, TrendingUp, AlertTriangle, Inbox, BarChart2, Clock, Check, X, CheckCircle2, XCircle, ChevronRight, MoreHorizontal } from "lucide-react";
import type { ContractStatus } from "../types";
import { Archive, Package, Truck, DollarSign } from "lucide-react";
import { STOCK_INIT } from "../data/stock";
import { INVOICES_INIT } from "../data/invoices";

export function DashboardPM({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const contractIcon = (s: ContractStatus) => s === "unsigned" ? "🔒" : s === "pending" ? "⏳" : "🔓";

  return (
    <PageWrap title="Дашборд PM" subtitle="Управление проектами и коммерческими предложениями"
      actions={<button className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1d4ed8] transition-colors"><Plus size={14} /> Новое КП</button>}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Активных проектов" value="12" sub="3 близко к дедлайну" delta="+2 за месяц" icon={FolderOpen} />
        <StatCard label="КП на отправке" value="4" sub="Ожидают согласования" icon={Send} iconColor="text-amber-500" iconBg="bg-amber-50" />
        <StatCard label="Выручка (план)" value="54.5 млн ₸" sub="Июль 2024" delta="+18%" icon={TrendingUp} iconColor="text-green-500" iconBg="bg-green-50" />
        <StatCard label="Просрочено задач" value="2" sub="Требуют внимания" icon={AlertTriangle} iconColor="text-red-500" iconBg="bg-red-50" />
      </div>

      <SectionHeader title="Проекты" action={
        <button className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Все проекты <ChevronRight size={12} /></button>
      } />
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden mb-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
              {["Проект", "Клиент", "Статус", "Этап", "Бюджет", "Дедлайн", "Ответственный", "Менеджер", ""].map(h => (
                <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {PROJECTS.map(p => {
              const days = daysFromNow(p.deadline);
              return (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span title={p.contractStatus === "unsigned" ? "Не подписан" : p.contractStatus === "pending" ? "Ожидает подписи" : "Подписан"}>
                        {contractIcon(p.contractStatus)}
                      </span>
                      <button onClick={() => onNavigate("project")} className="text-sm font-medium text-[#2563EB] hover:underline text-left">
                        {p.name}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{p.client}</td>
                  <td className="px-4 py-3"><Chip status={p.status} /></td>
                  <td className="px-4 py-3"><Chip status={p.stage} /></td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-mono text-right">{fmt(p.budget)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${deadlineBadge(p.deadline)}`}>
                      {p.deadline}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{p.responsible}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{p.manager}</td>
                  <td className="px-4 py-3">
                    <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400"><MoreHorizontal size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Ближайшие дедлайны</h3>
          <div className="space-y-3">
            {[
              { name: "Реконструкция склада Nord",      deadline: "30.07.2024" },
              { name: "Офисный комплекс «Башня»",       deadline: "15.08.2024" },
              { name: "Торговый центр «Меридиан»",      deadline: "01.09.2024" },
            ].map(item => {
              const d = daysFromNow(item.deadline);
              const color = d <= 7 ? "text-red-600 font-bold" : d <= 14 ? "text-orange-600 font-semibold" : "text-green-600 font-medium";
              return (
                <div key={item.name} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-700">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.deadline}</p>
                  </div>
                  <span className={`text-xs ${color}`}>{d > 0 ? `${d}д` : "Просрочен"}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Активность</h3>
          <div className="space-y-3">
            {[
              { text: "КП отправлено клиенту ООО «СтройТех»",      time: "2 дня назад" },
              { text: "Новый счёт на согласование СФ-2024-0146",    time: "4 дня назад" },
              { text: "Договор подписан: склад Nord",               time: "Вчера" },
              { text: "Отгрузка ОТГ-0018 подтверждена",            time: "1 день назад" },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-2 flex-shrink-0" />
                <div><p className="text-sm text-slate-700">{a.text}</p><p className="text-xs text-slate-400">{a.time}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

export function DashboardDirector({ onNavigate, receipts }: { onNavigate: (p: Page) => void; receipts: Receipt[] }) {
  return (
    <PageWrap title="Дашборд Комдира" subtitle="Проекты на утверждение, маржа и дедлайны">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="На утверждении" value="3 КП" sub="Ожидают решения" icon={Inbox} iconColor="text-amber-500" iconBg="bg-amber-50" />
        <StatCard label="Средняя маржа" value="24.1%" sub="по портфелю" delta="+2.3% vs план" icon={BarChart2} iconColor="text-blue-500" iconBg="bg-blue-50" />
        <StatCard label="Выручка (факт)" value="38.2 млн ₸" sub="Июль 2024" delta="+12%" icon={TrendingUp} iconColor="text-green-500" iconBg="bg-green-50" />
        <StatCard label="Критичных дедлайнов" value="2" sub="Риск срыва" icon={AlertTriangle} iconColor="text-red-500" iconBg="bg-red-50" />
      </div>
      <SectionHeader title="КП на согласование" />
      <div className="space-y-3 mb-6">
        {[
          { name: "Офисный комплекс «Башня»",  client: "ООО «СтройТех»",  amount: 12500000, margin: 24.5, deadline: "15.08.2024", manager: "А. Петров" },
          { name: "Торговый центр «Меридиан»", client: "ГК «Меридиан»",   amount: 28000000, margin: 31.0, deadline: "01.09.2024", manager: "И. Волков" },
          { name: "Реконструкция склада Nord", client: "АО «МегаБилд»",   amount: 4800000,  margin: 18.2, deadline: "30.07.2024", manager: "М. Козлова" },
        ].map((kp, i) => (
          <div key={i} className="bg-white rounded-lg border border-[#E2E8F0] p-5 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => onNavigate("project")} className="text-sm font-semibold text-[#2563EB] hover:underline">{kp.name}</button>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ring-1 ${kp.margin >= 25 ? "bg-green-50 text-green-700 ring-green-200" : kp.margin >= 20 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200"}`}>{kp.margin}% маржа</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>{kp.client}</span><span>·</span><span>{fmt(kp.amount)}</span><span>·</span>
                <span className="flex items-center gap-1"><Clock size={11} />{kp.deadline}</span><span>·</span><span>PM: {kp.manager}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-6">
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#16A34A] text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors"><Check size={12} /> Одобрить</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 text-xs font-medium rounded-md border border-[#E2E8F0] hover:bg-red-50 transition-colors"><X size={12} /> Отклонить</button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {PROJECTS.map(p => (
          <div key={p.id} className="bg-white rounded-lg border border-[#E2E8F0] p-4">
            <div className="flex items-start justify-between mb-2"><p className="text-sm font-medium text-slate-900 leading-tight">{p.name}</p><Chip status={p.stage} /></div>
            <p className="text-xs text-slate-500 mb-3">{p.client}</p>
            <div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-500">Маржа</span><span className={`font-semibold ${p.margin >= 25 ? "text-green-600" : p.margin >= 20 ? "text-amber-600" : "text-red-600"}`}>{p.margin}%</span></div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3"><div className={`h-1.5 rounded-full ${p.margin >= 25 ? "bg-green-500" : p.margin >= 20 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(p.margin * 2, 100)}%` }} /></div>
            <div className="flex items-center gap-1 text-xs text-slate-400"><Clock size={10} />{p.deadline}</div>
          </div>
        ))}
      </div>

      {/* ── Receipt analytics (Хранилище чеков) ── */}
      {(() => {
        const verified = receipts.filter(r => r.status === "Проверен");
        const processing = receipts.filter(r => r.status === "В обработке");
        const rejected = receipts.filter(r => r.status === "Отклонен");
        const sum = (arr: Receipt[]) => arr.reduce((s, r) => s + r.amount, 0);
        return (
          <div className="mt-8">
            <SectionHeader title="Финансовые чеки — аналитика" />
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={15} className="text-green-500" /><p className="text-xs font-medium text-slate-500">Подтверждено чеками</p></div>
                <p className="text-xl font-semibold text-slate-900">{fmt(sum(verified))}</p>
                <p className="text-xs text-slate-400 mt-0.5">{verified.length} чек(ов) «Проверен»</p>
              </div>
              <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                <div className="flex items-center gap-2 mb-2"><Clock size={15} className="text-amber-500" /><p className="text-xs font-medium text-slate-500">В обработке</p></div>
                <p className="text-xl font-semibold text-slate-900">{fmt(sum(processing))}</p>
                <p className="text-xs text-slate-400 mt-0.5">{processing.length} чек(ов) ожидают проверки</p>
              </div>
              <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                <div className="flex items-center gap-2 mb-2"><XCircle size={15} className="text-red-500" /><p className="text-xs font-medium text-slate-500">Отклонено</p></div>
                <p className="text-xl font-semibold text-slate-900">{fmt(sum(rejected))}</p>
                <p className="text-xs text-slate-400 mt-0.5">{rejected.length} чек(ов) «Отклонен»</p>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#E2E8F0] bg-slate-50/60 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Все чеки компании · только просмотр</span>
                <span className="text-xs text-slate-400">{receipts.length} записей</span>
              </div>
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-[#E2E8F0]">
                  {["Проект","Файл","Загрузил","Сумма","Статус"].map((h,i) => (
                    <th key={h} className={`px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {receipts.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-800">{r.project}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.fileName}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{r.uploadedBy}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-mono font-semibold text-slate-800">{fmt(r.amount)}</span>
                        {r.amount > 1_000_000 && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded ring-1 ring-orange-200 align-middle"><AlertTriangle size={10} /> Крупная сумма</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><ReceiptStatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </PageWrap>
  );
}

export function DashboardAccountant({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <PageWrap title="Дашборд Бухгалтера" subtitle="Счета к оплате и статус платежей">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="К оплате" value="5.54 млн ₸" sub="3 счёта ожидают" icon={DollarSign} iconColor="text-blue-500" iconBg="bg-blue-50" />
        <StatCard label="Оплачено за месяц" value="12.3 млн ₸" sub="Июль 2024" delta="+8%" icon={CheckCircle2} iconColor="text-green-500" iconBg="bg-green-50" />
        <StatCard label="Просрочено" value="1 счёт" sub="675 000 ₸" icon={XCircle} iconColor="text-red-500" iconBg="bg-red-50" />
        <StatCard label="На согласовании" value="2 счёта" sub="Ожидают Комдира" icon={Clock} iconColor="text-amber-500" iconBg="bg-amber-50" />
      </div>
      <SectionHeader title="Счета к оплате" action={<button onClick={() => onNavigate("procurement")} className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Все счета <ChevronRight size={12} /></button>} />
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
            {["Номер счёта","Поставщик","Сумма","К оплате до","Статус",""].map((h,i) => (
              <th key={i} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {INVOICES_INIT.map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-slate-700">{inv.id}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{inv.supplier}</td>
                <td className="px-4 py-3 text-sm font-mono text-slate-900">{fmt(inv.amount)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{inv.dueDate}</td>
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

export function DashboardWarehouse({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <PageWrap title="Дашборд Склада" subtitle="Остатки, резерв и отгрузки"
      actions={<button className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1d4ed8] transition-colors"><Plus size={14} /> Новый приход</button>}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Позиций на складе" value="142" sub="6 ниже минимума" icon={Archive} iconColor="text-blue-500" iconBg="bg-blue-50" />
        <StatCard label="В резерве" value="34 позиции" sub="4 проекта" icon={Package} iconColor="text-violet-500" iconBg="bg-violet-50" />
        <StatCard label="Отгрузок за неделю" value="8" sub="12 позиций" delta="+3 vs пред.неделя" icon={Truck} iconColor="text-green-500" iconBg="bg-green-50" />
        <StatCard label="Ожидаемых поставок" value="3" sub="На этой неделе" icon={Clock} iconColor="text-amber-500" iconBg="bg-amber-50" />
      </div>
      <SectionHeader title="Остатки товара" action={<button onClick={() => onNavigate("warehouse")} className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Полный склад <ChevronRight size={12} /></button>} />
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
            {["Артикул","Наименование","Ед.","Всего","Резерв","Доступно"].map((h,i) => (
              <th key={h} className={`px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {STOCK_INIT.map(item => (
              <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${item.available < 200 ? "bg-red-50/20" : ""}`}>
                <td className="px-4 py-3 text-xs font-mono text-slate-500">{item.sku}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{item.name}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>
                <td className="px-4 py-3 text-sm font-mono text-slate-700 text-right">{item.total.toLocaleString("ru-RU")}</td>
                <td className="px-4 py-3 text-sm font-mono text-violet-600 text-right">{item.reserved.toLocaleString("ru-RU")}</td>
                <td className="px-4 py-3 text-right"><span className={`text-sm font-mono font-medium ${item.available < 200 ? "text-red-600" : "text-green-600"}`}>{item.available.toLocaleString("ru-RU")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

export function DashboardPage({ role, onNavigate, receipts }: { role: Role; onNavigate: (p: Page) => void; receipts: Receipt[] }) {
  if (role === "pm")        return <DashboardPM onNavigate={onNavigate} />;
  if (role === "director")  return <DashboardDirector onNavigate={onNavigate} receipts={receipts} />;
  if (role === "accountant")return <DashboardAccountant onNavigate={onNavigate} />;
  return <DashboardWarehouse onNavigate={onNavigate} />;
}