import { FolderOpen, FileText, ShoppingCart, Package, CheckSquare, Receipt, Upload, LayoutDashboard } from "lucide-react";
import type { Page, Role, ProjectState } from "../../../types";
import kLogoImg from "../../../assets/k-logo.png";


export const NAV: { id: Page; label: string; icon: React.ElementType; badge?: number; roles?: Role[] }[] = [
  { id: "dashboard",   label: "Дашборд",    icon: LayoutDashboard },
  { id: "project",     label: "Проекты",    icon: FolderOpen },
  { id: "contract",    label: "Договор",    icon: FileText },
  { id: "procurement", label: "Закупки",    icon: ShoppingCart },
  { id: "warehouse",   label: "Склад",      icon: Package },
  { id: "documents",   label: "Документы",  icon: CheckSquare },
  { id: "receipts",    label: "Хранилище чеков", icon: Receipt, roles: ["accountant"] },
  { id: "upload",      label: "Загрузка КП",icon: Upload, badge: 3, roles: ["pm"] },
];

export function Sidebar({ page, onPage, role, projectState }: {
  page: Page; onPage: (p: Page) => void; role: Role; projectState: ProjectState;
}) {
  return (
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
            <button key={id} onClick={() => onPage(id)}
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
  );
}