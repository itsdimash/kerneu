import axios from "axios";
import { api, type ProjectDocumentResponse } from "./api";

// ==========================================
// ИНТЕГРАЦИЯ С 1С:БУХГАЛТЕРИЯ
//
// Три read-only эндпоинта из app/api/v1/routers/onec.py:
//   GET /onec/balance                        — дебиторка/кредиторка/сальдо
//   GET /onec/debtors                        — список должников
//   GET /onec/payment-status/{document_number} — статус оплаты реализации
//
// Доступ на бэке ограничен ролями accountant / commercial_director / admin
// (ALLOWED_ROLES в роутере). Соответственно и пункт меню показываем только
// им — см. NAV в Sidebar.tsx.
//
// ВАЖНО про типы: суммы на бэке объявлены как Decimal, а pydantic v2
// сериализует Decimal в JSON строкой, а не числом. Поэтому все денежные
// поля типизированы как `number | string`, а для расчётов есть toNumber().
// ==========================================

export type Numeric = number | string;

export interface CompanyBalanceResponse {
  organization: string;
  /** Сколько должны компании */
  total_receivable: Numeric;
  /** Сколько должна компания */
  total_payable: Numeric;
  /** total_receivable - total_payable */
  net_balance: Numeric;
  currency: string;
  as_of: string;
}

export interface DebtorItem {
  counterparty_ref: string;
  counterparty_name: string;
  /** БИН (юрлицо) или ИИН (физлицо) */
  bin_iin: string | null;
  amount_due: Numeric;
  currency: string;
  oldest_unpaid_date: string | null;
}

export interface DebtorsResponse {
  organization: string;
  debtors: DebtorItem[];
  total_due: Numeric;
  as_of: string;
}

export interface PaymentStatusResponse {
  document_number: string;
  document_date: string;
  counterparty_name: string;
  document_amount: Numeric;
  paid_amount: Numeric;
  /** "оплачен" | "частично оплачен" | "не оплачен" */
  status: string;
  currency: string;
}

// ==========================================
// ПОИСК И ЗАГРУЗКА ДОКУМЕНТОВ ИЗ 1С (накладная / счёт на оплату / доверенность)
//
// GET /onec/documents/search — точный поиск по БИН/ИИН контрагента+периоду (уже
// реализован на бэке, доступен ролям pm/accountant/commercial_director/admin
// — ОТДЕЛЬНЫЙ список ролей от balance/debtors выше, ПМ туда не пускают, сюда —
// пускают).
// POST /onec/documents/link — сохранить выбранный документ в архив проекта.
// ЕЩЁ НЕ РЕАЛИЗОВАН НА БЭКЕНДЕ (ждёт модель Project/Client и модель
// documents) — функция готова заранее, чтобы не переделывать фронт потом.
// Пока backend не готов, вызов answer'ит 404/500.
// ==========================================

export type OnecDocType = "waybill" | "payment_invoice" | "power_of_attorney";

export interface OnecDocumentCandidate {
  ref_key: string;
  number: string | null;
  /** ISO yyyy-mm-dd */
  date: string;
  /** Только для отображения — не используется как фильтр поиска */
  sum: Numeric | null;
  counterparty_name: string;
  /**
   * Заполнены только для doc_type="payment_invoice" — оплата и отгрузка по
   * этому счёту, приближённо (сопоставление по контрагенту+сумме+периоду,
   * см. коммент у search_documents_by_counterparty на бэкенде). Для
   * waybill/power_of_attorney — null.
   */
  payment_status?: "не оплачен" | "частично оплачен" | "оплачен" | null;
  paid_amount?: Numeric | null;
  shipment_status?: "не отгружен" | "частично отгружен" | "отгружен" | null;
  shipped_amount?: Numeric | null;
}

interface OnecDocumentSearchApiResponse {
  doc_type: string;
  candidates: OnecDocumentCandidate[];
}

const DOCUMENTS_SEARCH_TIMEOUT_MS = 60_000;

/**
 * Точный поиск документа-кандидата в 1С по БИН/ИИН контрагента+периоду —
 * для кнопки «Загрузить из 1С» на странице документов проекта. БИН/ИИН —
 * уникальный номер, поэтому поиск однозначный, в отличие от названия
 * компании (короткое/полное, опечатки).
 */
export async function searchOnecDocuments(
  docType: OnecDocType,
  binIin: string,
  dateFrom: string,
  dateTo?: string,
): Promise<OnecDocumentCandidate[]> {
  try {
    const { data } = await api.get<OnecDocumentSearchApiResponse>("/onec/documents/search", {
      params: {
        doc_type: docType,
        bin_iin: binIin,
        date_from: dateFrom,
        ...(dateTo ? { date_to: dateTo } : {}),
      },
      timeout: DOCUMENTS_SEARCH_TIMEOUT_MS,
    });
    return data.candidates;
  } catch (error) {
    throw friendlyError(error, "Не удалось найти документ в 1С");
  }
}

