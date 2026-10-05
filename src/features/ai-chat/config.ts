import type { Role } from "../../types";

export const FEATURES = {
  /** ERP-прокси PATCH /ai/sessions/{id} с {title}. */
  renameSession: true,
} as const;

const MB = 1024 * 1024;

export const LIMITS = {
  documentBytes: 50 * MB,
  imageBytes: 20 * MB,
  imagesTotalBytes: 100 * MB,
  maxImages: 10,
} as const;

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const DOCUMENT_EXTENSIONS = [".docx", ".pdf", ".xlsx"];
export const DEFAULT_ACCEPT = `${DOCUMENT_EXTENSIONS.join(",")},${IMAGE_MIME_TYPES.join(",")}`;

/** Presigned URL считаем протухшим через 25 минут после получения. */
export const URL_MAX_AGE_MS = 25 * 60 * 1000;

export const TYPEWRITER_TICK_MS = 15;
export const TYPEWRITER_TOTAL_TICKS = 120;
export const INPUT_MAX_HEIGHT_PX = 200;
export const CHAT_COLUMN_MIN_WIDTH_PX = 640;
export const CHAT_COLUMN_MAX_WIDTH_PX = 1100;
export const CHAT_COLUMN_SIDE_PADDING_PX = 48;
/** Ближе этого расстояния до низа (px) считаем, что пользователь «внизу» ленты. */
export const NEAR_BOTTOM_PX = 120;

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Администратор",
  commercial_director: "Коммерческий директор",
  pm: "Менеджер проекта",
  accountant: "Бухгалтер",
  warehouse: "Кладовщик",
};

export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "gemini-flash", label: "Gemini Flash" },
  { value: "gemini-pro", label: "Gemini Pro" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-haiku", label: "Claude Haiku" },
  { value: "claude-sonnet", label: "Claude Sonnet" },
  { value: "claude-opus", label: "Claude Opus" },
];

export const SENSITIVE_COLUMN_PATTERN = /cost|price|margin|себестоим|маржа|стоимост|прибыл/i;
