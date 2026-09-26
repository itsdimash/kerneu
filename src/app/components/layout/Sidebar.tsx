import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, FileText, ShoppingCart, Package, CheckSquare, Receipt, LayoutDashboard, X, Search, History, Landmark, Sparkles, PanelLeftClose, PanelLeftOpen, ListChecks, Loader2 } from "lucide-react";
import type { Page, Role, ProjectState } from "../../../types";
import type { NotificationCategory } from "../../../data/systemNotifications";
import { useNotifications } from "../../notifications/NotificationsContext";
import { KerneuLogo } from "../common/KerneuLogo";
import ProductsCatalog from "../common/ProductsCatalog";
import { Chip } from "../common/Chip";

// Категории, которые на странице "Заявки на согласование" требуют внимания
// директора — те же, что учитываются на самой странице как pending. Держим
// список в одном месте, чтобы бейдж и анимация в сайдбаре не разъезжались
// со счётчиком на самой странице.
const APPROVALS_PENDING_CATEGORIES = new Set<NotificationCategory>([
  "kp_pending",
  "warehouse_request_pending",
  "invoice_pending_director",
  "docs_pending_director",
]);

type ProjectSearchItem = {
  id: number;
  name: string;
  status?: { status_name?: string | null } | null;
};

const PROJECT_SEARCH_DEBOUNCE_MS = 300;
const PROJECT_SEARCH_MAX_RESULTS = 8;

// Подсвечивает первое вхождение query внутри text — регистронезависимо.
// Используется только для подсказок комбобокса "Найти проект".
function highlightMatch(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded-sm px-0.5">
        {text.slice(idx, idx + trimmed.length)}
      </mark>
      {text.slice(idx + trimmed.length)}
    </>
  );
}

export const NAV: { id: Page; label: string; icon: React.ElementType; badge?: number; roles: Role[] }[] = [
  { id: "dashboard",   label: "Дашборд",    icon: LayoutDashboard, roles: ["commercial_director", "pm"] },
  { id: "approvals",   label: "Заявки на согласование", icon: ListChecks, roles: ["commercial_director", "admin"] },
  { id: "project",     label: "Проекты",    icon: FolderOpen,      roles: ["commercial_director", "pm"] },
  { id: "contract",    label: "Договор",    icon: FileText,        roles: ["commercial_director", "pm", "accountant"] },
  { id: "procurement", label: "Закупки",    icon: ShoppingCart,    roles: ["commercial_director", "pm", "accountant"] },
  { id: "warehouse",   label: "Склад",      icon: Package,         roles: ["commercial_director", "pm", "warehouse"] },
  { id: "documents",   label: "Документы",  icon: CheckSquare,     roles: ["commercial_director", "pm", "accountant"] },
  { id: "suppliers",   label: "Поставщики", icon: History, roles: ["commercial_director", "pm", "warehouse"] },
  // Данные тянутся напрямую из 1С:Бухгалтерия. Список ролей должен совпадать
  // с ALLOWED_ROLES в app/api/v1/routers/onec.py на бэке — иначе пункт меню
  // будет виден, а запросы будут падать с 403.
  { id: "onec",        label: "1С",         icon: Landmark, roles: ["commercial_director", "accountant"] },
  { id: "ai-chat",     label: "AI-ассистент", icon: Sparkles, roles: ["commercial_director", "pm", "accountant", "warehouse"] },
];

