import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
import { ProjectStatusBreakdown } from "../app/components/common/ProjectStatusBreakdown";
import { RevenueTrendWidget } from "../app/components/common/RevenueTrendWidget";
import {
  Plus, FolderOpen, Send, TrendingUp, AlertTriangle, Inbox, BarChart2, 
  Clock, Check, X, CheckCircle2, XCircle, ChevronRight, MoreHorizontal,
  Archive, Package, Truck, DollarSign, UploadCloud, FileText, Trash2, Loader2, Search,
  ArrowUpDown
} from "lucide-react";
import {
  fetchDashboardStats,
  type DashboardStats,
  startParseJob,
  fetchUpcomingDeadlines,
  type UpcomingDeadline,
  fetchRecentActivity,
  type RecentActivity,
} from "../api/api";
import { useBackgroundJobs } from "../app/context/BackgroundJobsContext";

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

// Статусы, при которых бэкенд запрещает удаление и вместо этого нужна
// архивация. Должно совпадать с ARCHIVABLE_STATUSES в
// app/services/project_service.py на бэкенде.
const ARCHIVABLE_STATUSES = new Set([
  "Активный закуп",
  "На приходе",
  "На отгрузке",
  "Ожидание документов",
  "Завершен",
]);

function isArchivableStatus(statusName?: string | null): boolean {
  return !!statusName && ARCHIVABLE_STATUSES.has(statusName);
}

// Статусы, которые не показываются в списке "Проекты" по умолчанию —
// только когда PM/Комдир нажимает "Все проекты". "Завершен" был здесь и
// раньше; "Договор расторгнут" — новый архивный статус, ведёт себя так же.
const HIDDEN_BY_DEFAULT_STATUSES = new Set(["Завершен", "Договор расторгнут"]);

// Порядок статусов проекта для сортировки таблицы "Проекты" — от начала
// жизненного цикла сделки к концу. "Новый проект" и "Новый" оба на первом
// месте, т.к. в Chip.tsx это два алиаса одного и того же раннего статуса
// (см. также PROJECT_STATUS_ORDER в app/services/project_service.py на
// бэкенде — тот список короче и используется только для фильтра
// CONTRACT_VISIBLE_STATUSES, а не для сортировки таблицы).
const PROJECT_STATUS_DISPLAY_ORDER: string[] = [
  "Новый проект",
  "Новый",
  "В редактировании",
  "На согласовании у Комдира",
  "Отклонено Комдиром",
  "Ожидание клиента",
  "Ожидание подписания",
  "Активный закуп",
  "На приходе",
  "На отгрузке",
  "Ожидание документов",
  "Завершен",
  "Договор расторгнут",
];

function projectStatusOrderIndex(statusName?: string | null): number {
  const idx = PROJECT_STATUS_DISPLAY_ORDER.indexOf(statusName ?? "");
  // Незнакомый/новый статус, которого ещё нет в списке — не ломаем
  // сортировку, просто отправляем в конец.
  return idx === -1 ? PROJECT_STATUS_DISPLAY_ORDER.length : idx;
}

// Отдельный список для меню "Сортировать" — не трогаем
// PROJECT_STATUS_DISPLAY_ORDER напрямую, т.к. он используется и для
// сортировки таблицы по умолчанию (projectStatusOrderIndex). Убираем
// "Новый"/"Новый проект" только из выпадающего меню сортировки по этапу.
const SORT_MENU_STAGES = PROJECT_STATUS_DISPLAY_ORDER.filter(
  (stage) => stage !== "Новый" && stage !== "Новый проект"
);

