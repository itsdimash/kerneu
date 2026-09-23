import { useMemo, useState } from "react";
import { Bell, Check } from "lucide-react";
import type { Role, Page } from "../../../types";
import { type ApprovalsTabId } from "../../../pages/ApprovalsPage";
import type { SystemNotification } from "../../../data/systemNotifications";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../ui/dropdown-menu";
import { NotificationCard } from "./NotificationCard";
import { useNotifications } from "../../notifications/NotificationsContext";

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "unread", label: "Непрочитанные" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

type DayBucket = "today" | "yesterday" | "earlier";

const BUCKET_LABEL: Record<DayBucket, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  earlier: "Ранее",
};

function dayBucket(iso: string): DayBucket {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= startOfToday.getTime()) return "today";
  if (t >= startOfToday.getTime() - 24 * 60 * 60 * 1000) return "yesterday";
  return "earlier";
}

type Props = {
  role: Role;
  onNavigate: (p: Page, approvalsTab?: ApprovalsTabId) => void;
  /** Resolves + selects a project WITHOUT navigating — CTA then navigates
   *  to the notification's own target page (n.page: "project" | "procurement" |
   *  "documents" | ...), so an invoice/document notification actually lands
   *  on Закупки/Документы with the right project preloaded, instead of
   *  always being forced onto the Project page. */
  onSelectProject?: (idOrName: number | string) => Promise<void> | void;
};

export function NotificationBell({ role, onNavigate, onSelectProject }: Props) {
  // Загрузка + WS-подписка теперь живут на уровне AppShell (NotificationsProvider),
  // не здесь — это нужно, чтобы данные продолжали приходить в реальном
  // времени и для ролей, для которых сам колокольчик не рендерится
  // (director/admin, см. TopBar.tsx), а используется только счётчик в сайдбаре.
  const { items, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<FilterId>("all");
  // Controlled so we can render a blur backdrop behind the panel while it's
  // open — Radix manages open state internally otherwise, with no hook for
  // us to render anything alongside it.
  const [open, setOpen] = useState(false);

  const mine = items;
  const visible = filter === "unread" ? mine.filter((n) => !n.read) : mine;
  const unreadCount = mine.filter((n) => !n.read).length;

  // Группы "Сегодня / Вчера / Ранее" — список читается как лента, а не как стена текста
  const groups = useMemo(() => {
    const order: DayBucket[] = ["today", "yesterday", "earlier"];
    return order
      .map((key) => ({ key, label: BUCKET_LABEL[key], items: visible.filter((n) => dayBucket(n.createdAt) === key) }))
      .filter((g) => g.items.length > 0);
  }, [visible]);

  async function handleCta(n: SystemNotification) {
    markRead(n.id);
    setOpen(false);

    if (n.projectId && onSelectProject) {
      // Сначала подгружаем нужный проект в общий стейт (без переключения
      // страницы), потом переходим на страницу, которую просит само
      // уведомление — procurement/documents сами подхватят выбранный
      // проект, вместо жёсткого перехода на ProjectPage.
      await onSelectProject(n.projectId);
    }
    onNavigate(n.page);
  }

  return (
    <>
      {/* Backdrop — sits behind the panel (which portals above it), blurring
          the rest of the app while the person is focused on notifications.
          Radix's own dismissable layer already closes the menu on outside
          click, so this needs no handler of its own. */}
      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm transition-opacity" />
      )}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="Уведомления"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-2rem)] sm:w-[400px] p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-foreground">Уведомления</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-info-muted px-2 py-[1px] text-[11px] font-semibold text-accent-foreground">
                {unreadCount} новых
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
              >
                Прочитать всё
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                filter === f.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
              {f.id === "unread" && unreadCount > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10.5px] font-semibold leading-[16px] ${
                    filter === f.id ? "bg-background/20 text-background" : "bg-muted text-foreground"
                  }`}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="max-h-[460px] overflow-y-auto">
          {visible.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Check size={20} className="text-muted-foreground/60" />
              <p className="text-[12.5px] font-medium text-muted-foreground">
                {filter === "unread" ? "Всё прочитано" : "Здесь пока пусто"}
              </p>
            </div>
          )}

          {groups.map((group) => (
            <section key={group.key}>
              <div className="sticky top-0 z-[1] border-b border-border/60 bg-card/95 px-4 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
                {group.label}
              </div>

              {group.items.map((n) => (
                <NotificationCard key={n.id} notification={n} onCta={handleCta} onMarkRead={markRead} density="compact" />
              ))}
            </section>
          ))}
        </div>
      </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