/**
 * Сохранить выбранный пользователем документ 1С в архив проекта — тот же
 * тип ответа, что и обычная ручная загрузка (ProjectDocumentResponse),
 * поэтому дальше по коду (documentsStore.addDocument и т.д.) обрабатывается
 * одинаково независимо от источника файла.
 *
 * TODO backend: эндпоинт /onec/documents/link ещё не реализован.
 */
export async function linkOnecDocument(
  projectId: string | number,
  docType: OnecDocType,
  refKey: string,
): Promise<ProjectDocumentResponse> {
  try {
    const { data } = await api.post<ProjectDocumentResponse>("/onec/documents/link", {
      project_id: projectId,
      doc_type: docType,
      ref_key: refKey,
    });
    return data;
  } catch (error) {
    throw friendlyError(error, "Не удалось сохранить документ из 1С");
  }
}

/** Decimal с бэка приходит строкой — приводим к числу для расчётов и форматирования. */
export function toNumber(value: Numeric | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// 1С:Фреш по OData отвечает небыстро, а /debtors вдобавок дёргает имя
// каждого контрагента отдельным запросом в цикле — дефолтные таймауты
// axios тут малы.
const BALANCE_TIMEOUT_MS = 90_000;
const DEBTORS_TIMEOUT_MS = 180_000;
const PAYMENT_TIMEOUT_MS = 60_000;

function friendlyError(error: unknown, fallback: string): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;
    const detailText = typeof detail === "string" && detail.trim() ? detail : null;

    if (error.code === "ECONNABORTED") {
      return new Error(
        "1С не ответила за отведённое время. Попробуйте сузить период и повторить запрос.",
      );
    }

    if (status === 401) {
      return new Error("Сессия истекла. Войдите в систему заново.");
    }

    if (status === 403) {
      return new Error(
        detailText ?? "Данные 1С доступны только бухгалтеру, коммерческому директору и админу.",
      );
    }

    if (status === 422) {
      return new Error("Проверьте даты периода — бэкенд не принял их формат.");
    }

    if (status === 502) {
      return new Error(
        detailText ? `1С не отвечает: ${detailText}` : "1С не отвечает. Повторите попытку позже.",
      );
    }

    if (detailText) return new Error(detailText);
  }

  return new Error(fallback);
}

/**
 * Баланс компании за период.
 * @param dateFrom ISO-дата yyyy-mm-dd, обязательна
 * @param dateTo   ISO-дата yyyy-mm-dd, по умолчанию на бэке — сегодня
 */
export async function fetchCompanyBalance(
  dateFrom: string,
  dateTo?: string,
): Promise<CompanyBalanceResponse> {
  try {
    const { data } = await api.get<CompanyBalanceResponse>("/onec/balance", {
      params: { date_from: dateFrom, ...(dateTo ? { date_to: dateTo } : {}) },
      timeout: BALANCE_TIMEOUT_MS,
    });
    return data;
  } catch (error) {
    throw friendlyError(error, "Не удалось загрузить баланс из 1С");
  }
}

/** Должники за период, отсортированы бэкендом по убыванию суммы. */
export async function fetchDebtors(
  dateFrom: string,
  dateTo?: string,
): Promise<DebtorsResponse> {
  try {
    const { data } = await api.get<DebtorsResponse>("/onec/debtors", {
      params: { date_from: dateFrom, ...(dateTo ? { date_to: dateTo } : {}) },
      timeout: DEBTORS_TIMEOUT_MS,
    });
    return data;
  } catch (error) {
    throw friendlyError(error, "Не удалось загрузить список должников из 1С");
  }
}

/**
 * Статус оплаты документа реализации по его номеру.
 * Возвращает null, если документа с таким номером в 1С нет (404 с бэка) —
 * это штатный результат поиска, а не ошибка.
 *
 * @param documentNumber Номер документа реализации, как он указан в 1С
 * @param year Год документа. Нумерация реализаций в 1С сбрасывается каждый
 *   год, поэтому один и тот же номер может встречаться в разные годы —
 *   без year бэкенд может вернуть не тот документ (самый старый найденный).
 */
export async function fetchPaymentStatus(
  documentNumber: string,
  year?: number,
): Promise<PaymentStatusResponse | null> {
  try {
    const { data } = await api.get<PaymentStatusResponse>(
      `/onec/payment-status/${encodeURIComponent(documentNumber)}`,
      {
        params: { ...(year ? { year } : {}) },
        timeout: PAYMENT_TIMEOUT_MS,
      },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw friendlyError(error, "Не удалось проверить статус оплаты в 1С");
  }
}