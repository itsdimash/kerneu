import React, { useState, useEffect } from "react";
import type { Role, Page, Receipt, ContractStatus } from "../types";
import { StatCard } from "../app/components/common/StatCard";
import { SectionHeader } from "../app/components/common/SectionHeader";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Chip } from "../app/components/common/Chip";
import { ReceiptStatusBadge } from "../app/components/common/ReceiptStatusBadge";
import { fmt, daysFromNow, deadlineBadge } from "../lib/format";
import { PROJECTS } from "../data/projects";
import { STOCK_INIT } from "../data/stock";
import { INVOICES_INIT } from "../data/invoices";
import {
  Plus, FolderOpen, Send, TrendingUp, AlertTriangle, Inbox, BarChart2, 
  Clock, Check, X, CheckCircle2, XCircle, ChevronRight, MoreHorizontal,
  Archive, Package, Truck, DollarSign, UploadCloud, FileText, Trash2, Loader2
} from "lucide-react";

// Тип клиента, который приходит с бэкенда: только id и name используются для отображения
type ClientDTO = {
  id: number;
  client_name: string;
  [key: string]: unknown; // бэкенд может присылать и другие поля — они нам не нужны
};

export function DashboardPM({ onNavigate }: { onNavigate: (p: Page) => void }) {
  // Стейты для модального окна
  const [isKpModalOpen, setIsKpModalOpen] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newClientForm, setNewClientForm] = useState({ name: "", email: "", phone: "" });

  // Клиенты приходят с бэкенда: {id, name, ...}. Отображаем только name, id храним для сохранения.
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);


  // Файл КП, прикреплённый пользователем
  const [kpFile, setKpFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    loadProjects();
}, []);
  useEffect(() => {
    if (!isKpModalOpen) return;

    let cancelled = false;
    setClientsLoading(true);
    setClientsError(null);

    fetch("http://localhost:8000/api/v1/clients/clients/select")
      .then((res) => {
        if (!res.ok) throw new Error(`Ошибка загрузки клиентов: ${res.status}`);
        return res.json();
      })
      .then((data: ClientDTO[]) => {
        if (!cancelled) setClients(data);
      })
      .catch((err) => {
        if (!cancelled) setClientsError(err.message ?? "Не удалось загрузить клиентов");
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isKpModalOpen]);
const loadProjects = async () => {
    try {
        const response = await fetch(
            "http://localhost:8000/api/v1/projects/",
            {
                credentials: "include",
            }
        );

        const data = await response.json();

        setProjects(data);

    } catch (e) {
        console.error(e);
    }
};
  const selectedClientData = clients.find((c) => c.id === Number(selectedClientId));
  const contractIcon = (s: ContractStatus) => s === "unsigned" ? "🔒" : s === "pending" ? "⏳" : "🔓";
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  // Клиент "выбран", когда либо указан существующий клиент, либо введено имя нового
  const isClientChosen = isNewClient ? newClientForm.name.trim().length > 0 : !!selectedClientId;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setKpFile(f);
  };

  const resetModal = () => {
    setIsKpModalOpen(false);
    setIsNewClient(false);
    setSelectedClientId("");
    setNewClientForm({ name: "", email: "", phone: "" });
    setKpFile(null);
  };

 const handleSave = async () => {
    try {
        setIsSaving(true);

        if (!kpFile) {
            alert("Выберите файл КП");
            return;
        }

        const uploadedFileUrl = `/uploads/${kpFile.name}`;

        const payload = isNewClient
            ? {
                  is_new_client: true,
                  new_client_name: newClientForm.name,
                  new_client_phone: newClientForm.phone,
                  new_client_email: newClientForm.email,

                  invoice_amount: 0,
                  invoice_status_id: 1,
                  file_url: uploadedFileUrl,

                  project_status_id: 1,
                  planned_margin: 0,
                  deadline: "2026-08-01",
              }
            : {
                  is_new_client: false,
                  client_id: Number(selectedClientId),

                  invoice_amount: 0,
                  invoice_status_id: 1,
                  file_url: uploadedFileUrl,

                  project_status_id: 1,
                  pm_id: 1,
                  planned_margin: 0,
                  deadline: "2026-08-01",
              };

        // Создание проекта
        const response = await fetch(
            "http://localhost:8000/api/v1/projects/create-base",
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();
        const projectId = data.project_id;

        // Запуск парсера
        // Запуск парсера
const formData = new FormData();
formData.append("file", kpFile);

const parserResponse = await fetch(
    `http://localhost:8000/api/v1/parser/projects/${projectId}/parse`,
    {
        method: "POST",
        credentials: "include",
        body: formData,
    }
);

if (!parserResponse.ok) {
    throw new Error("Ошибка парсинга");
}

// Получаем Excel от парсера
const parserBlob = await parserResponse.blob();
// Создаем File для ML
const parserFile = new File(
    [parserBlob],
    "quotation.xlsx",
    {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
);
// Отправляем Excel в ML
const mlForm = new FormData();
mlForm.append("file", parserFile);

const mlResponse = await fetch(
    "http://localhost:8000/api/v1/match-file",
    {
        method: "POST",
        credentials: "include",
        body: mlForm,
    }
);

if (!mlResponse.ok) {
    console.log(await mlResponse.json());
    throw new Error("Ошибка ML");
}

// Получаем итоговый Excel после ML
const finalBlob = await mlResponse.blob();

const url = window.URL.createObjectURL(finalBlob);

            const a = document.createElement("a");
            a.href = url;
            a.download = "Коммерческое_предложение.xlsx";
            a.click();

            window.URL.revokeObjectURL(url);
        // Обновляем список проектов
        await loadProjects();

        console.log("Проект создан:", projectId);

        alert("Проект успешно создан!");

        resetModal();

    } catch (error) {
        console.error(error);
        alert("Ошибка создания проекта");
    } finally {
        setIsSaving(false);
    }
};
const handleDelete = async (projectId: number) => {
    if (!window.confirm("Вы действительно хотите удалить проект?")) {
        return;
    }

    try {
        const response = await fetch(
            `http://localhost:8000/api/v1/projects/${projectId}`,
            {
                method: "DELETE",
                credentials: "include",
            }
        );

        if (!response.ok) {
            throw new Error(`Ошибка ${response.status}`);
        }

        setOpenMenu(null);

        await loadProjects();

    } catch (error) {
        console.error(error);
        alert("Ошибка удаления");
    }
};
  return (
    <PageWrap 
      title="Дашборд PM" 
      subtitle="Управление проектами и коммерческими предложениями"
      actions={
        <button 
          onClick={() => setIsKpModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1d4ed8] transition-colors"
        >
          <Plus size={14} /> Новый проект 
        </button>
      }
    >
      {/* ── Модальное окно «Новое КП» ── */}
      {isKpModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col relative">

            {/* ── Оверлей загрузки: парсинг + сопоставление товаров ── */}
            {isSaving && (
              <div className="absolute inset-0 z-10 bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-xl px-6 text-center">
                <Loader2 size={28} className="text-[#2563EB] animate-spin" />
                <p className="text-sm font-medium text-slate-800">Обработка файла...</p>
                <p className="text-xs text-slate-500">Парсим документ и сопоставляем товары. Это может занять до пары минут — не закрывайте окно.</p>
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] bg-slate-50 flex-shrink-0">
              <h3 className="font-semibold text-slate-800">Создание нового КП</h3>
              <button
                onClick={resetModal}
                disabled={isSaving}
                className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              <label className="flex items-center gap-2.5 cursor-pointer w-max">
                <input
                  type="checkbox"
                  checked={isNewClient}
                  onChange={(e) => setIsNewClient(e.target.checked)}
                  className="w-4 h-4 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                />
                <span className="text-sm font-medium text-slate-700">Новый клиент</span>
              </label>

              <div className="h-px w-full bg-slate-100" />

              {isNewClient ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">ФИО / Название компании</label>
                    <input
                      type="text"
                      value={newClientForm.name}
                      onChange={(e) => setNewClientForm({...newClientForm, name: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                      placeholder="Например, ООО «Инновации»"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={newClientForm.email}
                      onChange={(e) => setNewClientForm({...newClientForm, email: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                      placeholder="client@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Номер телефона</label>
                    <input
                      type="tel"
                      value={newClientForm.phone}
                      onChange={(e) => setNewClientForm({...newClientForm, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                      placeholder="+7 (___) ___-__-__"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Выберите клиента</label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      disabled={clientsLoading || !!clientsError}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] bg-white disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="" disabled>
                        {clientsLoading ? "Загрузка клиентов..." : "-- Выберите из списка --"}
                      </option>
                      {/* С бэкенда приходят id и name — отображаем только name, id используем как value */}
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.client_name}</option>
                      ))}
                    </select>
                    {clientsError && (
                      <p className="text-xs text-red-600 mt-1.5">{clientsError}</p>
                    )}
                  </div>

                  {selectedClientData && (
                    <div className="bg-slate-50/80 p-4 rounded-lg border border-[#E2E8F0] space-y-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Клиент:</span>
                        <span className="text-sm font-medium text-slate-900">{selectedClientData.client_name}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Загрузка файла КП: показывается только после выбора клиента ── */}
              {isClientChosen && (
              <>
              <div className="h-px w-full bg-slate-100" />

              <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Файл КП</label>
                {!kpFile ? (
                  <label
                    htmlFor="kp-file-upload"
                    className="flex flex-col items-center justify-center gap-1.5 w-full py-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-[#2563EB] hover:bg-blue-50/30 transition-colors"
                  >
                    <UploadCloud size={20} className="text-slate-400" />
                    <span className="text-sm text-slate-600">Нажмите, чтобы выбрать файл</span>
                    <span className="text-xs text-slate-400">PDF, DOCX, XLSX до 10 МБ</span>
                    <input
                      id="kp-file-upload"
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-[#E2E8F0] rounded-lg bg-slate-50/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-[#2563EB] flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{kpFile.name}</p>
                        <p className="text-xs text-slate-400">{(kpFile.size / 1024).toFixed(0)} КБ</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setKpFile(null)}
                      className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Удалить файл"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-[#E2E8F0] bg-slate-50 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={resetModal}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-[#E2E8F0] rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Назад
              </button>
              <button
                onClick={handleSave}
                disabled={!isClientChosen || isSaving}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[112px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Дашборд PM контент ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Активных проектов" value="4" sub="3 близко к дедлайну" delta="+2 за месяц" icon={FolderOpen} />
        <StatCard label="КП на отправке" value="4" sub="Ожидают согласования" icon={Send} iconColor="text-amber-500" iconBg="bg-amber-50" />
        <StatCard label="Выручка (план)" value="54.5 млн ₸" sub="Июль 2024" delta="+18%" icon={TrendingUp} iconColor="text-green-500" iconBg="bg-green-50" />
        <StatCard label="Просрочено задач" value="2" sub="Требуют внимания" icon={AlertTriangle} iconColor="text-red-500" iconBg="bg-red-50" />
      </div>

      <SectionHeader title="Проекты" action={
        <button className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Все проекты <ChevronRight size={12} /></button>
      } />
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-visible mb-6">
          <table className="w-full border-collapse">
              <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                  {["Проект", "Клиент", "Статус", "Этап", "Бюджет", "Дедлайн", "Ответственный", "Менеджер", ""].map(h => (
                      <th key={h}
                          className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
                  ))}
              </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
              {projects.map((p: any) => {
                  return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">

                          {/* Проект */}
                          <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">

                                  {/* Пока заглушка, пока нет contractStatus */}
                                  {contractIcon("signed")}

                                  <button
                                      onClick={() => onNavigate("project")}
                                      className="text-sm font-medium text-[#2563EB] hover:underline text-left"
                                  >
                                      {p.name ?? `Проект №${p.id}`}
                                  </button>

                              </div>
                          </td>

                          {/* Клиент */}
                          <td className="px-4 py-3 text-sm text-slate-600">
                              {p.client?.client_name}
                          </td>

                          {/* Статус */}
                          <td className="px-4 py-3">
                              <Chip status={p.status?.status_name}/>
                          </td>

                          {/* Этап */}
                          <td className="px-4 py-3">
                              —
                          </td>

                          {/* Бюджет */}
                          <td className="px-4 py-3 text-sm text-slate-700 font-mono text-right">
                              {fmt(Number(p.invoice?.amount ?? 0))}
                          </td>

                          {/* Дедлайн */}
                          <td className="px-4 py-3">
          <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${deadlineBadge(
                  p.deadline
              )}`}
          >
            {new Date(p.deadline).toLocaleDateString("ru-RU")}
          </span>
                          </td>

                          {/* Ответственный */}
                          <td className="px-4 py-3">
          <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
            {p.pm?.name}
          </span>
                          </td>

                          {/* Менеджер */}
                          <td className="px-4 py-3 text-sm text-slate-600">
                              {p.pm?.name}
                          </td>

                          <td className="px-4 py-3 relative">
                              <button
                                  onClick={() =>
                                      setOpenMenu(openMenu === p.id ? null : p.id)
                                  }
                                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400"
                              >
                                  <MoreHorizontal size={14}/>
                              </button>

                              {openMenu === p.id && (
                                  <div
                                      className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl z-50">
                                      <button
                                          onClick={() => {
                                              setOpenMenu(null);
                                              // открыть проект
                                          }}
                                          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                                      >
                                          <FolderOpen size={18} className="text-amber-500"/>
                                          Открыть проект
                                      </button>

                                      <div className="h-px bg-slate-100"/>

                                      <button
                                          onClick={() => handleDelete(p.id)}
                                          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                      >
                                          <Trash2 size={19}/>
                                          Удалить
                                      </button>
                                  </div>
                              )}
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
                        {name: "Реконструкция склада Nord", deadline: "30.07.2024"},
                        {name: "Офисный комплекс «Башня»", deadline: "15.08.2024"},
                        {name: "Торговый центр «Меридиан»", deadline: "01.09.2024"},
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
                        {text: "КП отправлено клиенту ООО «СтройТех»", time: "2 дня назад"},
                        {text: "Новый счёт на согласование СФ-2024-0146", time: "4 дня назад"},
                        {text: "Договор подписан: склад Nord", time: "Вчера"},
                        {text: "Отгрузка ОТГ-0018 подтверждена", time: "1 день назад"},
                    ].map((a, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-2 flex-shrink-0"/>
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
  if (role === "pm")        return <DashboardPM onNavigate={onNavigate}  />;
  if (role === "director")  return <DashboardDirector onNavigate={onNavigate} receipts={receipts} />;
  if (role === "accountant")return <DashboardAccountant onNavigate={onNavigate} />;
  return <DashboardWarehouse onNavigate={onNavigate} />;
}