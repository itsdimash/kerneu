import axios from "axios";

export type LoadFailure = {
  /** HTTP-статус, если ответ был; null — сети нет или таймаут */
  status: number | null;
  message: string;
};

// Короткое человекочитаемое описание ошибки загрузки (для экранов с кнопкой «Повторить»).
export function describeLoadError(error: unknown): LoadFailure {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    if (status === null) {
      return {
        status,
        message: error.code === "ECONNABORTED" ? "Сервер не отвечает. Попробуйте ещё раз." : "Нет соединения с сервером.",
      };
    }
    const detail: unknown = error.response?.data?.detail;
    const text = typeof detail === "string" && detail.trim() ? detail : null;
    return { status, message: text ? `${text} (код ${status})` : `Код ответа: ${status}` };
  }
  return { status: null, message: error instanceof Error && error.message ? error.message : "Неизвестная ошибка." };
}

export const isAuthFailure = (failure: LoadFailure): boolean => failure.status === 401 || failure.status === 403;
