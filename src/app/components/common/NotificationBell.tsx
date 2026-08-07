import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  FileX2,
  FileCheck2,
  Inbox,
  PackageCheck,
  PackageX,
  Clock3,
  ThumbsUp,
  FileSignature,
  UploadCloud,
  Quote,
  ChevronRight,
  Check,
  Receipt,
  PackagePlus,
  Truck,
  Handshake,
} from "lucide-react";
import type { Role, Page } from "../../../types";
import {
  type SystemNotification,
  type NotificationCategory,
} from "../../../data/systemNotifications";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  connectNotificationsSocket,
} from "../../../api/notifications";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../ui/dropdown-menu";

// Colors pulled straight from theme.css tokens (--destructive, --chart-2/3/5,
// --accent) rather than re-deciding a palette — the bell should look like it
// was always part of this app, not a component pasted in from elsewhere.
const DESTRUCTIVE = { fg: "var(--destructive)", bg: "var(--destructive-muted)" };
const SUCCESS = { fg: "var(--success)", bg: "var(--success-muted)" };
const WARNING = { fg: "var(--warning)", bg: "var(--warning-muted)" };
const INFO = { fg: "var(--info)", bg: "var(--info-muted)" };
const VIOLET = { fg: "var(--chart-5)", bg: "color-mix(in srgb, var(--chart-5) 12%, transparent)" };

const CATEGORY_META: Record<
  NotificationCategory,
  { icon: typeof Bell; fg: string; bg: string; label: string }
> = {
  kp_rejected: { icon: FileX2, ...DESTRUCTIVE, label: "КП отклонено" },
  kp_approved: { icon: ThumbsUp, ...SUCCESS, label: "КП одобрено" },
  kp_pending: { icon: Inbox, ...WARNING, label: "На согласовании" },
  client_approved: { icon: Handshake, ...SUCCESS, label: "Клиент одобрил" },
  invoice_pending_accountant: { icon: Receipt, ...WARNING, label: "Счёт: бухгалтер" },
  invoice_pending_director: { icon: Receipt, ...INFO, label: "Счёт: директор" },
  invoice_approved: { icon: ThumbsUp, ...SUCCESS, label: "Счёт одобрен" },
  invoice_rejected: { icon: FileX2, ...DESTRUCTIVE, label: "Счёт отклонён" },
  invoice_sent_to_income: { icon: PackagePlus, ...VIOLET, label: "Ожидается приход" },
  contract_signed: { icon: FileSignature, ...INFO, label: "Договор" },
  stock_low: { icon: PackageX, ...WARNING, label: "Склад" },
  goods_arrived: { icon: PackageCheck, ...INFO, label: "Приход" },
  goods_shipped: { icon: Truck, ...SUCCESS, label: "Отгрузка" },
  upload_processed: { icon: UploadCloud, ...VIOLET, label: "Загрузка" },
  deadline: { icon: Clock3, ...DESTRUCTIVE, label: "Дедлайн" },
  docs_pending_accountant: { icon: FileCheck2, ...WARNING, label: "Документы: бухгалтер" },
  docs_pending_director: { icon: FileCheck2, ...INFO, label: "Документы: директор" },
  docs_approved: { icon: ThumbsUp, ...SUCCESS, label: "Документы согласованы" },
  docs_rejected: { icon: FileX2, ...DESTRUCTIVE, label: "Документы отклонены" },
};

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "unread", label: "Непрочитанные" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return `${days} дн назад`;
}

type Props = {
  role: Role;
  onNavigate: (p: Page) => void;
  /** Resolves + selects a project WITHOUT navigating — CTA then navigates
   *  to the notification's own target page (n.page: "project" | "procurement" |
   *  "documents" | ...), so an invoice/document notification actually lands
   *  on Закупки/Документы with the right project preloaded, instead of
   *  always being forced onto the Project page. */
  onSelectProject?: (idOrName: number | string) => Promise<void> | void;
};

export function NotificationBell({ role, onNavigate, onSelectProject }: Props) {
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  // Controlled so we can render a blur backdrop behind the panel while it's
  // open — Radix manages open state internally otherwise, with no hook for
  // us to render anything alongside it.
  const [open, setOpen] = useState(false);

  // Первичная загрузка — REST. Бэкенд уже возвращает список, отфильтрованный
  // под recipient_id текущего пользователя, так что фильтрации по role
  // здесь больше нет и не нужно.
  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch((err) => console.error("Не удалось загрузить уведомления:", err));
  }, []);

  // Реальное время — WS. Новые уведомления просто добавляются в начало списка.
  useEffect(() => {
    return connectNotificationsSocket((notification) => {
      setItems((prev) => [notification, ...prev]);
    });
  }, []);

  const mine = items;
  const visible = filter === "unread" ? mine.filter((n) => !n.read) : mine;
  const unreadCount = mine.filter((n) => !n.read).length;

  function toggleRead(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target) return;

    const nextRead = !target.read;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: nextRead } : n)));

    // Бэкенд пока не даёт эндпоинт "пометить непрочитанным" — только
    // read/read-all. Если понадобится обратное, добавим POST .../unread.
    if (nextRead) {
      markNotificationRead(id).catch((err) =>
        console.error("Не удалось отметить уведомление прочитанным:", err),
      );
    }
  }

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllNotificationsRead().catch((err) =>
      console.error("Не удалось отметить все уведомления прочитанными:", err),
    );
  }

  async function handleCta(n: SystemNotification) {
    setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read: true } : p)));
    markNotificationRead(n.id).catch((err) =>
      console.error("Не удалось отметить уведомление прочитанным:", err),
    );
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
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              Прочитать всё
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                filter === f.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="max-h-[460px] overflow-y-auto">
          {visible.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Check size={20} className="text-muted-foreground/60" />
              <p className="text-[12.5px] font-medium text-muted-foreground">Здесь пока пусто</p>
            </div>
          )}

          {visible.map((n) => {
            const meta = CATEGORY_META[n.category];
            const Icon = meta.icon;
            return (
              <div
                key={n.id}
                className={`flex gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-muted ${
                  n.read ? "bg-transparent" : "bg-accent/40"
                }`}
              >
                <div
                  className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: meta.bg }}
                >
                  <Icon size={16} color={meta.fg} strokeWidth={2.1} />
                  {!n.read && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-card bg-primary" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="rounded-md px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: meta.fg, backgroundColor: meta.bg }}
                    >
                      {meta.label}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1 text-[13px] font-medium leading-snug text-foreground">
                    {n.title}
                  </p>
                  {n.detail && (
                    <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                      {n.detail}
                    </p>
                  )}

                  {n.comment && (
                    <div className="mt-2 flex gap-1.5 rounded-lg px-2.5 py-2" style={{ backgroundColor: meta.bg }}>
                      <Quote size={12} color={meta.fg} className="mt-0.5 shrink-0" strokeWidth={2.5} />
                      <div className="min-w-0">
                        <p className="text-[12px] leading-snug text-foreground/80">{n.comment}</p>
                        {n.actorName && (
                          <p className="mt-1 text-[11px] font-medium" style={{ color: meta.fg }}>
                            — {n.actorName}{n.actorRole ? `, ${n.actorRole}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={() => handleCta(n)}
                      className="flex items-center gap-0.5 text-[12px] font-semibold text-primary hover:text-primary/80"
                    >
                      {n.ctaLabel}
                      <ChevronRight size={12} />
                    </button>
                    <button
                      onClick={() => toggleRead(n.id)}
                      className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      {n.read ? "Не прочитано" : "Прочитано"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}