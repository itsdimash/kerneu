import axios from "axios";
import { api } from "./api";

// ==========================================
// Партнёрские заявки на склад.
//
// Партнёр = компания (Client): пользователи одной компании видят заявки друг
// друга. Партнёр ходит в /partner/*, внутренние роли (commercial_director,
// warehouse, admin) — в /partner-requests/*. Роль "partner" в union Role
// сознательно не добавлена (см. isPartnerRole в App.tsx).
// ==========================================

export type PartnerRequestStatus =
  | "pending_director"
  | "approved"
  | "issued"
  | "rejected"
  | "cancelled";

export const PARTNER_REQUEST_STATUSES: PartnerRequestStatus[] = [
  "pending_director",
  "approved",
  "issued",
  "rejected",
  "cancelled",
];

export const PARTNER_STATUS_LABEL: Record<PartnerRequestStatus, string> = {
  pending_director: "Отправлена",
  approved: "Одобрена",
  issued: "Выдана",
  rejected: "Отклонена",
  cancelled: "Отменена",
};

export interface PartnerProduct {
  id: number;
  name: string;
  unit: string | null;
  available_quantity: number;
}

// Остаток товара в каталоге партнёра. Резерва, брака, поставщиков и цен
// в ответе нет — и показывать их партнёру нельзя.
export interface PartnerStockWarehouse {
  warehouse_id: number;
  warehouse_name: string;
  available_quantity: number;
}

export interface PartnerStockItem {
  product_id: number;
  name: string;
  unit: string | null;
  available_quantity: number;
  warehouses: PartnerStockWarehouse[];
}

export interface PartnerUserRef {
  id: number;
  name: string;
}

export interface PartnerRequestItem {
  /** id позиции заявки — его передаём в item_ids при частичной выдаче */
  id: number;
  product_id: number;
  name: string;
  unit: string | null;
  quantity: number;
  /** Когда позиция выдана; null — ещё не выдана */
  issued_at: string | null;
}

// Заявка глазами партнёра: без складов, цен и поставщиков.
export interface PartnerRequest {
  id: number;
  // Название проекта партнёра; null у старых заявок, созданных до появления поля.
  project_name: string | null;
  status: PartnerRequestStatus;
  comment: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string | null;
  decided_at: string | null;
  issued_at: string | null;
  created_by: PartnerUserRef | null;
  /** Сколько позиций в заявке и сколько из них уже выдано (частичная выдача) */
  items_count: number;
  issued_items_count: number;
  items: PartnerRequestItem[];
}

export interface PartnerRequestAllocation {
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
}

export interface PartnerRequestAdminItem extends PartnerRequestItem {
  allocations: PartnerRequestAllocation[];
  // Только во внутренних ответах (/partner-requests*); партнёру имя сотрудника склада не отдаётся.
  issued_by?: PartnerUserRef | null;
}

// Заявка для внутренних ролей: плюс компания, кто решил/выдал и раскладка по складам.
export interface PartnerRequestAdmin extends Omit<PartnerRequest, "items"> {
  client: { id: number; client_name: string };
  decided_by: PartnerUserRef | null;
  issued_by: PartnerUserRef | null;
  items: PartnerRequestAdminItem[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const PROJECT_NAME_MIN = 2;
export const PROJECT_NAME_MAX = 200;

export interface CreatePartnerRequestPayload {
  /** Обязательно: после обрезки пробелов 2..200 символов */
  project_name: string;
  comment?: string;
  items: { product_id: number; quantity: number }[];
}

// ------------------------------------------
// Ошибки
// ------------------------------------------

export interface InsufficientStockItem {
  product_id: number;
  name: string;
  requested: number;
  available: number;
}

export interface StockInconsistentItem {
  product_id: number;
  name: string;
  warehouse_id: number;
  warehouse_name: string;
  required: number;
  actual: number;
  reserved: number;
}

// Ошибка валидации по конкретному полю тела запроса (loc → последнее имя).
export interface PartnerValidationField {
  field: string;
  message: string;
}

export type PartnerErrorBody =
  | { code: "insufficient_stock"; message: string; items: InsufficientStockItem[] }
  | { code: "stock_inconsistent"; message: string; items: StockInconsistentItem[] }
  | { code: "invalid_status"; message: string; current_status: PartnerRequestStatus | null }
  | { code: "unknown_product" | "product_not_allowed"; message: string; product_ids: number[] }
  // Пользователь partner не привязан к компании (403).
  | { code: "item_already_issued"; message: string; items: number[] }
  | { code: "unknown_item"; message: string; item_ids: number[] }
  | { code: "partially_issued"; message: string; issued_items_count: number; items_count: number }
  | { code: "no_company"; message: string }
  // Стандартный 422 FastAPI со списком ошибок валидации.
  | { code: "validation_error"; message: string; fields: PartnerValidationField[] }
  | { code: "unknown"; message: string };

export class PartnerApiError extends Error {
  readonly status: number | null;
  readonly body: PartnerErrorBody;

  constructor(status: number | null, body: PartnerErrorBody) {
    super(body.message);
    this.name = "PartnerApiError";
    this.status = status;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStatus(value: unknown): PartnerRequestStatus | null {
  return PARTNER_REQUEST_STATUSES.find((s) => s === value) ?? null;
}

function parseInsufficientItems(value: unknown): InsufficientStockItem[] {
  if (!Array.isArray(value)) return [];
  const result: InsufficientStockItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const productId = asNumber(raw.product_id);
    if (productId === null) continue;
    result.push({
      product_id: productId,
      name: asString(raw.name) ?? `Товар №${productId}`,
      requested: asNumber(raw.requested) ?? 0,
      available: asNumber(raw.available) ?? 0,
    });
  }
  return result;
}

function parseInconsistentItems(value: unknown): StockInconsistentItem[] {
  if (!Array.isArray(value)) return [];
  const result: StockInconsistentItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const productId = asNumber(raw.product_id);
    if (productId === null) continue;
    const warehouseId = asNumber(raw.warehouse_id) ?? 0;
    result.push({
      product_id: productId,
      name: asString(raw.name) ?? `Товар №${productId}`,
      warehouse_id: warehouseId,
      warehouse_name: asString(raw.warehouse_name) ?? `Склад №${warehouseId}`,
      required: asNumber(raw.required) ?? 0,
      actual: asNumber(raw.actual) ?? 0,
      reserved: asNumber(raw.reserved) ?? 0,
    });
  }
  return result;
}

function parseProductIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === "number");
}

