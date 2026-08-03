import React, { useState, useEffect } from "react";
import type { Role, Page, Receipt, ContractStatus } from "../types";
import { StatCard } from "../app/components/common/StatCard";
import { SectionHeader } from "../app/components/common/SectionHeader";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Chip } from "../app/components/common/Chip";
import { ReceiptStatusBadge } from "../app/components/common/ReceiptStatusBadge";
import { fmt, daysFromNow, deadlineBadge } from "../lib/format";
import { getStageMeta } from "../lib/projectStage";
import { PROJECTS } from "../data/projects";
import { STOCK_INIT } from "../data/stock";
import { INVOICES_INIT } from "../data/invoices";
import {
  Plus, FolderOpen, Send, TrendingUp, AlertTriangle, Inbox, BarChart2, 
  Clock, Check, X, CheckCircle2, XCircle, ChevronRight, MoreHorizontal,
  Archive, Package, Truck, DollarSign, UploadCloud, FileText, Trash2, Loader2
} from "lucide-react";
import {
  fetchDashboardStats,
  type DashboardStats,
  createMlImport,
  getMlImport,
  fetchUpcomingDeadlines,
  type UpcomingDeadline,
  fetchRecentActivity,
  type RecentActivity,
} from "../api/api";

// Тип клиента, который приходит с бэкенда: только id и name используются для отображения
type ClientDTO = {
  id: number;
  client_name: string;
  [key: string]: unknown; // бэкенд может присылать и другие поля — они нам не нужны
};

// Форматирует номер телефона как +<код страны> (XXX) XXX-XX-XX.
function formatPhoneNumber(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 0) return "";

  // 1 цифра кода страны + до 10 цифр национального номера
  digits = digits.slice(0, 11);

  const code = digits.slice(0, 1);
  const rest = digits.slice(1);

  if (rest.length === 0) return "+" + code;

  let result = "+" + code + " (" + rest.slice(0, 3);
  if (rest.length >= 3) result += ")";
  if (rest.length > 3) result += " " + rest.slice(3, 6);
  if (rest.length > 6) result += "-" + rest.slice(6, 8);
  if (rest.length > 8) result += "-" + rest.slice(8, 10);

  return result;
}

