import type { SystemNotification } from "../data/systemNotifications";

const API_BASE = "http://localhost:8000/api/v1"; // TODO: замените на общую константу, если она уже есть в api/api.ts

export async function fetchNotifications(unreadOnly = false): Promise<SystemNotification[]> {
  const res = await fetch(`${API_BASE}/notifications/?unread_only=${unreadOnly}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Не удалось загрузить уведомления");
  return res.json();
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Не удалось отметить уведомление прочитанным");
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/read-all`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Не удалось отметить все уведомления прочитанными");
}

/** WS с реальным временем. Возвращает функцию отключения — вызвать в cleanup эффекта. */
export function connectNotificationsSocket(
  onNotification: (n: SystemNotification) => void,
): () => void {
  const wsUrl = API_BASE.replace(/^http/, "ws") + "/notifications/ws";
  const socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    try {
      onNotification(JSON.parse(event.data) as SystemNotification);
    } catch {
      // игнорируем нераспарсиваемые сообщения
    }
  };

  return () => socket.close();
}