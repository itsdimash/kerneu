import { ChevronDown, LogOut, User } from "lucide-react";
import { UPLOAD_NOTIFICATIONS } from "../../../data/notifications";
import { Page, Role } from "../../../types";
import { ROLES } from "../../../data/roles";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuItem, DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import getme from "../api/user"
const NOTIF_STYLE: Record<string, string> = {
  warning: "text-amber-500", error: "text-red-500", success: "text-green-500", neutral: "text-slate-400",
};
const NOTIF_DOT: Record<string, string> = {
  warning: "bg-amber-400", error: "bg-red-400", success: "bg-green-400", neutral: "bg-slate-300",
};
const attentionCount = UPLOAD_NOTIFICATIONS.filter(n => n.variant === "warning" || n.variant === "error").length;
type UserData = {
    id: number;
    name: string;
    email: string;
    role: string;
    created_at: string;
};
export function TopBar({ role, user, onNavigate, onLogout }: {
  role: Role; onNavigate: (p: Page) => void; onLogout: () => void; user: UserData | null;
}) {
  const cfg = ROLES[role];
  return (
    <header className="h-14 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        {/* User profile — opens downward */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30"
              aria-label="Профиль пользователя">
              <div className={`w-7 h-7 rounded-full ${cfg.dot} flex items-center justify-center flex-shrink-0`}>
                <User size={13} className="text-white" />
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <p className="text-xs font-medium text-slate-900">{user?.name ?? "Загрузка..."}</p>
                <p className="text-[11px] text-slate-400">{cfg.full}</p>
              </div>
              <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-[196px]">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-slate-900">{user?.name ?? "Загрузка..."}</span>
              <span className="text-xs font-normal text-slate-400">{user?.email ?? "Загрузка..."}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} variant="destructive">
              <LogOut size={14} />Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}