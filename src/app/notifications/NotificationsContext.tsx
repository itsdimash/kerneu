import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { type SystemNotification } from "../../data/systemNotifications";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  connectNotificationsSocket,
} from "../../api/notifications";

type NotificationsContextValue = {
  items: SystemNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Bumped to a fresh object every time a notification arrives over the
   *  WS — NOT on the initial REST load. Consumers (e.g. the sidebar's
   *  "Заявки на согласование" item) watch this to trigger a one-shot
   *  animation only for genuinely new, real-time arrivals. */
  lastArrived: SystemNotification | null;
  /** Заявка партнёра решена (одобрена/отклонена/отменена) — её копии
   *  partner_request_new перестают быть «требующими действия». Бэкенд сам
   *  переводит их в итоговую категорию с is_read=true; здесь то же самое
   *  применяется локально, не дожидаясь перезагрузки списка. */
  settlePartnerRequest: (partnerRequestId: number) => void;
};

// Итоговые категории, в которые бэкенд переводит копии partner_request_new.
const PARTNER_SETTLED_CATEGORIES = new Set<SystemNotification["category"]>([
  "partner_request_approved",
  "partner_request_rejected",
  "partner_request_cancelled",
]);

function settleLocally(items: SystemNotification[], partnerRequestId: number): SystemNotification[] {
  return items.map((n) =>
    n.category === "partner_request_new" && n.partnerRequestId === partnerRequestId && !n.read
      ? { ...n, read: true }
      : n,
  );
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Fetches + subscribes to notifications ONCE at the app shell level, so the
 *  WS connection and unread state stay alive regardless of whether
 *  NotificationBell is actually rendered for the current role (director/
 *  admin don't get a bell, but still need live counts for the sidebar). */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [lastArrived, setLastArrived] = useState<SystemNotification | null>(null);
  // Отличаем реальные WS-события от начальной REST-загрузки — сокет иногда
  // успевает подключиться раньше, чем это осмысленно для анимации.
  const loadedOnce = useRef(false);

  useEffect(() => {
    fetchNotifications()
      .then((data) => {
        setItems(data);
        loadedOnce.current = true;
      })
      .catch((err) => console.error("Не удалось загрузить уведомления:", err));
  }, []);

  useEffect(() => {
    return connectNotificationsSocket((notification) => {
      // Служебное сообщение {"type": "notification_deleted", "ids": [...]} —
      // уведомления удалены на backend (например, ПМ отменил отправку
      // проекта): убираем их из списка. Счётчик непрочитанных считается из
      // items, поэтому пересчитывается сам.
      const message = notification as unknown as { type?: string; ids?: unknown };
      if (message.type === "notification_deleted") {
        const removed = new Set(
          (Array.isArray(message.ids) ? message.ids : []).map((id) => String(id)),
        );
        if (removed.size > 0) {
          setItems((prev) => prev.filter((n) => !removed.has(String(n.id))));
        }
        return;
      }
      setItems((prev) => {
        const next = [notification, ...prev];
        return PARTNER_SETTLED_CATEGORIES.has(notification.category) && notification.partnerRequestId !== undefined
          ? settleLocally(next, notification.partnerRequestId)
          : next;
      });
      if (loadedOnce.current) {
        setLastArrived(notification);
      }
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

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllNotificationsRead().catch((err) =>
      console.error("Не удалось отметить все уведомления прочитанными:", err),
    );
  }

  function settlePartnerRequest(partnerRequestId: number) {
    setItems((prev) => settleLocally(prev, partnerRequestId));
  }

  return (
    <NotificationsContext.Provider value={{ items, markRead, markAllRead, lastArrived, settlePartnerRequest }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
