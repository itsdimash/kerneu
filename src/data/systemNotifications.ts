import type { Role, Page } from "../types";
import { UPLOAD_NOTIFICATIONS } from "./notifications";

// ---------------------------------------------------------------------------
// A "system notification" is anything that should reach a person's bell —
// as opposed to UPLOAD_NOTIFICATIONS, which is just the file-processing list
// shown inline on the Upload screen. We fold that list in as one category
// below instead of maintaining two parallel data sources.
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | "kp_rejected"
  | "kp_approved"
  | "kp_pending"
  | "client_approved"
  | "invoice_pending_accountant"
  | "invoice_pending_director"
  | "invoice_approved"
  | "invoice_rejected"
  | "invoice_sent_to_income"
  | "docs_pending_accountant"
  | "docs_pending_director"
  | "docs_approved"
  | "docs_rejected"
  | "contract_signed"
  | "stock_low"
  | "goods_arrived"
  | "goods_shipped"
  | "upload_processed"
  | "deadline";

export type SystemNotification = {
  id: string;
  category: NotificationCategory;
  /** Which roles this should appear for. Same person can hold only one role,
   *  so this is effectively an allow-list, not a broadcast. */
  forRole: Role[];
  projectId?: number | string;
  projectName?: string;
  actorName?: string;
  actorRole?: string;   // display label only, e.g. "Комдир", "Бухгалтер" — not tied to Role
  title: string;
  detail?: string;      // secondary line — e.g. "Маржа 18% ниже порога 25%"
  comment?: string;     // a direct quoted note from the actor, rendered distinctly
  createdAt: string;    // ISO 8601
  read: boolean;
  page: Page;           // where the CTA should navigate
  ctaLabel: string;
};

// Carry the existing upload-processing list into the bell, category-tagged,
// instead of inventing separate mock data for the same real events.
const uploadDerived: SystemNotification[] = UPLOAD_NOTIFICATIONS.map((n) => ({
  id: `upload-${n.id}`,
  category: "upload_processed",
  forRole: ["pm", "admin"],
  title: n.file,
  detail: n.msg,
  createdAt: new Date().toISOString(),
  read: n.variant === "success" || n.variant === "neutral",
  page: "upload",
  ctaLabel: n.variant === "error" ? "Открыть файл" : "Проверить позиции",
}));

export const MOCK_SYSTEM_NOTIFICATIONS: SystemNotification[] = [
  {
    id: "n-kp-rejected-1",
    category: "kp_rejected",
    forRole: ["pm", "admin"],
    projectId: 1042,
    projectName: "beat",
    actorName: "Марат Ж.",
    actorRole: "Комдир",
    title: "Комдир отклонил КП по проекту «beat»",
    detail: "Маржа 20.0% ниже порога 25%",
    comment:
      "Подними маржу минимум до 25% — пересчитай себестоимость по клавиатурам, у Bazar есть скидка от 20 шт.",
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    read: false,
    page: "project",
    ctaLabel: "Открыть проект",
  },
  {
    id: "n-kp-pending-1",
    category: "kp_pending",
    forRole: ["commercial_director", "admin"],
    projectId: 1039,
    projectName: "Android",
    actorName: "Admin",
    actorRole: "PM",
    title: "Новое КП ждёт вашего согласования",
    detail: "Проект «Android» · Sulpak",
    createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    read: false,
    page: "project",
    ctaLabel: "Рассмотреть КП",
  },
  {
    id: "n-client-approved-1",
    category: "client_approved",
    forRole: ["accountant", "admin"],
    projectId: 1039,
    projectName: "Android",
    actorName: "Admin",
    actorRole: "PM",
    title: "Клиент одобрил КП по проекту «Android» — можно генерировать договор",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    read: false,
    page: "contract",
    ctaLabel: "Сгенерировать договор",
  },
  {
    id: "n-docs-confirmed-1",
    category: "docs_confirmed",
    forRole: ["pm", "admin"],
    projectId: 1039,
    projectName: "Android",
    actorName: "Айгуль С.",
    actorRole: "Бухгалтер",
    title: "Бухгалтер подтвердил документы по «Android»",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    read: false,
    page: "documents",
    ctaLabel: "Открыть документы",
  },
  {
    id: "n-stock-low-1",
    category: "stock_low",
    forRole: ["warehouse", "pm", "admin"],
    projectName: "Склад · Кар",
    title: "Заканчивается остаток на складе",
    detail: "Клавиатура A4Tech 3000N — доступно 23 шт., в резерве 2",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    read: false,
    page: "warehouse",
    ctaLabel: "Открыть склад",
  },
  {
    id: "n-kp-approved-1",
    category: "kp_approved",
    forRole: ["pm", "admin"],
    projectId: 1042,
    projectName: "beat",
    actorName: "Марат Ж.",
    actorRole: "Комдир",
    title: "Комдир одобрил КП по проекту «beat»",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    read: true,
    page: "contract",
    ctaLabel: "Перейти к договору",
  },
  {
    id: "n-goods-arrived-1",
    category: "goods_arrived",
    forRole: ["warehouse", "pm", "admin"],
    projectId: 1042,
    projectName: "beat",
    title: "Товары по проекту «beat» поступили на склад",
    detail: "Можно сформировать заявку на отгрузку",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    read: true,
    page: "warehouse",
    ctaLabel: "Сформировать отгрузку",
  },
  {
    id: "n-deadline-1",
    category: "deadline",
    forRole: ["pm", "admin"],
    projectId: 1051,
    projectName: "eeeee",
    title: "Проект «eeeee» близок к дедлайну",
    detail: "Осталось 6 дней · этап «Ожидание подписания»",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    read: true,
    page: "dashboard",
    ctaLabel: "Открыть проект",
  },
  {
    id: "n-contract-signed-1",
    category: "contract_signed",
    forRole: ["pm", "admin", "commercial_director"],
    projectId: 1039,
    projectName: "Android",
    actorName: "Sulpak",
    actorRole: "Клиент",
    title: "Договор по проекту «Android» подписан",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    read: true,
    page: "procurement",
    ctaLabel: "Перейти к закупкам",
  },
  ...uploadDerived,
];