const FALLBACK_MESSAGE = "Не удалось выполнить запрос. Попробуйте ещё раз.";

// Единый разбор ошибок: {"detail": {"code", "message", ...}}, строковый
// detail (403 «Пользователь не привязан к компании», 404 и т.п.) и стандартный
// FastAPI 422 — detail списком объектов {loc, msg, type}.
export function parsePartnerError(error: unknown): PartnerApiError {
  if (error instanceof PartnerApiError) return error;

  if (!axios.isAxiosError(error)) {
    return new PartnerApiError(null, {
      code: "unknown",
      message: error instanceof Error && error.message ? error.message : FALLBACK_MESSAGE,
    });
  }

  const status = error.response?.status ?? null;
  const data: unknown = error.response?.data;
  const detail: unknown = isRecord(data) ? data.detail : undefined;

  if (isRecord(detail)) {
    const code = asString(detail.code);
    const message = asString(detail.message);

    switch (code) {
      case "insufficient_stock":
        return new PartnerApiError(status, {
          code,
          message: message ?? "Недостаточно товара на складе",
          items: parseInsufficientItems(detail.items),
        });
      case "stock_inconsistent":
        return new PartnerApiError(status, {
          code,
          message: message ?? "Остатки на складе не совпадают с резервом",
          items: parseInconsistentItems(detail.items),
        });
      case "invalid_status":
        return new PartnerApiError(status, {
          code,
          message: message ?? "Статус заявки уже изменился",
          current_status: asStatus(detail.current_status),
        });
      case "item_already_issued":
        return new PartnerApiError(status, {
          code,
          message: message ?? "Часть позиций уже выдана",
          items: parseProductIds(detail.items),
        });
      case "unknown_item":
        return new PartnerApiError(status, {
          code,
          message: message ?? "Позиции не найдены в заявке",
          item_ids: parseProductIds(detail.item_ids),
        });
      case "partially_issued":
        return new PartnerApiError(status, {
          code,
          message: message ?? "Часть позиций уже выдана — резерв снять нельзя",
          issued_items_count: asNumber(detail.issued_items_count) ?? 0,
          items_count: asNumber(detail.items_count) ?? 0,
        });
      case "unknown_product":
      case "product_not_allowed":
        return new PartnerApiError(status, {
          code,
          message: message ?? "Товар недоступен для заказа",
          product_ids: parseProductIds(detail.product_ids),
        });
      default:
        return new PartnerApiError(status, { code: "unknown", message: message ?? FALLBACK_MESSAGE });
    }
  }

  if (Array.isArray(detail)) {
    const fields: PartnerValidationField[] = [];
    for (const entry of detail) {
      if (!isRecord(entry)) continue;
      const msg = asString(entry.msg);
      if (msg === null) continue;
      const loc = Array.isArray(entry.loc) ? entry.loc : [];
      // Ключ поля — первое строковое имя после "body" (напр. ["body","project_name"]).
      const field = loc.find((part): part is string => typeof part === "string" && part !== "body") ?? "";
      fields.push({ field, message: msg });
    }
    return new PartnerApiError(status, {
      code: "validation_error",
      message:
        fields.length > 0 ? fields.map((f) => f.message).join("; ") : "Проверьте правильность заполнения заявки",
      fields,
    });
  }

  const text = asString(detail);
  if (status === 403 && text && /не привязан/i.test(text)) {
    return new PartnerApiError(status, { code: "no_company", message: text });
  }

  return new PartnerApiError(status, { code: "unknown", message: text ?? FALLBACK_MESSAGE });
}

