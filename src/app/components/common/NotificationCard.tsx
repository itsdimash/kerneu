import type { ReactNode } from "react";
import {
  Bell,
  FileX2,
  FileCheck2,
  Inbox,
  PackageCheck,
  PackageX,
  Clock3,
  ThumbsUp,
  UploadCloud,
  Quote,
  ChevronRight,
  Check,
  Receipt,
  PackagePlus,
  Boxes,
  Truck,
  Handshake,
  Trash2,
} from "lucide-react";
import {
  type SystemNotification,
  type NotificationCategory,
} from "../../../data/systemNotifications";

const DESTRUCTIVE = { fg: "var(--destructive)", bg: "var(--destructive-muted)" };
const SUCCESS = { fg: "var(--success)", bg: "var(--success-muted)" };
const WARNING = { fg: "var(--warning)", bg: "var(--warning-muted)" };
const INFO = { fg: "var(--info)", bg: "var(--info-muted)" };
const VIOLET = { fg: "var(--chart-5)", bg: "color-mix(in srgb, var(--chart-5) 12%, transparent)" };
const TEAL = { fg: "var(--chart-3)", bg: "color-mix(in srgb, var(--chart-3) 12%, transparent)" };

export const CATEGORY_META: Record<
  NotificationCategory,
  { icon: typeof Bell; fg: string; bg: string; label: string }
> = {
  kp_rejected: { icon: FileX2, ...DESTRUCTIVE, label: "Проект отклонён" },
  kp_approved: { icon: ThumbsUp, ...SUCCESS, label: "Проект одобрен" },
  kp_pending: { icon: Inbox, ...WARNING, label: "Проект на согласование" },
  warehouse_request_pending: { icon: Boxes, ...TEAL, label: "Заявка на склад" },
  warehouse_request_approved: { icon: ThumbsUp, ...SUCCESS, label: "Заявка на склад одобрена" },
  warehouse_request_rejected: { icon: FileX2, ...DESTRUCTIVE, label: "Заявка на склад отклонена" },
  client_approved: { icon: Handshake, ...SUCCESS, label: "Клиент одобрил" },
  invoice_pending_director: { icon: Receipt, ...INFO, label: "Счёт на согласование" },
  invoice_approved: { icon: ThumbsUp, ...SUCCESS, label: "Счёт одобрен" },
  invoice_rejected: { icon: FileX2, ...DESTRUCTIVE, label: "Счёт отклонён" },
  invoice_sent_to_income: { icon: PackagePlus, ...VIOLET, label: "Ожидается приход" },
  stock_low: { icon: PackageX, ...WARNING, label: "Склад" },
  goods_arrived: { icon: PackageCheck, ...INFO, label: "Приход" },
  income_request_created: { icon: PackagePlus, ...VIOLET, label: "Заявка на приход" },
  income_request_deleted: { icon: Trash2, ...DESTRUCTIVE, label: "Заявка удалена" },
  goods_shipped: { icon: Truck, ...SUCCESS, label: "Отгрузка" },
  upload_processed: { icon: UploadCloud, ...VIOLET, label: "Загрузка" },
  deadline: { icon: Clock3, ...DESTRUCTIVE, label: "Дедлайн" },
  docs_pending_director: { icon: FileCheck2, ...INFO, label: "Документы на проверку" },
  docs_approved: { icon: ThumbsUp, ...SUCCESS, label: "Документы согласованы" },
  docs_rejected: { icon: FileX2, ...DESTRUCTIVE, label: "Документы отклонены" },
  parse_job_done: { icon: FileCheck2, ...SUCCESS, label: "Файл обработан" },
  parse_job_failed: { icon: FileX2, ...DESTRUCTIVE, label: "Ошибка обработки" },
};

export const FALLBACK_META = {
  icon: Bell,
  fg: "var(--muted-foreground)",
  bg: "var(--muted)",
  label: "Уведомление",
};

export function timeAgo(iso: string) {
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
  notification: SystemNotification;
  onCta: (n: SystemNotification) => void;
  onMarkRead: (id: string) => void;
  /** "compact" is for the narrow bell dropdown; "comfortable" (default) is
   *  for the full-width Approvals page, where the original larger type
   *  scale actually has room to breathe. */
  density?: "compact" | "comfortable";
  /** Extra content rendered below the CTA/mark-read row — e.g. inline
   *  approve/reject buttons on the Approvals page. Bell doesn't use this. */
  extra?: ReactNode;
};

export function NotificationCard({ notification: n, onCta, onMarkRead, density = "comfortable", extra }: Props) {
  const known = CATEGORY_META[n.category];
  const meta = known ?? FALLBACK_META;
  if (!known) {
    console.warn(`Неизвестная категория уведомления: "${n.category}"`, n);
  }
  const Icon = meta.icon;
  const compact = density === "compact";

  return (
    <div
      className={`relative flex gap-3 border-b border-border/60 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-muted/50 ${
        n.read ? "bg-transparent" : "bg-accent/30"
      }`}
    >
      {!n.read && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: meta.fg }}
        />
      )}

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.bg }}
      >
        <Icon size={16} color={meta.fg} strokeWidth={2.1} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11.5px] font-semibold" style={{ color: meta.fg }}>
            {meta.label}
          </span>
          <span className="shrink-0 text-[10.5px] text-muted-foreground">
            {timeAgo(n.createdAt)}
          </span>
        </div>

        <p
          className={`mt-0.5 leading-snug ${compact ? "text-[13px]" : "text-[14px] leading-relaxed"} ${
            n.read ? "font-medium text-foreground/80" : "font-semibold text-foreground"
          }`}
        >
          {n.title}
        </p>
        {n.detail && (
          <p className={`mt-1 leading-snug text-muted-foreground ${compact ? "text-[12px]" : "text-[13px]"}`}>{n.detail}</p>
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

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={() => onCta(n)}
            className={`-ml-2 inline-flex items-center gap-0.5 rounded-md px-2 py-1 font-semibold text-primary transition-colors hover:bg-primary/10 ${
              compact ? "text-[12px]" : "text-[13px]"
            }`}
          >
            {n.ctaLabel}
            <ChevronRight size={12} />
          </button>

          {!n.read && (
            <button
              onClick={() => onMarkRead(n.id)}
              title="Отметить прочитанным"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
                compact ? "text-[11.5px]" : "text-[12px]"
              }`}
            >
              <Check size={12} />
              Прочитано
            </button>
          )}
        </div>

        {extra}
      </div>
    </div>
  );
}
