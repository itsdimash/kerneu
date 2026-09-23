import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Role, Page } from "../types";
import {
  type SystemNotification,
  type NotificationCategory,
} from "../data/systemNotifications";
import {
  fetchNotifications,
  markNotificationRead,
  connectNotificationsSocket,
} from "../api/notifications";
import { NotificationCard } from "../app/components/common/NotificationCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../app/components/ui/tabs";

export type ApprovalsTabId = "projects" | "procurement" | "documents";
type TabId = ApprovalsTabId;

const TAB_CATEGORIES: Record<TabId, NotificationCategory[]> = {
  projects: [
    "kp_pending",
    "warehouse_request_pending",
    "client_approved",
    "kp_approved",
    "kp_rejected",
    "warehouse_request_approved",
    "warehouse_request_rejected",
  ],
  procurement: [
    "invoice_pending_director",
    "invoice_approved",
    "invoice_rejected",
    "invoice_sent_to_income",
  ],
  documents: ["docs_pending_director", "docs_approved", "docs_rejected"],
};

const TAB_LABEL: Record<TabId, string> = {
  projects: "Проекты",
  procurement: "Закупки",
  documents: "Документы",
};

/** Category -> tab, for callers that navigate here from a specific
 *  notification (e.g. the bell's CTA) and want to land on the right tab. */
export function approvalsTabForCategory(category: NotificationCategory): ApprovalsTabId {
  for (const tabId of Object.keys(TAB_CATEGORIES) as ApprovalsTabId[]) {
    if (TAB_CATEGORIES[tabId].includes(category)) return tabId;
  }
  return "projects";
}

// Вкладка "Проекты" делится на "ожидают решения" и "обработаны" — решение
// теперь всегда принимается на странице проекта, здесь только читаем статус.
type StatusBucket = "pending" | "resolved";

const STATUS_BUCKET_LABEL: Record<StatusBucket, string> = {
  pending: "Ожидают решения",
  resolved: "Обработаны",
};

const RESOLVED_CATEGORIES = new Set<NotificationCategory>([
  "kp_approved",
  "kp_rejected",
  "warehouse_request_approved",
  "warehouse_request_rejected",
]);

function statusBucket(category: NotificationCategory): StatusBucket {
  return RESOLVED_CATEGORIES.has(category) ? "resolved" : "pending";
}

// Старые тестовые/забытые заявки не должны топить свежие сверху списка —
// всё, что старше двух недель, сворачивается под раскрывающуюся кнопку.
const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

function isStale(n: SystemNotification): boolean {
  return Date.now() - new Date(n.createdAt).getTime() > STALE_AFTER_MS;
}

/** Список карточек, где всё старше 14 дней спрятано за "Показать ещё N
 *  старых" — раскрывается на месте, ничего не уходит на бэкенд. */
function NotificationList({
  items,
  onCta,
  onMarkRead,
}: {
  items: SystemNotification[];
  onCta: (n: SystemNotification) => void;
  onMarkRead: (id: string) => void;
}) {
  const [showStale, setShowStale] = useState(false);

  const fresh = useMemo(() => items.filter((n) => !isStale(n)), [items]);
  const stale = useMemo(() => items.filter((n) => isStale(n)), [items]);

  return (
    <>
      {fresh.map((n) => (
        <NotificationCard key={n.id} notification={n} onCta={onCta} onMarkRead={onMarkRead} />
      ))}

      {stale.length > 0 && !showStale && (
        <button
          onClick={() => setShowStale(true)}
          className="flex w-full items-center justify-center gap-1.5 border-b border-border/60 px-4 py-2.5 text-[12px] font-medium text-muted-foreground transition-colors last:border-b-0 hover:bg-muted/50 hover:text-foreground"
        >
          <ChevronDown size={13} />
          Показать ещё {stale.length} старых (&gt;14 дней)
        </button>
      )}

      {showStale && stale.map((n) => (
        <NotificationCard key={n.id} notification={n} onCta={onCta} onMarkRead={onMarkRead} />
      ))}
    </>
  );
}

