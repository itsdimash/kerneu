import axios from "axios";
import { api } from "../../api/api";
import type {
  AiAttachment,
  AiSession,
  AiTableRow,
  ApiErrorInfo,
  ChatResult,
  ExtractedDocument,
} from "./types";

/* ---------- ошибки ---------- */

function messageFromUnknown(value: unknown): { message: string; code?: string } {
  if (typeof value === "string") return { message: value };
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => messageFromUnknown(item).message)
      .filter((part) => part.length > 0);
    return { message: parts.join("; ") };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : undefined;
    for (const field of ["message", "msg", "detail", "error"]) {
      if (field in record) {
        const nested = messageFromUnknown(record[field]);
        if (nested.message) return { message: nested.message, code: code ?? nested.code };
      }
    }
    return { message: "", code };
  }
  return { message: "" };
}

/** Читает ошибку backend: строка, {code, message}, FastAPI detail (строка/объект/массив). */
export function parseApiError(error: unknown): ApiErrorInfo {
  if (axios.isCancel(error)) return { message: "", kind: "canceled" };
  if (!axios.isAxiosError(error)) {
    return { message: error instanceof Error ? error.message : "", kind: "generic" };
  }
  const status = error.response?.status;
  if (!error.response) return { message: "", kind: "network" };

  const { message, code } = messageFromUnknown(error.response.data);
  const kind = status === 413 ? "too_large" : status === 415 ? "unsupported" : "generic";
  return { status, code, message, kind };
}

/* ---------- нормализация ---------- */

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeAttachments(raw: unknown, fetchedAt: number = Date.now()): AiAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      type: typeof item.type === "string" ? item.type : "file",
      name: typeof item.name === "string" ? item.name : "file",
      key: typeof item.key === "string" ? item.key : "",
      mime: typeof item.mime === "string" ? item.mime : "",
      size: typeof item.size === "number" ? item.size : 0,
      url: typeof item.url === "string" ? item.url : "",
      fetchedAt,
    }));
}

interface RawChatResponse {
  session_id: number;
  text: string;
  task_type?: string | null;
  model_used?: string | null;
  image_model_used?: string | null;
  confidence?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  latency_ms?: number | null;
  table?: AiTableRow[] | null;
  attachments?: unknown;
  needs_review?: boolean | null;
}

function normalizeChat(raw: RawChatResponse): ChatResult {
  return {
    sessionId: raw.session_id,
    text: raw.text ?? "",
    taskType: raw.task_type ?? null,
    modelUsed: raw.model_used ?? null,
    imageModelUsed: raw.image_model_used ?? null,
    confidence: toNumberOrNull(raw.confidence),
    tokensIn: toNumberOrNull(raw.tokens_in),
    tokensOut: toNumberOrNull(raw.tokens_out),
    latencyMs: toNumberOrNull(raw.latency_ms),
    table: raw.table ?? null,
    attachments: normalizeAttachments(raw.attachments),
    needsReview: Boolean(raw.needs_review),
  };
}

/* ---------- сессии ---------- */

export async function listSessions(): Promise<AiSession[]> {
  const response = await api.get<AiSession[]>("/ai/sessions");
  return response.data;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  modelUsed: string | null;
  imageModelUsed: string | null;
  taskType: string | null;
  table: AiTableRow[] | null;
  attachments: AiAttachment[];
  needsReview: boolean;
}

export async function getSessionMessages(sessionId: number): Promise<HistoryMessage[]> {
  const response = await api.get<
    {
      role: string;
      content: string;
      model_used: string | null;
      image_model_used?: string | null;
      task_type: string | null;
      created_at: string;
      table: AiTableRow[] | null;
      attachments?: unknown;
      needs_review?: boolean | null;
    }[]
  >(`/ai/sessions/${sessionId}/messages`);

  const fetchedAt = Date.now();
  return response.data.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    modelUsed: m.model_used,
    imageModelUsed: m.image_model_used ?? null,
    taskType: m.task_type,
    table: m.table,
    attachments: normalizeAttachments(m.attachments, fetchedAt),
    needsReview: Boolean(m.needs_review),
  }));
}

export async function deleteSession(sessionId: number): Promise<void> {
  await api.delete(`/ai/sessions/${sessionId}`);
}

/** PATCH /ai/sessions/{id} {title} (ERP-прокси). */
export async function renameSession(sessionId: number, title: string): Promise<void> {
  await api.patch(`/ai/sessions/${sessionId}`, { title });
}

/* ---------- чат ---------- */

export interface SendChatParams {
  prompt: string;
  sessionId: number | null;
  model: string | null;
  /** Ключи файлов из /ai/documents/extract — только для привязки к сообщению. */
  attachmentKeys?: string[];
  signal?: AbortSignal;
}

export async function sendChat({
  prompt,
  sessionId,
  model,
  attachmentKeys,
  signal,
}: SendChatParams): Promise<ChatResult> {
  const response = await api.post<RawChatResponse>(
    "/ai/chat",
    {
      prompt,
      session_id: sessionId,
      model,
      ...(attachmentKeys && attachmentKeys.length > 0 ? { attachment_keys: attachmentKeys } : {}),
    },
    { signal },
  );
  return normalizeChat(response.data);
}

export async function sendChatMultimodal({
  prompt,
  sessionId,
  model,
  attachmentKeys,
  files,
  signal,
}: SendChatParams & { files: File[] }): Promise<ChatResult> {
  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("session_id", sessionId != null ? String(sessionId) : "");
  if (model) formData.append("model", model);
  attachmentKeys?.forEach((key) => formData.append("attachment_keys", key));
  files.forEach((file) => formData.append("files", file));

  const response = await api.post<RawChatResponse>("/ai/chat/multimodal", formData, { signal });
  return normalizeChat(response.data);
}

/* ---------- документы и файлы ---------- */

export async function extractDocument(
  file: File,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<ExtractedDocument> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<{
    filename: string;
    text: string;
    truncated: boolean;
    char_count: number;
    file_url: string;
    file_key?: string;
  }>("/ai/documents/extract", formData, {
    signal: options.signal,
    onUploadProgress: (event) => {
      if (!event.total) return;
      options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });

  return {
    filename: response.data.filename,
    text: response.data.text,
    truncated: response.data.truncated,
    charCount: response.data.char_count,
    fileUrl: response.data.file_url,
    fileKey: response.data.file_key ?? "",
  };
}

/** download=true — ссылка с Content-Disposition: attachment (браузер скачивает, а не открывает). */
export async function refreshFileUrl(
  key: string,
  options: { download?: boolean } = {},
): Promise<{ url: string; expiresIn: number | null }> {
  const response = await api.get<{ url: string; expires_in?: number }>("/ai/files/url", {
    params: options.download ? { key, download: true } : { key },
  });
  return { url: response.data.url, expiresIn: toNumberOrNull(response.data.expires_in) };
}