async function call<T>(request: Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await request;
    return data;
  } catch (error) {
    throw parsePartnerError(error);
  }
}

// ------------------------------------------
// Партнёр: /partner/*
// ------------------------------------------

export const PARTNER_MAX_ITEMS = 50;

export function fetchPartnerProducts(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<PartnerProduct[]> {
  return call(api.get<PartnerProduct[]>("/partner/products", { params: { q: query, limit }, signal }));
}

export type PartnerStockSort = "name_asc" | "name_desc" | "available_desc" | "available_asc";

export const PARTNER_STOCK_SORTS: PartnerStockSort[] = ["name_asc", "name_desc", "available_desc", "available_asc"];

export interface PartnerStocksQuery {
  q?: string;
  /** По умолчанию на бэкенде name_asc */
  sort?: PartnerStockSort;
  in_stock_only: boolean;
  limit: number;
  offset: number;
}

export function fetchPartnerStocks(
  params: PartnerStocksQuery,
  signal?: AbortSignal,
): Promise<Paginated<PartnerStockItem>> {
  return call(api.get<Paginated<PartnerStockItem>>("/partner/stocks", { params, signal }));
}

export function createPartnerRequest(payload: CreatePartnerRequestPayload): Promise<PartnerRequest> {
  return call(api.post<PartnerRequest>("/partner/requests", payload));
}

export function fetchPartnerRequests(
  params: { limit: number; offset: number },
): Promise<Paginated<PartnerRequest>> {
  return call(api.get<Paginated<PartnerRequest>>("/partner/requests", { params }));
}

export function fetchPartnerRequest(id: number): Promise<PartnerRequest> {
  return call(api.get<PartnerRequest>(`/partner/requests/${id}`));
}

export function cancelPartnerRequest(id: number): Promise<PartnerRequest> {
  return call(api.post<PartnerRequest>(`/partner/requests/${id}/cancel`));
}

// ------------------------------------------
// Внутренние роли: /partner-requests/*
// ------------------------------------------

export interface PartnerRequestsAdminQuery {
  status?: PartnerRequestStatus;
  client_id?: number;
  /** Поиск по названию проекта и компании */
  q?: string;
  /** Заявки, у которых выдана хотя бы одна позиция (кроме rejected и cancelled) */
  has_issued?: boolean;
  limit: number;
  offset: number;
}

export function fetchPartnerRequestsAdmin(
  params: PartnerRequestsAdminQuery,
): Promise<Paginated<PartnerRequestAdmin>> {
  return call(api.get<Paginated<PartnerRequestAdmin>>("/partner-requests", { params }));
}

export function fetchPartnerRequestAdmin(id: number): Promise<PartnerRequestAdmin> {
  return call(api.get<PartnerRequestAdmin>(`/partner-requests/${id}`));
}

export function approvePartnerRequest(id: number): Promise<PartnerRequestAdmin> {
  return call(api.post<PartnerRequestAdmin>(`/partner-requests/${id}/approve`));
}

export function rejectPartnerRequest(id: number, reason: string): Promise<PartnerRequestAdmin> {
  return call(api.post<PartnerRequestAdmin>(`/partner-requests/${id}/reject`, { reason }));
}

export function releasePartnerRequest(id: number, reason?: string): Promise<PartnerRequestAdmin> {
  return call(api.post<PartnerRequestAdmin>(`/partner-requests/${id}/release`, { reason: reason ?? null }));
}

// itemIds — выдать выбранные позиции целиком; без них выдаются все оставшиеся.
export function issuePartnerRequest(id: number, itemIds?: number[]): Promise<PartnerRequestAdmin> {
  return call(
    api.post<PartnerRequestAdmin>(
      `/partner-requests/${id}/issue`,
      itemIds && itemIds.length > 0 ? { item_ids: itemIds } : undefined,
    ),
  );
}

export function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

// «Список» на выдачу (.docx) строится на бэкенде. По умолчанию — только невыданные позиции;
// warehouse_id ограничивает список одним складом (кнопки «Список KAR/AB»).
// Скачивание — по образцу downloadShipmentChecklist (cookie, имя из Content-Disposition).
// 404 (нечего выдавать) пробрасывается как есть — см. isNotFoundError.
export async function downloadPartnerRequestList(
  id: number,
  options?: { warehouseId?: number; includeIssued?: boolean; projectName?: string | null; warehouseName?: string },
): Promise<void> {
  const response = await api.get(`/partner-requests/${id}/list`, {
    responseType: "blob",
    params: {
      ...(options?.warehouseId != null ? { warehouse_id: options.warehouseId } : {}),
      ...(options?.includeIssued ? { include_issued: true } : {}),
    },
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const baseName = options?.projectName?.trim()
    ? `Список на выдачу ${options.projectName}`
    : `Список на выдачу заявка ${id}`;
  let filename = options?.warehouseName ? `${baseName} ${options.warehouseName}.docx` : `${baseName}.docx`;
  const disposition: unknown = response.headers["content-disposition"];
  if (typeof disposition === "string" && disposition.includes("filename*=UTF-8''")) {
    filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
