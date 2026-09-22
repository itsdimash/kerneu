import { useEffect, useRef, useState } from "react";
import { FolderOpen, FileText, ShoppingCart, Package, CheckSquare, Receipt, LayoutDashboard, X, Search, History, Landmark, Sparkles, PanelLeftClose, PanelLeftOpen, ListChecks } from "lucide-react";
import type { Page, Role, ProjectState } from "../../../types";
import type { NotificationCategory } from "../../../data/systemNotifications";
import { useNotifications } from "../../notifications/NotificationsContext";
import { KerneuLogo } from "../common/KerneuLogo";
import ProductsCatalog from "../common/ProductsCatalog";

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
  const [projectIdInput, setProjectIdInput] = useState("");

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

 const handleFindProject = () => {
    if (!projectIdInput.trim()) return;
    onFindProject?.(projectIdInput);
    onPage("project");
    setShowProjectModal(false);
    setProjectIdInput("");
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200" onClick={() => setShowProjectModal(false)}>
          <div className="bg-card rounded-xl shadow-modal border border-border w-full max-w-[360px] p-5 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Найти проект</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
            <label className="text-xs text-muted-foreground mb-1 block">Название проекта</label>
            <input
              autoFocus
              value={projectIdInput}
              onChange={(e) => setProjectIdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFindProject()}
              placeholder="Например: Школа №196"
              className="w-full border border-input bg-input-background rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
            <button
              onClick={handleFindProject}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Search size={15} /> Найти
            </button>
          </div>
        </div>
      )}
    </>
  );
}