type Props = {
  role: Role;
  onNavigate: (p: Page) => void;
  onSelectProject?: (idOrName: number | string) => Promise<void> | void;
  initialTab?: TabId;
};

export function ApprovalsPage({ onNavigate, onSelectProject, initialTab }: Props) {
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [tab, setTab] = useState<TabId>(initialTab ?? "projects");

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch((err) => console.error("Не удалось загрузить уведомления:", err));
  }, []);

  useEffect(() => {
    return connectNotificationsSocket((notification) => {
      setItems((prev) => [notification, ...prev]);
    });
  }, []);

  function markRead(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.read) return;

    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    markNotificationRead(id).catch((err) =>
      console.error("Не удалось отметить уведомление прочитанным:", err),
    );
  }

  async function handleCta(n: SystemNotification) {
    setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read: true } : p)));
    markNotificationRead(n.id).catch((err) =>
      console.error("Не удалось отметить уведомление прочитанным:", err),
    );

    if (n.projectId && onSelectProject) {
      await onSelectProject(n.projectId);
    }
    onNavigate(n.page);
  }

  const byTab = useMemo(() => {
    const result: Record<TabId, SystemNotification[]> = { projects: [], procurement: [], documents: [] };
    for (const tabId of Object.keys(TAB_CATEGORIES) as TabId[]) {
      const categories = new Set(TAB_CATEGORIES[tabId]);
      result[tabId] = items.filter((n) => categories.has(n.category));
    }
    return result;
  }, [items]);

  const unreadByTab = useMemo(() => {
    const result: Record<TabId, number> = { projects: 0, procurement: 0, documents: 0 };
    for (const tabId of Object.keys(TAB_CATEGORIES) as TabId[]) {
      result[tabId] = byTab[tabId].filter((n) => !n.read).length;
    }
    return result;
  }, [byTab]);

  // Только вкладка "Проекты" делится на секции по статусу — "Закупки" и
  // "Документы" остаются плоскими списками, как раньше.
  const projectGroups = useMemo(() => {
    const order: StatusBucket[] = ["pending", "resolved"];
    return order
      .map((key) => ({
        key,
        label: STATUS_BUCKET_LABEL[key],
        items: byTab.projects.filter((n) => statusBucket(n.category) === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [byTab]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Заявки на согласование</h1>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabId)}
        className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col px-4"
      >
        <TabsList className="mt-4 shrink-0">
          {(Object.keys(TAB_LABEL) as TabId[]).map((tabId) => (
            <TabsTrigger key={tabId} value={tabId} className="gap-1.5">
              {TAB_LABEL[tabId]}
              {unreadByTab[tabId] > 0 && (
                <span className="rounded-full bg-destructive px-1.5 text-[10.5px] font-semibold leading-[16px] text-destructive-foreground">
                  {unreadByTab[tabId]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="projects" className="min-h-0 flex-1 overflow-y-auto pb-6">
          <div className="overflow-hidden rounded-lg border border-border">
            {projectGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <p className="text-[12.5px] font-medium text-muted-foreground">Здесь пока пусто</p>
              </div>
            ) : (
              projectGroups.map((group) => (
                <section key={group.key}>
                  <div className="sticky top-0 z-[1] border-b border-border/60 bg-muted/80 px-4 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
                    {group.label}
                  </div>
                  <NotificationList items={group.items} onCta={handleCta} onMarkRead={markRead} />
                </section>
              ))
            )}
          </div>
        </TabsContent>

        {(["procurement", "documents"] as TabId[]).map((tabId) => (
          <TabsContent key={tabId} value={tabId} className="min-h-0 flex-1 overflow-y-auto pb-6">
            <div className="overflow-hidden rounded-lg border border-border">
              {byTab[tabId].length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                  <p className="text-[12.5px] font-medium text-muted-foreground">Здесь пока пусто</p>
                </div>
              ) : (
                <NotificationList items={byTab[tabId]} onCta={handleCta} onMarkRead={markRead} />
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
