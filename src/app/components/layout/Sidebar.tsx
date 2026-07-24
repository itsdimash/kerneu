import { useState } from "react";
import { FolderOpen, FileText, ShoppingCart, Package, CheckSquare, Receipt, LayoutDashboard, X, Search } from "lucide-react";
import type { Page, Role, ProjectState } from "../../../types";
import kLogoImg from "../../../assets/k-logo.png";

export const NAV: { id: Page; label: string; icon: React.ElementType; badge?: number; roles: Role[] }[] = [
  { id: "dashboard",   label: "Дашборд",    icon: LayoutDashboard, roles: ["commercial_director", "pm"] },
  { id: "project",     label: "Проекты",    icon: FolderOpen,      roles: ["commercial_director", "pm"] },
  { id: "contract",    label: "Договор",    icon: FileText,        roles: ["commercial_director", "pm", "accountant"] },
  { id: "procurement", label: "Закупки",    icon: ShoppingCart,    roles: ["commercial_director", "pm", "accountant"] },
  { id: "warehouse",   label: "Склад",      icon: Package,         roles: ["commercial_director", "pm", "warehouse"] },
  { id: "documents",   label: "Документы",  icon: CheckSquare,     roles: ["commercial_director", "pm", "accountant"] },
];

export function Sidebar({ page, onPage, role, projectState, onFindProject }: {
  page: Page; onPage: (p: Page) => void; role: Role; projectState: ProjectState;
  onFindProject?: (id: string) => void;
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
    onFindProject?.(Number(projectIdInput));
    onPage("project");
    setShowProjectModal(false);
    setProjectIdInput("");
};

  return (
    <>
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col h-screen sticky top-0">
        <div className="px-4 h-14 flex items-center border-b border-[#E2E8F0] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <img src={kLogoImg} alt="Kerneu" className="h-7 w-7 object-contain" />
            <div><p className="font-semibold text-slate-900 text-xs leading-tight">Kerneu Group</p><p className="text-slate-400 text-[10px] leading-tight">ERP Platform</p></div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.filter(item => !item.roles || item.roles.includes(role)).map(({ id, label, icon: Icon, badge }) => {
            const active = page === id;
            return (
              <button key={id} onClick={() => handleNavClick(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all ${
                  active ? "bg-[#EFF6FF] text-[#2563EB] font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}>
                <Icon size={16} className={active ? "text-[#2563EB]" : "text-slate-400"} />
                <span className="flex-1 text-left">{label}</span>
                {badge && badge > 0 && (
                  <span className="flex-shrink-0 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {showProjectModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-[360px] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Найти проект</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <label className="text-xs text-slate-500 mb-1 block">ID проекта</label>
            <input
              autoFocus
              value={projectIdInput}
              onChange={(e) => setProjectIdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFindProject()}
              placeholder="Например: PRJ-2024-0041"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
            />
            <button
              onClick={handleFindProject}
              className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white text-sm font-medium py-2 rounded-md hover:bg-[#1d4ed8] transition-colors"
            >
              <Search size={15} /> Найти
            </button>
          </div>
        </div>
      )}
    </>
  );
}