import type { Role } from "../../types";

export interface AiTableRow {
  [key: string]: unknown;
}

export type MessageStatus = "pending" | "done" | "error";

export interface AiAttachment {
  /** "image" | "file" | … — как отдаёт backend; для логики используем mime. */
  type: string;
  name: string;
  key: string;
  mime: string;
  size: number;
  url: string;
  /** Когда получен url (мс). По нему решаем, не протух ли presigned URL. */
  fetchedAt: number;
  /** Локальное вложение (blob:/file_url до ответа backend) — url не обновляется. */
  local?: boolean;
}

export interface AiMessage {
  /** Клиентский id: ключ в списке и адрес для точечных обновлений. */
  id: string;
  role: "user" | "assistant";
  content: string;
  displayedContent: string;
  status: MessageStatus;
  error?: string | null;
  modelUsed?: string | null;
  taskType?: string | null;
  confidence?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  table?: AiTableRow[] | null;
  attachments: AiAttachment[];
  needsReview: boolean;
  /** Ответ пришёл в этой сессии (не из истории) — анимируем вход. */
  isNew?: boolean;
}

export interface AiSession {
  id: number;
  title: string;
  updated_at: string;
}

export interface ChatResult {
  sessionId: number;
  text: string;
  taskType: string | null;
  modelUsed: string | null;
  confidence: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  table: AiTableRow[] | null;
  attachments: AiAttachment[];
  needsReview: boolean;
}

export interface ExtractedDocument {
  filename: string;
  text: string;
  truncated: boolean;
  charCount: number;
  fileUrl: string;
  /** Ключ файла в хранилище (file_key из extract): для attachment_keys и обновления ссылки. */
  fileKey: string;
}

export interface AttachedDocumentItem {
  kind: "document";
  id: string;
  filename: string;
  size: number;
  status: "uploading" | "ready";
  /** 0..100 */
  progress: number;
  text: string;
  truncated: boolean;
  charCount: number;
  fileUrl: string;
  fileKey: string;
}

export interface AttachedImageItem {
  kind: "image";
  id: string;
  file: File;
  previewUrl: string;
}

export type AttachedItem = AttachedDocumentItem | AttachedImageItem;

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Пустая строка = шаблон ещё не задан, карточка не показывается. */
  promptTemplate: string;
  requiresFile: boolean;
  /** Значение для атрибута accept у выбора файла. */
  accept?: string;
  /** Не задано = доступно всем ролям. */
  roles?: Role[];
}

export type ApiErrorKind = "too_large" | "unsupported" | "network" | "canceled" | "generic";

export interface ApiErrorInfo {
  status?: number;
  code?: string;
  /** Текст от backend (строка или message из {code, message}); может быть пустым. */
  message: string;
  kind: ApiErrorKind;
}
