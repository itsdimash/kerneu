import { useState } from "react";
import { FolderOpen, FileText, ShoppingCart, Package, CheckSquare, Receipt, LayoutDashboard, X, Search, History, Landmark } from "lucide-react";
import type { Page, Role, ProjectState } from "../../../types";
import { KerneuLogo } from "../common/KerneuLogo";
import ProductsCatalog from "../common/ProductsCatalog";

export const NAV: { id: Page; label: string; icon: React.ElementType; badge?: number; roles: Role[] }[] = [
  { id: "dashboard",   label: "Дашборд",    icon: LayoutDashboard, roles: ["commercial_director", "pm"] },
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
];

export function Sidebar({ page, onPage, role, projectState, onFindProject, mobileOpen = false, onCloseMobile }: {
  page: Page; onPage: (p: Page) => void; role: Role; projectState: ProjectState;
  onFindProject?: (id: string) => void;
  /** Off-canvas drawer state on narrow screens — ignored at lg: and up,
   *  where the sidebar is always visible as a static column. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectIdInput, setProjectIdInput] = useState("");

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
        className={`w-[232px] flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen fixed lg:sticky top-0 left-0 z-50 transition-transform duration-300 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 h-16 flex items-center justify-between border-b border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <KerneuLogo size={28} animated />
            <div><p className="font-semibold text-sidebar-foreground text-xs leading-tight">Kerneu Group</p><p className="text-muted-foreground text-[10px] leading-tight tracking-wide">ERP PLATFORM</p></div>
          </div>
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
            return (
              <button key={id} onClick={() => handleNavClick(id)}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`group animate-in fade-in slide-in-from-left-1 fill-mode-both relative w-full flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 lg:py-2 rounded-md text-sm transition-all duration-200 ${
                  active ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}>
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary shadow-[0_0_8px_var(--sidebar-primary)]" />}
                <Icon size={16} className={`transition-transform duration-200 ${active ? "text-sidebar-primary" : "text-muted-foreground group-hover:scale-110"}`} />
                <span className="flex-1 text-left">{label}</span>
                {badge && badge > 0 && (
                  <span className="flex-shrink-0 w-4 h-4 bg-warning text-warning-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border flex-shrink-0">
          <ProductsCatalog />
        </div>
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