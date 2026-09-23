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
};

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
      setItems((prev) => [notification, ...prev]);
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

  return (
    <NotificationsContext.Provider value={{ items, markRead, markAllRead, lastArrived }}>
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
