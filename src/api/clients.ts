import axios from "axios";
import { api, throwWithDetail } from "./api";

// ==========================================
// КЛИЕНТЫ — страница «Клиенты». Контракт: GET/PATCH /clients, контакты
// клиента — /clients/{id}/contacts. Права проверяет бэкенд (403), фронт
// только прячет кнопки.
// ==========================================

export interface ClientListItem {
  id: number;
  client_name: string;
  phone: string | null;
  contact_email: string | null;
  projects_count: number;
  last_project_at: string | null;
}

export interface FetchClientsParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ClientProject {
  id: number;
  name: string;
  status: { status_name: string; color?: string | null } | null;
  deadline: string | null;
  created_at: string | null;
  is_express: boolean;
  is_warehouse_request: boolean;
  pm_name: string | null;
  sale_total: number | string | null;
}

export interface ClientContact {
  id: number;
  full_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  note: string | null;
}

export interface ClientDetail {
  id: number;
  client_name: string;
  phone: string | null;
  contact_email: string | null;
  created_at: string | null;
  updated_at: string | null;
  projects_count: number;
  total_sale: number | string | null;
  projects: ClientProject[];
  contacts: ClientContact[];
}

export interface UpdateClientPayload {
  client_name?: string;
  phone?: string;
  contact_email?: string;
}

export interface UpdateClientResponse {
  id: number;
  client_name: string;
  phone: string | null;
  contact_email: string | null;
  updated_at: string | null;
}

export interface ClientContactPayload {
  full_name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  is_primary?: boolean;
  note?: string | null;
}

// Ошибка с HTTP-статусом — странице нужно отличать 403/404 от остальных,
// чтобы показать нужное сообщение и вернуть пользователя к списку.
export class ClientsApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ClientsApiError";
    this.status = status;
  }
}

const STATUS_FALLBACKS: Record<number, string> = {
  403: "Нет доступа к этому действию",
  404: "Клиент не найден",
};

// 409 приходит с русским detail строкой — throwWithDetail его и пробрасывает.
// 422 отдаёт detail массивом (pydantic) — throwWithDetail его не разворачивает,
// поэтому собираем сообщение здесь.
function throwClientsError(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    if (Array.isArray(detail) && detail.length > 0) {
      const messages = detail
        .map((item) => (typeof item?.msg === "string" ? item.msg : null))
        .filter(Boolean);
      throw new ClientsApiError(
        messages.length > 0 ? messages.join("; ") : "Проверьте корректность введённых данных",
        status,
      );
    }

    const hasStringDetail = typeof detail === "string" && detail.trim().length > 0;
    if (!hasStringDetail && status && STATUS_FALLBACKS[status]) {
      throw new ClientsApiError(STATUS_FALLBACKS[status], status);
    }

    try {
      throwWithDetail(error, fallback);
    } catch (inner) {
      throw new ClientsApiError(inner instanceof Error ? inner.message : fallback, status);
    }
  }

  throwWithDetail(error, fallback);
}

export async function fetchClients(
  params: FetchClientsParams = {},
  signal?: AbortSignal,
): Promise<ClientListItem[]> {
  try {
    const { data } = await api.get<ClientListItem[]>("/clients", { params, signal });
    return data;
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    throwClientsError(error, "Не удалось загрузить список клиентов");
  }
}

export async function fetchClient(id: number, signal?: AbortSignal): Promise<ClientDetail> {
  try {
    const { data } = await api.get<ClientDetail>(`/clients/${id}`, { signal });
    return data;
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    throwClientsError(error, "Не удалось загрузить клиента");
  }
}

export async function updateClient(
  id: number,
  payload: UpdateClientPayload,
): Promise<UpdateClientResponse> {
  try {
    const { data } = await api.patch<UpdateClientResponse>(`/clients/${id}`, payload);
    return data;
  } catch (error) {
    throwClientsError(error, "Не удалось сохранить клиента");
  }
}

export async function createClientContact(
  clientId: number,
  payload: ClientContactPayload,
): Promise<ClientContact> {
  try {
    const { data } = await api.post<ClientContact>(`/clients/${clientId}/contacts`, payload);
    return data;
  } catch (error) {
    throwClientsError(error, "Не удалось добавить контакт");
  }
}

export async function updateClientContact(
  clientId: number,
  contactId: number,
  payload: Partial<ClientContactPayload>,
): Promise<ClientContact> {
  try {
    const { data } = await api.patch<ClientContact>(
      `/clients/${clientId}/contacts/${contactId}`,
      payload,
    );
    return data;
  } catch (error) {
    throwClientsError(error, "Не удалось сохранить контакт");
  }
}

export async function deleteClientContact(clientId: number, contactId: number): Promise<void> {
  try {
    await api.delete(`/clients/${clientId}/contacts/${contactId}`);
  } catch (error) {
    throwClientsError(error, "Не удалось удалить контакт");
  }
}
