import { ChevronDown, LogOut, User } from "lucide-react";
import { Page, Role } from "../../../types";
import { ROLES } from "../../../data/roles";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuItem, DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { NotificationBell } from "../common/NotificationBell";
import getme from "../api/user"

type UserData = {
    id: number;
    name: string;
    email: string;
    role: string;
    created_at: string;
};

export function TopBar({ role, user, onNavigate, onLogout, onOpenProject, onSelectProject }: {
  role: Role;
  onNavigate: (p: Page) => void;
  onLogout: () => void;
  user: UserData | null;
  /** Same lookup AppShell already uses for the sidebar search — reused here so
   *  a notification's "Открыть проект" CTA lands on the real project, not
   *  just a bare page switch. Optional so TopBar still works if a screen
   *  doesn't have project lookup wired yet. */
  onOpenProject?: (idOrName: number | string) => void;
  /** Resolves + selects a project WITHOUT navigating anywhere — used by
   *  NotificationBell so an invoice/document notification can preload the
   *  right project and then land on its own page (procurement/documents),
   *  instead of always being forced onto the Project page like onOpenProject. */
  onSelectProject?: (idOrName: number | string) => Promise<void> | void;
}) {
  const cfg = ROLES[role];
  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <NotificationBell
          role={role}
          onNavigate={onNavigate}
          onSelectProject={onSelectProject}
        />

        <div className="h-5 w-px bg-border" />

        {/* User profile — opens downward */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="Профиль пользователя">
              <div className={`w-7 h-7 rounded-full ${cfg.dot} flex items-center justify-center flex-shrink-0`}>
                <User size={13} className="text-white" />
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <p className="text-xs font-medium text-foreground">{user?.name ?? "Загрузка..."}</p>
                <p className="text-[11px] text-muted-foreground">{cfg.full}</p>
              </div>
              <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-[196px]">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{user?.name ?? "Загрузка..."}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email ?? "Загрузка..."}</span>
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