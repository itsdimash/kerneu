import axios from "axios";
import { api } from "./api";

// Аутентификация идёт через cookie, общую для всего браузера: если в соседней
// вкладке вошли другим пользователем, эта вкладка продолжает считать себя прежним, а
// запросы идут с чужой cookie. Здесь вкладка перепроверяет /auth/me и, если пользователь
// другой (или сессии нет), выходит на страницу входа — БЕЗ вызова /auth/logout, иначе
// мы разлогинили бы нового пользователя в соседней вкладке.

export const SESSION_CHANGED_MESSAGE = "Сессия изменилась в другой вкладке. Войдите заново.";

type KnownUser = { id: number; role: string };

let knownUser: KnownUser | null = null;
let handler: ((message: string) => void) | null = null;
let inFlight: Promise<void> | null = null;
let lastCheckAt = 0;
let installed = false;

const INTERCEPTOR_MIN_INTERVAL_MS = 3_000;
const VISIBILITY_MIN_INTERVAL_MS = 10_000;

// Последний ответ /auth/me, полученный проверкой, пока пользователь вкладки ещё не известен
// (запрос страницы мог упасть раньше, чем отработал getMe): сравним, как только он станет известен.
let unmatchedMe: { user: KnownUser; at: number } | null = null;
const UNMATCHED_TTL_MS = 30_000;

export function setKnownUser(user: KnownUser | null): void {
  knownUser = user;
  const pending = unmatchedMe;
  unmatchedMe = null;
  if (user && pending && Date.now() - pending.at < UNMATCHED_TTL_MS && (pending.user.id !== user.id || pending.user.role !== user.role)) {
    trigger(SESSION_CHANGED_MESSAGE);
  }
}

// Обработчик «сессия изменилась» регистрируется, пока пользователь вошёл; null — выключает защиту.
export function setSessionChangedHandler(next: ((message: string) => void) | null): void {
  handler = next;
}

function trigger(message: string): void {
  knownUser = null;
  handler?.(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function check(): Promise<void> {
  try {
    // Голый axios, а не api: перехватчик api на 401/403 не должен зациклиться сам на себе.
    const { data } = await axios.get<unknown>("/api/v1/auth/me", { withCredentials: true, timeout: 15_000 });
    if (isRecord(data) && typeof data.id === "number" && typeof data.role === "string") {
      if (!knownUser) unmatchedMe = { user: { id: data.id, role: data.role }, at: Date.now() };
      else if (data.id !== knownUser.id || data.role !== knownUser.role) trigger(SESSION_CHANGED_MESSAGE);
    }
  } catch (error) {
    // Только 401 означает «сессии нет»; сеть/5xx/таймаут разлогинивать не должны.
    if (axios.isAxiosError(error) && error.response?.status === 401) trigger(SESSION_CHANGED_MESSAGE);
  }
}

// Одновременные проверки схлопываются в одну; повторные в пределах minIntervalMs пропускаются.
export function verifySession(minIntervalMs = 0): Promise<void> {
  if (!handler) return Promise.resolve();
  if (inFlight) return inFlight;
  if (minIntervalMs > 0 && Date.now() - lastCheckAt < minIntervalMs) return Promise.resolve();
  lastCheckAt = Date.now();
  inFlight = check().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Принудительный выход на страницу входа («Войти заново» на экранах ошибок). */
export function forceRelogin(message = "Сессия изменилась. Войдите заново."): void {
  trigger(message);
}

// Один раз ставит перехватчик ответов и слушатель возврата на вкладку.
export function installSessionGuard(): void {
  if (installed) return;
  installed = true;

  api.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const url = error.config?.url ?? "";
        // Обычный 403 «нет прав» не разлогинивает: выход только если /auth/me покажет другого пользователя или 401.
        if ((status === 401 || status === 403) && !url.startsWith("/auth/")) {
          void verifySession(INTERCEPTOR_MIN_INTERVAL_MS);
        }
      }
      return Promise.reject(error);
    },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void verifySession(VISIBILITY_MIN_INTERVAL_MS);
  });
}