export function DashboardPM({ role, onNavigate, onOpenProject }: { role: string; onNavigate: (p: Page) => void; onOpenProject: (projectId: number) => void }) {
  // Стейты для модального окна
  const [isKpModalOpen, setIsKpModalOpen] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newClientForm, setNewClientForm] = useState({ name: "", email: "", phone: "" });

  // Поля проекта: название и дедлайн — видны в обоих режимах (новый/существующий клиент)
  const [projectForm, setProjectForm] = useState({ name: "", deadline: "" });

  // Клиенты приходят с бэкенда
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  // Файл КП, прикреплённый пользователем
  const [kpFile, setKpFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  // Статистика дашборда (карточки сверху)
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<UpcomingDeadline[]>([]);
  const [activity, setActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    loadProjects();
    loadStats();
    loadDeadlines();
    loadActivity();
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

  const loadStats = async () => {
    try {
      const data = await fetchDashboardStats();
      setStats(data);
      setStatsError(null);
    } catch (e) {
      console.error(e);
      setStatsError(e instanceof Error ? e.message : "Не удалось загрузить статистику");
    }
  };

  const loadDeadlines = async () => {
    try {
      const data = await fetchUpcomingDeadlines();
      setDeadlines(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadActivity = async () => {
    try {
      const data = await fetchRecentActivity();
      setActivity(data);
    } catch (e) {
      console.error("Ошибка загрузки активности:", e);
    }
  };

  const selectedClientData = clients.find((c) => c.id === Number(selectedClientId));
  const contractIcon = (s: ContractStatus) => s === "unsigned" ? "🔒" : s === "pending" ? "⏳" : "🔓";
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  // Проект, ожидающий подтверждения удаления (для кастомного модального окна)
  const [projectToDelete, setProjectToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Клиент "выбран", когда либо указан существующий клиент, либо введено имя нового
  const isClientChosen = isNewClient ? newClientForm.name.trim().length > 0 : !!selectedClientId;

  // Поля проекта (название/дедлайн) показываются только после того, как пользователь
  // либо отметил «Новый клиент», либо выбрал конкретного клиента из списка
  const showProjectDetails = isNewClient || !!selectedClientId;
  const isValidProjectName = (name: string): boolean => {

            const trimmedName = name.trim();

            // Название должно начинаться с русской или английской буквы.

            return /^[A-Za-zА-Яа-яЁё]/.test(trimmedName);};


  // Форма проекта считается заполненной, когда указаны название и дедлайн
    const isProjectNameValid = isValidProjectName(projectForm.name);

    const isProjectFormValid =

    isProjectNameValid &&

    projectForm.deadline.trim().length > 0;
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const prevValue = newClientForm.phone;

    let digits = rawValue.replace(/\D/g, "");

    if (rawValue.length < prevValue.length) {
      const prevDigits = prevValue.replace(/\D/g, "");
      if (digits.length === prevDigits.length && digits.length > 0) {
        digits = digits.slice(0, -1);
      }
    }

    setNewClientForm({ ...newClientForm, phone: formatPhoneNumber(digits) });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setKpFile(f);
  };

  const resetModal = () => {
    setIsKpModalOpen(false);
    setIsNewClient(false);
    setSelectedClientId("");
    setNewClientForm({ name: "", email: "", phone: "" });
    setProjectForm({ name: "", deadline: "" });
    setKpFile(null);
  };
const handleSave = async () => {
  try {
    setIsSaving(true);

    const projectName = projectForm.name.trim();

    if (!projectName) {
      alert("Введите название проекта");
      return;
    }

    if (!isValidProjectName(projectName)) {
      alert(
        "Название проекта должно начинаться с буквы и не может состоять только из цифр",
      );
      return;
    }

    if (!projectForm.deadline.trim()) {
      alert("Укажите дедлайн проекта");
      return;
    }

    if (!isProjectFormValid) {
      alert("Заполните название проекта и дедлайн");
      return;
    }

    if (!kpFile) {
      alert("Выберите файл КП");
      return;
    }

    if (!isNewClient && !selectedClientId) {
      alert("Выберите клиента");
      return;
    }

    if (isNewClient && !newClientForm.name.trim()) {
      alert("Введите имя или название нового клиента");
      return;
    }

    const uploadedFileUrl = `/uploads/${kpFile.name}`;

    const payload = isNewClient
      ? {
          is_new_client: true,
          new_client_name: newClientForm.name.trim(),
          new_client_phone: newClientForm.phone.trim(),
          new_client_email: newClientForm.email.trim(),
          project_name: projectName,
          invoice_amount: 0,
          invoice_status_id: 1,
          file_url: uploadedFileUrl,
          project_status_id: 2, // "В редактировании" — PM сразу начинает редактировать проект после создания
          planned_margin: 0,
          deadline: projectForm.deadline,
        }
      : {
          is_new_client: false,
          client_id: Number(selectedClientId),
          project_name: projectName,
          invoice_amount: 0,
          invoice_status_id: 1,
          file_url: uploadedFileUrl,
          project_status_id: 2, // "В редактировании" — PM сразу начинает редактировать проект после создания
          pm_id: 1,
          planned_margin: 0,
          deadline: projectForm.deadline,
        };

    console.log("Создание проекта, payload:", payload);

    // 1. Создаём проект
    const projectResponse = await fetch(
      "http://localhost:8000/api/v1/projects/create-base",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!projectResponse.ok) {
      const errorText = await projectResponse.text();
      throw new Error(errorText || "Ошибка создания проекта");
    }

    const projectData = await projectResponse.json();
    const projectId = Number(projectData.project_id);

    if (!Number.isInteger(projectId) || projectId <= 0) {
      console.error("Ответ создания проекта:", projectData);
      throw new Error("Backend не вернул корректный project_id");
    }

    console.log("Проект создан:", projectId);

    // 2. Отправляем исходный файл в парсер
    const parserFormData = new FormData();
    parserFormData.append("file", kpFile);

    const parserResponse = await fetch(
      `http://localhost:8000/api/v1/parser/projects/${projectId}/parse`,
      {
        method: "POST",
        credentials: "include",
        body: parserFormData,
      },
    );

    if (!parserResponse.ok) {
      const errorText = await parserResponse.text();
      throw new Error(errorText || "Ошибка парсинга файла");
    }

    // 3. Получаем Excel от парсера
    const parserBlob = await parserResponse.blob();

    const parserFile = new File(
      [parserBlob],
      "quotation.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );

    console.log(
      "Excel от парсера получен:",
      parserFile.name,
      parserFile.size,
    );

    // 4. Отправляем Excel в ML
    const mlFormData = new FormData();
    mlFormData.append("file", parserFile);

    const mlResponse = await fetch(
      "http://localhost:8000/api/v1/match-file",
      {
        method: "POST",
        credentials: "include",
        body: mlFormData,
      },
    );

    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      throw new Error(errorText || "Ошибка обработки файла в ML");
    }

    // 5. Получаем итоговый Excel от ML
    const mlBlob = await mlResponse.blob();
    const contentDisposition =
      mlResponse.headers.get("content-disposition");

    let mlFilename = "ml_result.xlsx";

    if (contentDisposition) {
      const utf8Match = contentDisposition.match(
        /filename\*=UTF-8''([^;]+)/i,
      );

      const normalMatch = contentDisposition.match(
        /filename="?([^";]+)"?/i,
      );

      if (utf8Match?.[1]) {
        mlFilename = decodeURIComponent(utf8Match[1]);
      } else if (normalMatch?.[1]) {
        mlFilename = normalMatch[1].trim();
      }
    }

    const mlFile = new File(
      [mlBlob],
      mlFilename,
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );

    console.log(
      "Excel от ML получен:",
      mlFile.name,
      mlFile.size,
    );

    // 6. Создаём ML-импорт
    const createdImport = await createMlImport(projectId, mlFile);

    console.log("ML import создан:", createdImport);

    // 7. Загружаем строки ML-импорта
    const importDetails = await getMlImport(createdImport.id);

    console.log(
      "Строки ML-импорта:",
      importDetails.items,
    );

    localStorage.setItem(
      `project:${projectId}:mlImportId`,
      String(createdImport.id),
    );

    await loadProjects();
    await loadStats();

    resetModal();
    onOpenProject(projectId);
  } catch (error) {
    console.error("Ошибка создания проекта:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Неизвестная ошибка";

    alert(`Ошибка создания проекта: ${message}`);
  } finally {
    setIsSaving(false);
  }
};

  // Открывает кастомное модальное окно подтверждения вместо window.confirm
  const handleDelete = (projectId: number, projectName: string) => {
    setOpenMenu(null);
    setProjectToDelete({ id: projectId, name: projectName });
  };

  // Выполняет фактическое удаление после подтверждения в модальном окне
  const confirmDelete = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
        const response = await fetch(
            `http://localhost:8000/api/v1/projects/${projectToDelete.id}`,
            {
                method: "DELETE",
                credentials: "include",
            }
        );

        if (!response.ok) {
            throw new Error(`Ошибка ${response.status}`);
        }

        setProjectToDelete(null);
        await loadProjects();
        await loadStats();
    } catch (error) {
        console.error(error);
        alert("Ошибка удаления");
    } finally {
        setIsDeleting(false);
    }
  };

  return (
    <PageWrap 
      title={role === "commercial_director" ? "Дашборд Директора" : "Дашборд PM"} 
      subtitle="Управление проектами и коммерческими предложениями"
      actions={
        role !== "commercial_director" && (
          <button 
            onClick={() => setIsKpModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1d4ed8] transition-colors"
          >
            <Plus size={14} /> Новый проект 
          </button>
        )
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

              {/* ── Клиентский блок: виден всегда, сразу под чекбоксом ── */}
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
                      onChange={handlePhoneChange}
                      inputMode="tel"
                      maxLength={20}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                      placeholder="+7 (707) 123-45-67"
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

              {/* ── Название проекта и дедлайн: появляются, когда отмечен «Новый клиент»
                  либо выбран конкретный клиент из списка ── */}
              {showProjectDetails && (
                <>
                  <div className="h-px w-full bg-slate-100" />

                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Название проекта</label>
                      <input
                          type="text"
                          value={projectForm.name}
                          onChange={(e) =>
                              setProjectForm({
                                  ...projectForm,
                                  name: e.target.value,
                          })}
                          placeholder="Например: ООО Бекнур"
                          className={`w-full px-3 py-2 border rounded-lg outline-none ${
                              projectForm.name.trim() && !isProjectNameValid ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-blue-500"}`}/>
                        {projectForm.name.trim() && !isProjectNameValid && (
                            <p className="mt-1 text-xs text-red-500">
                                Название должно начинаться с русской или английской буквы</p>
                        )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Дедлайн</label>
                      <input
                        type="date"
                        value={projectForm.deadline}
                        onChange={(e) => setProjectForm({ ...projectForm, deadline: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ── Загрузка файла: показывается только после выбора/ввода клиента ── */}
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
                disabled={!isClientChosen || !isProjectFormValid || isSaving}
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
        <StatCard
          label="Активных проектов"
          value={stats ? String(stats.active_projects) : "—"}
          sub="Всего в работе"
          icon={FolderOpen}
        />
        <StatCard
          label="КП на отправке"
          value={stats ? String(stats.pending_kp) : "—"}
          sub="Ожидают согласования"
          icon={Send}
          iconColor="text-amber-500"
          iconBg="bg-amber-50"
        />
        <StatCard
          label="Выручка (план)"
          value={stats ? fmt(stats.planned_revenue) : "—"}
          sub="Текущий месяц"
          delta={stats ? `+${stats.revenue_growth}%` : undefined}
          icon={TrendingUp}
          iconColor="text-green-500"
          iconBg="bg-green-50"
        />
        <StatCard
          label="Близко к дедлайну"
          value={stats ? String(stats.deadline_projects) : "—"}
          sub={stats ? `+${stats.new_projects_month} новых за месяц` : "Загрузка..."}
          icon={AlertTriangle}
          iconColor="text-amber-500"
          iconBg="bg-amber-50"
        />
      </div>
      {statsError && (
        <p className="text-xs text-red-600 mb-4">{statsError}</p>
      )}

      <SectionHeader title="Проекты" action={
        <button onClick={() => setShowAllProjects(!showAllProjects)} className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
          {showAllProjects ? "Только активные" : "Все проекты"} <ChevronRight size={12} />
        </button>
      } />
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-visible mb-6">
          <table className="w-full border-collapse">
              <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                  {["Проект", "Клиент", "Этап", "Бюджет", "Дедлайн", "Ответственный", "Менеджер", ""].map(h => (
                      <th key={h}
                          className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>
                  ))}
              </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
              {projects
                .filter((p: any) => showAllProjects || p.status?.status_name !== "Завершен")
                .map((p: any) => {
                  return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">

                          {/* Проект */}
                          <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                  {contractIcon("signed")}
                                  <button
                                      onClick={() => onOpenProject(p.id)}
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

                          {/* Этап: ИСПОЛЬЗУЕМ НАШ НОВЫЙ CHIP! */}
                          <td className="px-4 py-3">
                              <Chip status={p.status?.status_name} />
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
                                              onOpenProject(p.id);
                                          }}
                                          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                                      >
                                          <FolderOpen size={18} className="text-amber-500"/>
                                          Открыть проект
                                      </button>

                                      <div className="h-px bg-slate-100"/>

                                      <button
                                          onClick={() => handleDelete(p.id, p.name ?? `Проект №${p.id}`)}
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
            {deadlines.length > 0 ? (
              deadlines.map(item => {
                const d = item.days_left;
                const color = d <= 7 ? "text-red-600 font-bold" : d <= 14 ? "text-orange-600 font-semibold" : "text-green-600 font-medium";
                return (
                  <div key={item.project_id} className="flex items-center justify-between">
                    <div>
                      <button onClick={() => onOpenProject(item.project_id)} className="text-sm text-slate-700 hover:text-[#2563EB] hover:underline text-left">
                        {item.name}
                      </button>
                      <p className="text-xs text-slate-400">{item.deadline}</p>
                    </div>
                    <span className={`text-xs ${color}`}>{d >= 0 ? `${d}д` : "Просрочен"}</span>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">Нет ближайших дедлайнов</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Активность</h3>
          <div className="space-y-3">
            {activity.length > 0 ? (
              activity.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-700">{a.text}</p>
                    <p className="text-xs text-slate-400">{a.time}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Нет недавней активности</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Модальное окно подтверждения удаления проекта ── */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={18} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Удалить проект?</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Вы действительно хотите удалить проект «{projectToDelete.name}»? Это действие необратимо.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setProjectToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isDeleting && <Loader2 size={14} className="animate-spin" />}
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrap>
  );
}

// Оставлен для истории, если понадобится, но в роутинге ниже уже не используется для commercial_director
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

export function DashboardPage({ role, onNavigate, receipts, onOpenProject }: {
  role: Role;
  onNavigate: (p: Page) => void;
  receipts: Receipt[];
  onOpenProject: (projectId: number) => void;
}) {
  if (role === "pm" || role === "commercial_director") return <DashboardPM role={role} onNavigate={onNavigate} onOpenProject={onOpenProject} />;
  if (role === "accountant") return <DashboardAccountant onNavigate={onNavigate} />;
  
  return <DashboardWarehouse onNavigate={onNavigate} />;
}