export function Sidebar({ page, onPage, role, projectState, onFindProject, mobileOpen = false, onCloseMobile, collapsed = false, onToggleCollapse }: {
  page: Page; onPage: (p: Page) => void; role: Role; projectState: ProjectState;
  onFindProject?: (id: string) => void;
  /** Off-canvas drawer state on narrow screens — ignored at lg: and up,
   *  where the sidebar is always visible as a static column. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Свёрнутое (только иконки) состояние на lg+ экранах. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [debouncedProjectQuery, setDebouncedProjectQuery] = useState("");
  const [projectOptions, setProjectOptions] = useState<ProjectSearchItem[]>([]);
  const [projectOptionsLoading, setProjectOptionsLoading] = useState(false);
  const [projectOptionsError, setProjectOptionsError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Живой счётчик и анимация на пункте "Заявки на согласование" — данные
  // берутся из того же NotificationsProvider, что и (для остальных ролей)
  // сам колокольчик, так что WS-подписка не дублируется.
  const { items: notificationItems, lastArrived } = useNotifications();
  const approvalsUnreadCount = notificationItems.filter(
    (n) => !n.read && APPROVALS_PENDING_CATEGORIES.has(n.category),
  ).length;

  const [approvalsPulse, setApprovalsPulse] = useState(false);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastArrived || !APPROVALS_PENDING_CATEGORIES.has(lastArrived.category)) return;

    // Один короткий разряд анимации на каждое новое релевантное уведомление —
    // не бесконечный мигающий индикатор, поэтому таймер, а не CSS-класс "навсегда".
    setApprovalsPulse(true);
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    pulseTimeoutRef.current = setTimeout(() => setApprovalsPulse(false), 900);

    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, [lastArrived]);

  // Свёрнутость — это desktop-only концепция (как в VS Code/Notion). Пока
  // открыт мобильный drawer, всегда показываем полную версию с подписями —
  // иначе пользователь на телефоне увидит бесполезное меню из одних иконок.
  const effectiveCollapsed = collapsed && !mobileOpen;

  const handleNavClick = (id: Page) => {
    if (id === "project") {
      setShowProjectModal(true);
      return;
    }
    onPage(id);
  };

  const closeProjectModal = () => {
    setShowProjectModal(false);
    setProjectQuery("");
    setDebouncedProjectQuery("");
    setProjectOptions([]);
    setProjectOptionsError(null);
    setHighlightedIndex(0);
  };

  // Список проектов для комбобокса грузится один раз при открытии модала —
  // тот же GET /api/v1/projects/, что уже используют Дашборд и старая
  // реализация этого модала для поиска по имени; отдельного
  // search-эндпоинта на backend нет, фильтрация ниже (filteredProjects) —
  // целиком на фронте, по уже загруженному списку.
  useEffect(() => {
    if (!showProjectModal) return;
    let cancelled = false;
    setProjectOptionsLoading(true);
    setProjectOptionsError(null);
    fetch("/api/v1/projects/", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Не удалось загрузить список проектов");
        return res.json();
      })
      .then((data) => { if (!cancelled) setProjectOptions(Array.isArray(data) ? data : []); })
      .catch((error) => {
        if (!cancelled) {
          setProjectOptions([]);
          setProjectOptionsError(error instanceof Error ? error.message : "Не удалось загрузить список проектов");
        }
      })
      .finally(() => { if (!cancelled) setProjectOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [showProjectModal]);

  // Дебаунс ввода ~300мс — фильтрация ниже дешёвая (по уже загруженному
  // списку), но не пересчитываем/не перерисовываем подсказки на каждое
  // нажатие клавиши, а только когда пользователь на миг остановился.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedProjectQuery(projectQuery), PROJECT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [projectQuery]);

  const filteredProjects = useMemo(() => {
    const q = debouncedProjectQuery.trim().toLowerCase();
    if (!q) return [];
    return projectOptions
      .filter((p) => (p.name ?? "").toLowerCase().includes(q))
      .slice(0, PROJECT_SEARCH_MAX_RESULTS);
  }, [projectOptions, debouncedProjectQuery]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredProjects]);

  // Навигация — только по явному выбору уже известного (пришедшего с backend)
  // id, поэтому getProjectItems ниже по цепочке (см. AppShell.resolveAndSelectProject)
  // всегда попадёт в числовую ветку и не полезет искать точное совпадение
  // имени — а значит, и не сможет провалиться с "проект не найден".
  const handleSelectProject = (project: ProjectSearchItem) => {
    onFindProject?.(String(project.id));
    onPage("project");
    closeProjectModal();
  };

  const handleProjectSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredProjects.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredProjects[highlightedIndex];
      if (selected) handleSelectProject(selected);
    } else if (e.key === "Escape") {
      closeProjectModal();
    }
  };

  return (
    <>
      {/* Backdrop — mobile drawer only */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`${collapsed ? "lg:w-[76px]" : "lg:w-[232px]"} w-[232px] flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen fixed lg:sticky top-0 left-0 z-50 transition-all duration-300 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className={`h-16 flex-shrink-0 border-b border-sidebar-border flex items-center ${effectiveCollapsed ? "justify-center px-2" : "justify-between px-5"}`}>
          {effectiveCollapsed ? (
            <button
              onClick={onToggleCollapse}
              aria-label="Развернуть меню"
              title="Развернуть меню"
              className="hidden lg:flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <PanelLeftOpen size={18} />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <KerneuLogo size={28} animated />
                <div className="min-w-0">
                  <p className="font-semibold text-sidebar-foreground text-xs leading-tight truncate">Kerneu Group</p>
                  <p className="text-muted-foreground text-[10px] leading-tight tracking-wide">ERP PLATFORM</p>
                </div>
              </div>
              <button
                onClick={onToggleCollapse}
                aria-label="Свернуть меню"
                title="Свернуть меню"
                className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              >
                <PanelLeftClose size={16} />
              </button>
            </>
          )}
          <button
            onClick={onCloseMobile}
            aria-label="Закрыть меню"
            className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.filter(item => !item.roles || item.roles.includes(role)).map(({ id, label, icon: Icon, badge }, i) => {
            const active = page === id;
            const isApprovals = id === "approvals";
            const effectiveBadge = isApprovals ? approvalsUnreadCount : badge;
            const pulsing = isApprovals && approvalsPulse;
            return (
              <button key={id} onClick={() => handleNavClick(id)}
                style={{ animationDelay: `${i * 40}ms` }}
                title={effectiveCollapsed ? label : undefined}
                className={`group animate-in fade-in slide-in-from-left-1 fill-mode-both relative w-full flex items-center gap-2.5 py-2.5 lg:py-2 rounded-md text-sm transition-all duration-200 ${
                  effectiveCollapsed ? "justify-center px-0" : "pl-3.5 pr-3"
                } ${
                  active ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                } ${pulsing ? "animate-pulse bg-sidebar-accent" : ""}`}>
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary shadow-[0_0_8px_var(--sidebar-primary)]" />}
                <Icon size={16} className={`transition-transform duration-200 ${active ? "text-sidebar-primary" : "text-muted-foreground group-hover:scale-110"} ${pulsing ? "text-sidebar-primary" : ""}`} />
                {!effectiveCollapsed && <span className="flex-1 text-left">{label}</span>}
                {!effectiveCollapsed && effectiveBadge != null && effectiveBadge > 0 && (
                  <span
                    className={`flex-shrink-0 min-w-4 h-4 px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center transition-transform duration-300 ${
                      pulsing ? "scale-125" : "scale-100"
                    }`}
                  >
                    {effectiveBadge}
                  </span>
                )}
                {effectiveCollapsed && effectiveBadge != null && effectiveBadge > 0 && (
                  <span
                    className={`absolute top-1 right-1.5 h-2 w-2 rounded-full bg-destructive transition-transform duration-300 ${
                      pulsing ? "scale-150" : "scale-100"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {!effectiveCollapsed && (
          <div className="px-3 py-3 border-t border-sidebar-border flex-shrink-0">
            <ProductsCatalog />
          </div>
        )}
      </aside>

      {showProjectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[60] p-4 pt-[12vh] animate-in fade-in duration-200" onClick={closeProjectModal}>
          <div className="bg-card rounded-xl shadow-modal border border-border w-full max-w-[420px] p-4 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Найти проект</h3>
              <button onClick={closeProjectModal} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                onKeyDown={handleProjectSearchKeyDown}
                placeholder="Начните вводить название"
                className="w-full border border-input bg-input-background rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
              {projectOptionsLoading && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
              )}
            </div>

            {/* Подсказки — только когда есть непустой (после дебаунса) запрос;
                пустой инпут не показывает список вообще (нет backend-эндпоинта
                для "недавних"/"активных" проектов, отдающего это быстро — см.
                исследование задачи), только плейсхолдер в самом поле. */}
            {debouncedProjectQuery.trim() && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border shadow-sm divide-y divide-border">
                {projectOptionsError ? (
                  <p className="px-3 py-3 text-xs text-destructive">{projectOptionsError}</p>
                ) : filteredProjects.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Ничего не найдено</p>
                ) : (
                  filteredProjects.map((project, index) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleSelectProject(project)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        index === highlightedIndex ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
                      }`}
                    >
                      <FolderOpen size={15} className="flex-shrink-0 text-muted-foreground" />
                      <span className="flex-1 min-w-0 truncate text-sm text-foreground">
                        {highlightMatch(project.name, debouncedProjectQuery)}
                      </span>
                      {project.status?.status_name && (
                        <Chip status={project.status.status_name} />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}