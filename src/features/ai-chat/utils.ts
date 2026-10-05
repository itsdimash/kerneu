import type { AiSession, ApiErrorInfo } from "./types";

export function parseBackendTimestamp(iso: string): Date {
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTimezone ? iso : `${iso}Z`);
}

export function formatSessionTime(iso: string): string {
  const date = parseBackendTimestamp(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(".", ",")} МБ`;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type FileKind = "pptx" | "docx" | "xlsx" | "pdf" | "image" | "other";

export function fileKind(mime: string, name = ""): FileKind {
  const m = (mime || "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.includes("presentationml") || m.includes("powerpoint") || ext === "pptx" || ext === "ppt") return "pptx";
  if (m.includes("wordprocessingml") || m === "application/msword" || ext === "docx" || ext === "doc") return "docx";
  if (m.includes("spreadsheetml") || m.includes("ms-excel") || ext === "xlsx" || ext === "xls") return "xlsx";
  return "other";
}

/** Тип вложения: по mime/расширению, а если они пустые — по полю type от backend. */
export function attachmentKind(attachment: { type: string; mime: string; name: string }): FileKind {
  const kind = fileKind(attachment.mime, attachment.name);
  return kind === "other" && attachment.type === "image" ? "image" : kind;
}

export function isHttpUrl(value: string | undefined | null): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export type SessionGroupLabel = "Сегодня" | "Вчера" | "7 дней" | "Раньше";

export function groupSessionsByDate(
  sessions: AiSession[],
  now: Date = new Date(),
): { label: SessionGroupLabel; sessions: AiSession[] }[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const buckets: Record<SessionGroupLabel, AiSession[]> = {
    Сегодня: [],
    Вчера: [],
    "7 дней": [],
    Раньше: [],
  };

  const sorted = [...sessions].sort(
    (a, b) => parseBackendTimestamp(b.updated_at).getTime() - parseBackendTimestamp(a.updated_at).getTime(),
  );

  for (const session of sorted) {
    const time = parseBackendTimestamp(session.updated_at).getTime();
    if (Number.isNaN(time) || time < startOfToday - 6 * DAY) buckets["Раньше"].push(session);
    else if (time >= startOfToday) buckets["Сегодня"].push(session);
    else if (time >= startOfToday - DAY) buckets["Вчера"].push(session);
    else buckets["7 дней"].push(session);
  }

  return (["Сегодня", "Вчера", "7 дней", "Раньше"] as const)
    .map((label) => ({ label, sessions: buckets[label] }))
    .filter((group) => group.sessions.length > 0);
}

const DOCUMENT_PROMPT_PREFIX = "Вот текст документа «";
const QUESTION_MARKER = "\n\n---\n\nВопрос пользователя: ";

export function buildPromptWithDocuments(
  prompt: string,
  documents: { filename: string; text: string; truncated: boolean }[],
): string {
  if (documents.length === 0) return prompt;
  const blocks = documents.map(
    (doc) => `${DOCUMENT_PROMPT_PREFIX}${doc.filename}»${doc.truncated ? " (обрезан по лимиту)" : ""}:\n\n${doc.text}`,
  );
  return `${blocks.join("\n\n---\n\n")}${QUESTION_MARKER}${prompt}`;
}

/** Из сохранённого в истории промпта (с вшитым текстом документов) достаёт сам вопрос. */
export function extractUserQuestion(content: string): string {
  if (!content.startsWith(DOCUMENT_PROMPT_PREFIX)) return content;
  const index = content.lastIndexOf(QUESTION_MARKER);
  return index === -1 ? content : content.slice(index + QUESTION_MARKER.length);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function uploadErrorText(info: ApiErrorInfo, filename: string): string {
  switch (info.kind) {
    case "too_large":
      return `«${filename}»: файл слишком большой для сервера.`;
    case "unsupported":
      return `«${filename}»: формат не поддерживается. Допустимы .docx, .pdf, .xlsx.`;
    case "network":
      return `«${filename}»: нет связи с сервером.`;
    default:
      return `«${filename}»: не удалось прочитать файл${info.message ? ` (${info.message})` : ""}.`;
  }
}

export function chatErrorText(info: ApiErrorInfo): string {
  switch (info.kind) {
    case "too_large":
      return "Слишком большой объём вложений. Уберите часть файлов и повторите.";
    case "unsupported":
      return "Один из файлов в неподдерживаемом формате.";
    case "network":
      return "Нет связи с сервером. Проверьте соединение и повторите.";
    default:
      return info.message || "Не удалось получить ответ от AI. Попробуйте ещё раз.";
  }
}