export function DashboardPM({ role, onNavigate, onOpenProject }: { role: string; onNavigate: (p: Page) => void; onOpenProject: (projectId: number) => void }) {
  // Стейты для модального окна
  const [isKpModalOpen, setIsKpModalOpen] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [sortStage, setSortStage] = useState<string | null>(null);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
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
  // isSaving теперь блокирует только быстрые шаги (создание проекта +
  // отправка файла в очередь) — не весь парсинг, который ушёл в фон.
  const [isSaving, setIsSaving] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  // Фоновые задачи обработки файлов — теперь живут в контексте на уровне
  // App.tsx, а не локально здесь, чтобы тост не пропадал при переходе на
  // другую страницу (Закупки, Склад и т.д.).
  const { startBackgroundJob } = useBackgroundJobs();

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

    fetch("/api/v1/clients/clients/select")
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
            "/api/v1/projects/",
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
  // Координаты меню действий строки — считаем из getBoundingClientRect() кнопки
  // "...", а само меню рендерим через портал в document.body. Раньше меню лежало
  // absolute внутри <td>, но каждая <tr> имеет transform (из-за tailwindcss-animate
  // классов animate-in/slide-in-from-top-1), а transform создаёт новый stacking
  // context — из-за этого меню одной строки могло оказаться ПОД контентом строк
  // ниже (z-50 внутри своего stacking context не спасает), и клик по "Удалить"
  // проваливался в перекрывающую кнопку "..." следующей строки. Портал с fixed-
  // позиционированием решает это раз и навсегда.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  // Проект, ожидающий подтверждения удаления (для кастомного модального окна)
  const [projectToDelete, setProjectToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Проект, ожидающий подтверждения архивации (для кастомного модального окна)
  const [projectToArchive, setProjectToArchive] = useState<{ id: number; name: string } | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  
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
      "/api/v1/projects/create-base",
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

    // 2. Ставим файл в очередь на обработку (парсинг + ML-матчинг —
    // оба шага теперь выполняет воркер в фоне, не блокируя этот запрос).
    const { job_id } = await startParseJob(projectId, kpFile);

    console.log("Файл поставлен в очередь, job_id:", job_id);

    await loadProjects();
    await loadStats();

    // Модалка закрывается сразу — пользователь может продолжать работать,
    // а прогресс обработки файла отслеживается отдельным тостом, который
    // теперь живёт на уровне приложения и переживает переход на другие
    // страницы.
    resetModal();

    startBackgroundJob({
      jobId: job_id,
      projectId,
      projectName,
      fileName: kpFile.name,
    });
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
    setMenuPos(null);
    setProjectToDelete({ id: projectId, name: projectName });
  };

  // Выполняет фактическое удаление после подтверждения в модальном окне
  const confirmDelete = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
        const response = await fetch(
            `/api/v1/projects/${projectToDelete.id}`,
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

  // Открывает кастомное модальное окно подтверждения архивации
  const handleArchive = (projectId: number, projectName: string) => {
    setOpenMenu(null);
    setMenuPos(null);
    setProjectToArchive({ id: projectId, name: projectName });
  };

  // Выполняет перевод проекта в статус "Договор расторгнут" после подтверждения
  const confirmArchive = async () => {
    if (!projectToArchive) return;

    setIsArchiving(true);
    try {
        const response = await fetch(
            `/api/v1/projects/${projectToArchive.id}/archive`,
            {
                method: "PATCH",
                credentials: "include",
            }
        );

        if (!response.ok) {
            throw new Error(`Ошибка ${response.status}`);
        }

        setProjectToArchive(null);
        await loadProjects();
        await loadStats();
    } catch (error) {
        console.error(error);
        alert("Ошибка архивации");
    } finally {
        setIsArchiving(false);
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
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Новый проект 
          </button>
        )
      }
    >
      {/* ── Модальное окно «Новое КП» ── */}
      {isKpModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col relative">

            {/* ── Оверлей загрузки: только создание проекта + отправка файла
                в очередь — это быстро (секунды), не сам парсинг. ── */}
            {isSaving && (
              <div className="absolute inset-0 z-10 bg-card/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-xl px-6 text-center">
                <Loader2 size={28} className="text-primary animate-spin" />
                <p className="text-sm font-medium text-foreground">Создание проекта...</p>
                <p className="text-xs text-muted-foreground">Файл будет обработан в фоне — после закрытия окна вы сможете продолжить работу.</p>
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background flex-shrink-0">
              <h3 className="font-semibold text-foreground">Создание нового КП</h3>
              <button
                onClick={resetModal}
                disabled={isSaving}
                className="text-muted-foreground hover:text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="w-4 h-4 text-primary rounded border-input focus:ring-primary"
                />
                <span className="text-sm font-medium text-foreground">Новый клиент</span>
              </label>

              <div className="h-px w-full bg-muted" />

              {/* ── Клиентский блок: виден всегда, сразу под чекбоксом ── */}
              {isNewClient ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">ФИО / Название компании</label>
                    <input
                      type="text"
                      value={newClientForm.name}
                      onChange={(e) => setNewClientForm({...newClientForm, name: e.target.value})}
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="Например, ООО «Инновации»"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                    <input
                      type="email"
                      value={newClientForm.email}
                      onChange={(e) => setNewClientForm({...newClientForm, email: e.target.value})}
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="client@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Номер телефона</label>
                    <input
                      type="tel"
                      value={newClientForm.phone}
                      onChange={handlePhoneChange}
                      inputMode="tel"
                      maxLength={20}
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="+7 (707) 123-45-67"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Выберите клиента</label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      disabled={clientsLoading || !!clientsError}
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-card disabled:bg-background disabled:text-muted-foreground"
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
                      <p className="text-xs text-destructive mt-1.5">{clientsError}</p>
                    )}
                  </div>

                  {selectedClientData && (
                    <div className="bg-background/80 p-4 rounded-lg border border-border space-y-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Клиент:</span>
                        <span className="text-sm font-medium text-foreground">{selectedClientData.client_name}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Название проекта и дедлайн: появляются, когда отмечен «Новый клиент»
                  либо выбран конкретный клиент из списка ── */}
              {showProjectDetails && (
                <>
                  <div className="h-px w-full bg-muted" />

                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Название проекта</label>
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
                              projectForm.name.trim() && !isProjectNameValid ? "border-red-400 focus:border-red-500" : "border-input focus:border-primary"}`}/>
                        {projectForm.name.trim() && !isProjectNameValid && (
                            <p className="mt-1 text-xs text-destructive">
                                Название должно начинаться с русской или английской буквы</p>
                        )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Дедлайн</label>
                      <input
                        type="date"
                        value={projectForm.deadline}
                        onChange={(e) => setProjectForm({ ...projectForm, deadline: e.target.value })}
                        className="w-full px-3 py-2 border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ── Загрузка файла: показывается только после выбора/ввода клиента ── */}
              {isClientChosen && (
              <>
              <div className="h-px w-full bg-muted" />

              <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Файл КП</label>
                {!kpFile ? (
                  <label
                    htmlFor="kp-file-upload"
                    className="flex flex-col items-center justify-center gap-1.5 w-full py-6 border-2 border-dashed border-input rounded-lg cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors"
                  >
                    <UploadCloud size={20} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Нажмите, чтобы выбрать файл</span>
                    <span className="text-xs text-muted-foreground">PDF, DOCX, XLSX до 10 МБ</span>
                    <input
                      id="kp-file-upload"
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-border rounded-lg bg-background/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{kpFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(kpFile.size / 1024).toFixed(0)} КБ</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setKpFile(null)}
                      className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
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

            <div className="px-5 py-4 border-t border-border bg-background flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={resetModal}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Назад
              </button>
              <button
                onClick={handleSave}
                disabled={!isClientChosen || !isProjectFormValid || isSaving}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[112px]"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
          iconColor="text-amber-500 dark:text-amber-400"
          iconBg="bg-amber-50 dark:bg-amber-400/15"
        />
        <StatCard
          label="Выручка (план)"
          value={stats ? fmt(stats.planned_revenue) : "—"}
          sub="Текущий месяц"
          icon={TrendingUp}
          iconColor="text-green-500 dark:text-green-400 dark:text-emerald-400"
          iconBg="bg-green-50 dark:bg-green-400/15 dark:bg-emerald-400/15"
        />
        <StatCard
          label="Близко к дедлайну"
          value={stats ? String(stats.deadline_projects) : "—"}
          sub={stats ? `+${stats.new_projects_month} новых за месяц` : "Загрузка..."}
          icon={AlertTriangle}
          iconColor="text-amber-500 dark:text-amber-400"
          iconBg="bg-amber-50 dark:bg-amber-400/15"
        />
      </div>
      {statsError && (
        <p className="text-xs text-destructive mb-4">{statsError}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <RevenueTrendWidget />
        <ProjectStatusBreakdown />
      </div>

      <SectionHeader title="Проекты" action={
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Поиск по проекту или клиенту..."
              className="pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-56"
            />
          </div>
          <button onClick={() => setShowAllProjects(!showAllProjects)} className="text-xs text-primary hover:underline flex items-center gap-1 whitespace-nowrap">
            {showAllProjects ? "Только активные" : "Все проекты"} <ChevronRight size={12} />
          </button>
          <div className="relative">
            <button
              onClick={() => setIsSortMenuOpen((v) => !v)}
              className={`text-xs flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg border transition-all duration-150 active:scale-95 ${
                sortStage
                  ? "border-primary text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              <ArrowUpDown
                size={12}
                className={`transition-transform duration-200 ${isSortMenuOpen ? "rotate-180" : ""}`}
              />
              {sortStage ? `Этап: ${sortStage}` : "Сортировать"}
            </button>

            {isSortMenuOpen && (
              <>
                {/* Клик вне меню закрывает его */}
                <div className="fixed inset-0 z-10" onClick={() => setIsSortMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl z-20 py-1 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 origin-top-right">
                  <button
                    onClick={() => {
                      setSortStage(null);
                      setIsSortMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-muted transition-colors text-muted-foreground"
                  >
                    Без сортировки по этапу
                    {!sortStage && <Check size={12} className="text-primary animate-in fade-in zoom-in duration-150" />}
                  </button>
                  <div className="h-px bg-muted my-1" />
                  {SORT_MENU_STAGES.map((stageName, i) => (
                    <button
                      key={stageName}
                      onClick={() => {
                        setSortStage(stageName);
                        setIsSortMenuOpen(false);
                      }}
                      style={{ animationDelay: `${i * 20}ms` }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-muted transition-colors text-foreground animate-in fade-in slide-in-from-top-1 duration-150 fill-mode-both"
                    >
                      {stageName}
                      {sortStage === stageName && <Check size={12} className="text-primary animate-in fade-in zoom-in duration-150" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      } />
      <div className="bg-card rounded-lg border border-border overflow-visible mb-6">
          <table className="w-full border-collapse">
              <thead>
              <tr className="border-b border-border bg-background/60">
                  {["Проект", "Клиент", "Этап", "Бюджет", "Дедлайн", "Ответственный", "Менеджер", ""].map(h => (
                      <th key={h}
                          className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left">{h}</th>
                  ))}
              </tr>
              </thead>
              <tbody className="divide-y divide-border">
              {projects
                .filter((p: any) => showAllProjects || !HIDDEN_BY_DEFAULT_STATUSES.has(p.status?.status_name))
                .filter((p: any) => {
                  if (!projectSearch.trim()) return true;
                  const q = projectSearch.trim().toLowerCase();
                  return (
                    (p.name ?? "").toLowerCase().includes(q) ||
                    (p.client?.client_name ?? "").toLowerCase().includes(q)
                  );
                })
                .slice()
                .sort((a: any, b: any) => {
                  if (sortStage) {
                    // Выбранный этап — наверх; остальные — в обычном порядке следом
                    const aMatches = a.status?.status_name === sortStage ? 0 : 1;
                    const bMatches = b.status?.status_name === sortStage ? 0 : 1;
                    if (aMatches !== bMatches) return aMatches - bMatches;
                  }
                  return (
                    projectStatusOrderIndex(a.status?.status_name) - projectStatusOrderIndex(b.status?.status_name)
                  );
                })
                .map((p: any) => {
                  return (
                      <tr key={p.id} className="hover:bg-background/50 transition-colors animate-in fade-in slide-in-from-top-1 duration-200 fill-mode-both">

                          {/* Проект */}
                          <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                  {contractIcon("signed")}
                                  <button
                                      onClick={() => onOpenProject(p.id)}
                                      className="text-sm font-medium text-primary hover:underline text-left"
                                  >
                                      {p.name ?? `Проект №${p.id}`}
                                  </button>
                              </div>
                          </td>

                          {/* Клиент */}
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                              {p.client?.client_name}
                          </td>

                          {/* Этап: ИСПОЛЬЗУЕМ НАШ НОВЫЙ CHIP! */}
                          <td className="px-4 py-3">
                              <Chip status={p.status?.status_name} />
                          </td>

                          {/* Бюджет: сумма (кол-во * себестоимость) по позициям проекта —
                              считается на бэкенде (project_service._get_budget_map),
                              а не invoice.amount (тот всегда 0, см. handleSave payload) */}
                          <td className="px-4 py-3 text-sm text-foreground font-mono text-right">
                              {fmt(Number(p.budget ?? 0))}
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
                            <span className="text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded">
                              {p.pm?.name}
                            </span>
                          </td>

                          {/* Менеджер */}
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                              {p.pm?.name}
                          </td>

                          <td className="px-4 py-3 relative">
                              <button
                                  onClick={(e) => {
                                      if (openMenu === p.id) {
                                          setOpenMenu(null);
                                          setMenuPos(null);
                                          return;
                                      }
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setMenuPos({
                                          top: rect.bottom + 6,
                                          right: window.innerWidth - rect.right,
                                      });
                                      setOpenMenu(p.id);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                              >
                                  <MoreHorizontal size={14}/>
                              </button>

                              {openMenu === p.id && menuPos && createPortal(
                                  <>
                                      {/* Клик вне меню закрывает его */}
                                      <div
                                          className="fixed inset-0 z-[100]"
                                          onClick={() => {
                                              setOpenMenu(null);
                                              setMenuPos(null);
                                          }}
                                      />
                                      <div
                                          style={{ top: menuPos.top, right: menuPos.right }}
                                          className="fixed w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl z-[101]">
                                          <button
                                              onClick={() => {
                                                  setOpenMenu(null);
                                                  setMenuPos(null);
                                                  onOpenProject(p.id);
                                              }}
                                              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                                          >
                                              <FolderOpen size={18} className="text-amber-500 dark:text-amber-400"/>
                                              Открыть проект
                                          </button>

                                          {isArchivableStatus(p.status?.status_name) ? (
                                              role === "commercial_director" && (
                                                  <>
                                                      <div className="h-px bg-muted"/>
                                                      <button
                                                          onClick={() => handleArchive(p.id, p.name ?? `Проект №${p.id}`)}
                                                          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:bg-amber-400/15 transition-colors"
                                                      >
                                                          <Archive size={18}/>
                                                          Отправить в архив
                                                      </button>
                                                  </>
                                              )
                                          ) : (
                                              <>
                                                  <div className="h-px bg-muted"/>
                                                  <button
                                                      onClick={() => handleDelete(p.id, p.name ?? `Проект №${p.id}`)}
                                                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-red-50 dark:bg-red-400/15 transition-colors"
                                                  >
                                                      <Trash2 size={19}/>
                                                      Удалить
                                                  </button>
                                              </>
                                          )}
                                      </div>
                                  </>,
                                  document.body
                              )}
                          </td>
                      </tr>
                  );
              })}
              </tbody>
          </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Ближайшие дедлайны</h3>
          <div className="space-y-3">
            {deadlines.length > 0 ? (
              deadlines.map(item => {
                const d = item.days_left;
                const color = d <= 7 ? "text-destructive font-bold" : d <= 14 ? "text-orange-600 dark:text-orange-400 font-semibold" : "text-green-600 dark:text-green-400 font-medium";
                return (
                  <div key={item.project_id} className="flex items-center justify-between">
                    <div>
                      <button onClick={() => onOpenProject(item.project_id)} className="text-sm text-foreground hover:text-primary hover:underline text-left">
                        {item.name}
                      </button>
                      <p className="text-xs text-muted-foreground">{item.deadline}</p>
                    </div>
                    <span className={`text-xs ${color}`}>{d >= 0 ? `${d}д` : "Просрочен"}</span>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Нет ближайших дедлайнов</p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Активность</h3>
          <div className="space-y-3">
            {activity.length > 0 ? (
              activity.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-foreground">{a.text}</p>
                    <p className="text-xs text-muted-foreground">{a.time}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Нет недавней активности</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Модальное окно подтверждения удаления проекта ── */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-400/15 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={18} className="text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Удалить проект?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Вы действительно хотите удалить проект «{projectToDelete.name}»? Это действие необратимо.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setProjectToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
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

      {/* ── Модальное окно подтверждения архивации проекта ── */}
      {projectToArchive && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-400/15 flex items-center justify-center flex-shrink-0">
                  <Archive size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Отправить в архив?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Проект «{projectToArchive.name}» получит статус «Договор расторгнут». Данные сохранятся, но проект перестанет считаться активной сделкой.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setProjectToArchive(null)}
                  disabled={isArchiving}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmArchive}
                  disabled={isArchiving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {isArchiving && <Loader2 size={14} className="animate-spin" />}
                  Отправить в архив
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="На утверждении" value="3 КП" sub="Ожидают решения" icon={Inbox} iconColor="text-amber-500 dark:text-amber-400" iconBg="bg-amber-50 dark:bg-amber-400/15" />
        <StatCard label="Средняя маржа" value="24.1%" sub="по портфелю" delta="+2.3% vs план" icon={BarChart2} iconColor="text-blue-500 dark:text-blue-400 dark:text-indigo-300" iconBg="bg-blue-50 dark:bg-blue-400/15 dark:bg-indigo-400/15" />
        <StatCard label="Выручка (факт)" value="38.2 млн ₸" sub="Июль 2024" delta="+12%" icon={TrendingUp} iconColor="text-green-500 dark:text-green-400 dark:text-emerald-400" iconBg="bg-green-50 dark:bg-green-400/15 dark:bg-emerald-400/15" />
        <StatCard label="Критичных дедлайнов" value="2" sub="Риск срыва" icon={AlertTriangle} iconColor="text-destructive dark:text-red-400" iconBg="bg-red-50 dark:bg-red-400/15" />
      </div>
      <SectionHeader title="КП на согласование" />
      <div className="space-y-3 mb-6">
        {[
          { name: "Офисный комплекс «Башня»",  client: "ООО «СтройТех»",  amount: 12500000, margin: 24.5, deadline: "15.08.2024", manager: "А. Петров" },
          { name: "Торговый центр «Меридиан»", client: "ГК «Меридиан»",   amount: 28000000, margin: 31.0, deadline: "01.09.2024", manager: "И. Волков" },
          { name: "Реконструкция склада Nord", client: "АО «МегаБилд»",   amount: 4800000,  margin: 18.2, deadline: "30.07.2024", manager: "М. Козлова" },
        ].map((kp, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-5 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => onNavigate("project")} className="text-sm font-semibold text-primary hover:underline">{kp.name}</button>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ring-1 ${kp.margin >= 25 ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-green-200" : kp.margin >= 20 ? "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-amber-200" : "bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 ring-red-200"}`}>{kp.margin}% маржа</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{kp.client}</span><span>·</span><span>{fmt(kp.amount)}</span><span>·</span>
                <span className="flex items-center gap-1"><Clock size={11} />{kp.deadline}</span><span>·</span><span>PM: {kp.manager}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-6">
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-success-foreground text-xs font-medium rounded-md hover:bg-success/90 transition-colors"><Check size={12} /> Одобрить</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-card text-destructive text-xs font-medium rounded-md border border-border hover:bg-red-50 dark:bg-red-400/15 transition-colors"><X size={12} /> Отклонить</button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PROJECTS.map(p => (
          <div key={p.id} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-start justify-between mb-2"><p className="text-sm font-medium text-foreground leading-tight">{p.name}</p><Chip status={p.stage} /></div>
            <p className="text-xs text-muted-foreground mb-3">{p.client}</p>
            <div className="flex items-center justify-between text-xs mb-1"><span className="text-muted-foreground">Маржа</span><span className={`font-semibold ${p.margin >= 25 ? "text-green-600 dark:text-green-400" : p.margin >= 20 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>{p.margin}%</span></div>
            <div className="w-full bg-muted rounded-full h-1.5 mb-3"><div className={`h-1.5 rounded-full ${p.margin >= 25 ? "bg-green-500" : p.margin >= 20 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(p.margin * 2, 100)}%` }} /></div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={10} />{p.deadline}</div>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="bg-card rounded-lg border border-border p-5">
                <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={15} className="text-green-500 dark:text-green-400" /><p className="text-xs font-medium text-muted-foreground">Подтверждено чеками</p></div>
                <p className="text-xl font-semibold text-foreground">{fmt(sum(verified))}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{verified.length} чек(ов) «Проверен»</p>
              </div>
              <div className="bg-card rounded-lg border border-border p-5">
                <div className="flex items-center gap-2 mb-2"><Clock size={15} className="text-amber-500 dark:text-amber-400" /><p className="text-xs font-medium text-muted-foreground">В обработке</p></div>
                <p className="text-xl font-semibold text-foreground">{fmt(sum(processing))}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{processing.length} чек(ов) ожидают проверки</p>
              </div>
              <div className="bg-card rounded-lg border border-border p-5">
                <div className="flex items-center gap-2 mb-2"><XCircle size={15} className="text-destructive" /><p className="text-xs font-medium text-muted-foreground">Отклонено</p></div>
                <p className="text-xl font-semibold text-foreground">{fmt(sum(rejected))}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rejected.length} чек(ов) «Отклонен»</p>
              </div>
            </div>
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-background/60 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Все чеки компании · только просмотр</span>
                <span className="text-xs text-muted-foreground">{receipts.length} записей</span>
              </div>
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border">
                  {["Проект","Файл","Загрузил","Сумма","Статус"].map((h,i) => (
                    <th key={h} className={`px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {receipts.map(r => (
                    <tr key={r.id} className="hover:bg-background/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground">{r.project}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.fileName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{r.uploadedBy}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-mono font-semibold text-foreground">{fmt(r.amount)}</span>
                        {r.amount > 1_000_000 && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-400/15 px-2 py-0.5 rounded ring-1 ring-orange-200 align-middle"><AlertTriangle size={10} /> Крупная сумма</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="К оплате" value="5.54 млн ₸" sub="3 счёта ожидают" icon={DollarSign} iconColor="text-blue-500 dark:text-blue-400 dark:text-indigo-300" iconBg="bg-blue-50 dark:bg-blue-400/15 dark:bg-indigo-400/15" />
        <StatCard label="Оплачено за месяц" value="12.3 млн ₸" sub="Июль 2024" delta="+8%" icon={CheckCircle2} iconColor="text-green-500 dark:text-green-400 dark:text-emerald-400" iconBg="bg-green-50 dark:bg-green-400/15 dark:bg-emerald-400/15" />
        <StatCard label="Просрочено" value="1 счёт" sub="675 000 ₸" icon={XCircle} iconColor="text-destructive dark:text-red-400" iconBg="bg-red-50 dark:bg-red-400/15" />
        <StatCard label="На согласовании" value="2 счёта" sub="Ожидают Комдира" icon={Clock} iconColor="text-amber-500 dark:text-amber-400" iconBg="bg-amber-50 dark:bg-amber-400/15" />
      </div>
      <SectionHeader title="Счета к оплате" action={<button onClick={() => onNavigate("procurement")} className="text-xs text-primary hover:underline flex items-center gap-1">Все счета <ChevronRight size={12} /></button>} />
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border bg-background/60">
            {["Номер счёта","Поставщик","Сумма","К оплате до","Статус",""].map((h,i) => (
              <th key={i} className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {INVOICES_INIT.map(inv => (
              <tr key={inv.id} className="hover:bg-background/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-foreground">{inv.id}</td>
                <td className="px-4 py-3 text-sm text-foreground">{inv.supplier}</td>
                <td className="px-4 py-3 text-sm font-mono text-foreground">{fmt(inv.amount)}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{inv.dueDate}</td>
                <td className="px-4 py-3"><Chip status={inv.status} /></td>
                <td className="px-4 py-3">{inv.status === "approved" && <button className="text-xs px-2.5 py-1 bg-success text-success-foreground rounded font-medium hover:bg-success/90 transition-colors">Оплатить</button>}</td>
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
      actions={<button className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"><Plus size={14} /> Новый приход</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Позиций на складе" value="142" sub="6 ниже минимума" icon={Archive} iconColor="text-blue-500 dark:text-blue-400 dark:text-indigo-300" iconBg="bg-blue-50 dark:bg-blue-400/15 dark:bg-indigo-400/15" />
        <StatCard label="В резерве" value="34 позиции" sub="4 проекта" icon={Package} iconColor="text-violet-500 dark:text-violet-400" iconBg="bg-violet-50 dark:bg-violet-400/15" />
        <StatCard label="Отгрузок за неделю" value="8" sub="12 позиций" delta="+3 vs пред.неделя" icon={Truck} iconColor="text-green-500 dark:text-green-400 dark:text-emerald-400" iconBg="bg-green-50 dark:bg-green-400/15 dark:bg-emerald-400/15" />
        <StatCard label="Ожидаемых поставок" value="3" sub="На этой неделе" icon={Clock} iconColor="text-amber-500 dark:text-amber-400" iconBg="bg-amber-50 dark:bg-amber-400/15" />
      </div>
      <SectionHeader title="Остатки товара" action={<button onClick={() => onNavigate("warehouse")} className="text-xs text-primary hover:underline flex items-center gap-1">Полный склад <ChevronRight size={12} /></button>} />
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border bg-background/60">
            {["Артикул","Наименование","Ед.","Всего","Резерв","Доступно"].map((h,i) => (
              <th key={h} className={`px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {STOCK_INIT.map(item => (
              <tr key={item.id} className={`hover:bg-background/50 transition-colors ${item.available < 200 ? "bg-red-50/20 dark:bg-red-400/10" : ""}`}>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{item.sku}</td>
                <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{item.unit}</td>
                <td className="px-4 py-3 text-sm font-mono text-foreground text-right">{item.total.toLocaleString("ru-RU")}</td>
                <td className="px-4 py-3 text-sm font-mono text-violet-600 dark:text-violet-400 text-right">{item.reserved.toLocaleString("ru-RU")}</td>
                <td className="px-4 py-3 text-right"><span className={`text-sm font-mono font-medium ${item.available < 200 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>{item.available.toLocaleString("ru-RU")}</span></td>
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