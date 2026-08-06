import axios from "axios";

export const api = axios.create({
    baseURL: "http://localhost:8000/api/v1",
    withCredentials: true, // очень важно для Cookie
});

export interface ProjectItem {
  id: number;
  project_id: number;
  product_id: number;
  supplier_id?: number | null;
  supplier_raw_name?: string | null;
  required_quantity: number;

  cost_price: number | string;
  sale_price: number | string;
  total_sum: number | string;
  estimated_price?: number | string | null;
  estimated_total?: number | string | null;
  matched_external_id?: string | null;

  product?: {
    id: number;
    name: string;
    unit?: string | null;
    cost_price?: number | string;
    external_id?: string | null;
  } | null;

  supplier?: {
    id: number;
    supplier_name: string;
  } | null;
}

export const getProjectItems = async (projectId: number | string) => {
  const { data } = await api.get<ProjectItem[]>(
    `/project-items/${projectId}`
  );

  return data;
};

export interface DashboardStats {
  active_projects: number;
  deadline_projects: number;
  new_projects_month: number;
  pending_kp: number;
  planned_revenue: number;
  revenue_growth: number; // например, 18 (%)
}

export const fetchDashboardStats = async (): Promise<DashboardStats> => {
  const response = await fetch("http://localhost:8000/api/v1/dashboard/stats", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Ошибка при загрузке статистики дашборда");
  }
  return await response.json();
};

export interface ProjectResponse {
  id: number;
  name?: string;
  client?: { id: number; client_name: string };
  pm?: { id: number; name: string };
  status?: { id: number; status_name: string };
  invoice?: { amount: number };
  planned_margin?: number;
  deadline?: string;
  contract_number?: string;
  created_at?: string;
}

const API_BASE = "http://localhost:8000/api/v1"; // подставь свой базовый URL, если отличается

export async function fetchProjectDetails(projectId: number): Promise<ProjectResponse> {
  const url = `${API_BASE}/projects/${projectId}`;
  console.log("Запрос к:", url);
  const res = await fetch(url, {
    credentials: "include",
  });
  console.log("Статус ответа:", res.status);
  const text = await res.text();
  console.log("Тело ответа:", text);
  if (!res.ok) throw new Error(`Ошибка загрузки проекта: ${res.status}`);
  return JSON.parse(text);
}

export interface MlImportCreateResponse {
  id: number;
  project_id: number;
  source_file_name: string;
  status: string;
}

export interface MlSimilarVariant {
  product_id?: number;
  id?: number;
  matched_id?: number | string;

  product_name?: string;
  name?: string;

  similarity?: number;
  similarity_percent?: number;
  supplier_name?: string | null;

  [key: string]: unknown;
}

export interface MlImportItemResponse {
  id: number;

  input_product: string;
  input_quantity: number;

  ml_status: string;

  matched_product: string | null;
  matched_external_id: string | null;
  estimated_price: number | string | null;

  price_cost: number | string;
  price: number | string;
  total_amount: number | string;
  margin: number | string;

  available_quantity: number;

  unit: string | null;
  category: string | null;
  supplier_name: string | null;

  similarity_percent: number | string;

  similar_variants: MlSimilarVariant[];

  selected_product_id: number | null;
  final_quantity: number | null;

  user_comment: string | null;
  is_confirmed: boolean;

  created_at: string;
  updated_at: string | null;
}

export interface MlImportDetailResponse {
  id: number;
  project_id: number;

  source_file_name: string;
  status: string;

  created_by: number | null;
  created_at: string;

  confirmed_by: number | null;
  confirmed_at: string | null;

  items: MlImportItemResponse[];
}

export interface MlImportItemUpdate {
  selected_product_id?: number | null;
  final_quantity?: number | null;

  price?: number | null;
  price_cost?: number | null;
  estimated_price?: number | null;
  supplier_name?: string | null;

  user_comment?: string | null;
}

export interface MlImportItemCreateProduct {
  product_name: string;
  supplier_name: string;
  unit: string;
  price_cost: number;
  price: number;
}

export async function createMlImport(
  projectId: number,
  file: File,
): Promise<MlImportCreateResponse> {
  const formData = new FormData();

  formData.append("project_id", String(projectId));
  formData.append("file", file);

  const { data } = await api.post<MlImportCreateResponse>(
    "/ml-imports",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return data;
}

export async function getMlImport(
  importId: number,
): Promise<MlImportDetailResponse> {
  const { data } = await api.get<MlImportDetailResponse>(
    `/ml-imports/${importId}`,
  );

  return data;
}

export async function updateMlImportItem(
  importId: number,
  itemId: number,
  payload: MlImportItemUpdate,
): Promise<MlImportItemResponse> {
  const { data } = await api.patch<MlImportItemResponse>(
    `/ml-imports/${importId}/items/${itemId}`,
    payload,
  );

  return data;
}

export async function createProductForMlImportItem(
  importId: number,
  itemId: number,
  payload: MlImportItemCreateProduct,
): Promise<MlImportItemResponse> {
  try {
    const { data } = await api.post<MlImportItemResponse>(
      `/ml-imports/${importId}/items/${itemId}/create-product`,
      payload,
    );

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === "string" && detail.trim()) {
        throw new Error(detail);
      }
    }

    throw error;
  }
}

export async function confirmMlImport(
  importId: number,
): Promise<MlImportCreateResponse> {
  const { data } = await api.post<MlImportCreateResponse>(
    `/ml-imports/${importId}/confirm`,
  );

  return data;
}

// ==========================================
// СКЛАДЫ (справочник)
// ==========================================
// Реальный список складов отдаёт GET /warehouse/list (роут добавлен на бэке
// поверх уже существовавшего get_all_warehouses в warehouse_service.py).
// Остатки (/warehouse/stocks) по-прежнему дополнительно содержат
// warehouse_id/warehouse_name вложенными в item.stocks[] — это используется
// в WarehousePage.tsx (deriveWarehouses) как подстраховка на случай,
// если склад окажется без остатков ни по одному товару.

export interface WarehouseInfo {
  id: number;
  name: string; // "Карабулак", "Абишова"
  code: string; // "Кар", "Аб"
}

export const fetchWarehouseList = async (): Promise<WarehouseInfo[]> => {
  const { data } = await api.get<WarehouseInfo[]>("/warehouse/list");
  return data;
};

// ==========================================
// ОСТАТКИ (с разбивкой по складам)
// ==========================================

export interface WarehouseStockDetail {
  warehouse_id: number;
  warehouse_name: string;
  actual_quantity: number;
  reserved_quantity: number;
  defective_quantity: number;
  available_quantity: number;
}

export interface WarehouseStockResponse {
  id: number;
  product_id: number;
  category: string;
  name: string;
  unit: string;
  supplier_name?: string | null;
  actual_quantity: number;
  reserved_quantity: number;
  defective_quantity: number;
  stocks: WarehouseStockDetail[];
}

export const fetchWarehouseStocks = async (): Promise<WarehouseStockResponse[]> => {
  const { data } = await api.get<WarehouseStockResponse[]>("/warehouse/stocks");
  return data;
};

export interface WarehouseIncomeItem {
  product_id: number;
  quantity: number;
  warehouse_id: number; // обязательно: на какой склад приходуем
  supplier_id?: number;
}

export interface WarehouseIncomeInput {
  items: WarehouseIncomeItem[];
  supplier_id?: number;
}

export const postWarehouseIncome = async (payload: WarehouseIncomeInput) => {
  const { data } = await api.post("/warehouse/income", payload);
  return data;
};

export const reserveProjectItems = async (projectId: number, warehouseId: number = 1) => {
  const { data } = await api.post(
    `/warehouse/projects/${projectId}/reserve?warehouse_id=${warehouseId}`
  );
  return data;
};

export const shipProjectItems = async (projectId: number, warehouseId: number = 1) => {
  const { data } = await api.post(
    `/warehouse/projects/${projectId}/ship?warehouse_id=${warehouseId}`
  );
  return data;
};

// ==========================================
// WORKFLOW (Согласование Комдиром)
// ==========================================

export interface WorkflowResponse {
  message: string;
  project_id: number;
  status: string;
  reason?: string | null;
  document_id?: number;
  document_status?: string;
  archive_status?: "saved";
}

export async function sendProjectToDirector(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/send-to-director`
  );
  return data;
}

export async function startProjectEditing(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/start-editing`
  );
  return data;
}

export async function approveProjectDirector(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/approve`
  );
  return data;
}

export async function rejectProjectDirector(projectId: number, reason?: string): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/reject`,
    { reason: reason || null }
  );
  return data;
}

// ==========================================
// DOCUMENT REVIEW WORKFLOW (страница "Документы": Бухгалтер -> Директор)
// ==========================================

export type DocReviewStage =
  | "none"
  | "pending_accountant"
  | "pending_director"
  | "approved"
  | "rejected";

export type DocRejector = "accountant" | "commercial_director";

export interface DocumentReviewResponse {
  message?: string;
  project_id: number;
  stage: DocReviewStage;
  rejected_by: DocRejector | null;
  reject_reason: string | null;
  submitted_by: number | null;
  submitted_at: string | null;
  accountant_decided_by: number | null;
  accountant_decided_at: string | null;
  director_decided_by: number | null;
  director_decided_at: string | null;
  updated_at: string | null;
}

// PM: отправить / заново отправить документы на проверку.
export async function submitDocumentsForReview(
  projectId: number | string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/submit-for-review`,
  );
  return data;
}

// Бухгалтер: принять.
export async function accountantApproveDocuments(
  projectId: number | string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/accountant-approve`,
  );
  return data;
}

// Бухгалтер: отклонить (с необязательным комментарием).
export async function accountantRejectDocuments(
  projectId: number | string,
  reason?: string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/accountant-reject`,
    { reason: reason || null },
  );
  return data;
}

// Директор: принять (финальное согласование).
export async function directorApproveDocuments(
  projectId: number | string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/director-approve`,
  );
  return data;
}

// Директор: отклонить (с необязательным комментарием).
export async function directorRejectDocuments(
  projectId: number | string,
  reason?: string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/director-reject`,
    { reason: reason || null },
  );
  return data;
}

// Текущий статус согласования (для опроса вместо локальной симуляции).
export async function fetchDocumentsReviewStatus(
  projectId: number | string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.get<DocumentReviewResponse>(
    `/projects/${projectId}/documents/review-status`,
  );
  return data;
}

// ==========================================
// CLIENT DECISION (Одобрение КП / Правки от клиента)
// ==========================================

export async function approveProjectClient(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/client-approve`
  );
  return data;
}

export async function rejectProjectClient(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/client-reject`
  );
  return data;
}

// ==========================================
// PROJECT DOCUMENTS ARCHIVE
// ==========================================

export interface ProjectDocumentResponse {
  id: number;
  project_id: number;
  name: string;
  category: string;
  status: string;
  file_name: string;
  mime_type: string;
  created_at: string;
  download_url: string;
}

export async function fetchProjectDocuments(
  projectId: number | string,
): Promise<ProjectDocumentResponse[]> {
  const { data } = await api.get<ProjectDocumentResponse[]>(
    `/documents/project/${projectId}`,
  );
  return data;
}
export async function uploadProjectDocument(
  projectId: string | number,
  category: "contract" | "invoice" | "power_of_attorney",
  file: File,
  name?: string,
): Promise<ProjectDocumentResponse> {
  const formData = new FormData();

  formData.append("project_id", String(projectId));
  formData.append("category", category);
  formData.append("file", file);

  if (name) {
    formData.append("name", name);
  }

  const { data } = await api.post<ProjectDocumentResponse>(
    "/documents/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return data;
}

export async function downloadProjectDocument(
  projectDocument: ProjectDocumentResponse,
): Promise<void> {
  const { data } = await api.get<Blob>(
    `/documents/${projectDocument.id}/download`,
    { responseType: "blob" },
  );

  const blob = new Blob([data], {
    type: projectDocument.mime_type || "application/octet-stream",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = projectDocument.file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ==========================================
// EXPORT EXCEL & GENERATE WORD KP
// ==========================================

export const downloadProjectExcel = async (projectId: number): Promise<void> => {
  const response = await api.get(`/projects/${projectId}/export`, {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const url = window.URL.createObjectURL(blob);

  let filename = `Утверждено_Проект_${projectId}.xlsx`;
  const disposition = response.headers['content-disposition'];
  if (disposition && disposition.includes("filename*=UTF-8''")) {
    filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  }

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Функция выгрузки сгенерированного Word КП
export const downloadKpDocument = async (projectId: number): Promise<void> => {
  const response = await api.get(`/projects/${projectId}/generate-kp`, {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { 
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
  });
  
  const url = window.URL.createObjectURL(blob);

  let filename = `KP_Project_${projectId}.docx`;
  const disposition = response.headers['content-disposition'];
  if (disposition && disposition.includes("filename*=UTF-8''")) {
    filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  } else if (disposition && disposition.includes("filename=")) {
    const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
    if (matches && matches[1]) {
      filename = matches[1].replace(/['"]/g, "");
    }
  }

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  
  link.remove();
  window.URL.revokeObjectURL(url);
};
export interface ProductInfo {
  id: number;
  name: string;
  unit: string | null;
  cost_price: number | string | null;
  current_stock?: number | string | null;
  external_id?: string | null;
}

export interface StatusInfo {
  id: number;
  status_name: string;
}

export interface SupplierInfo {
  id: number;
  supplier_name: string;
}

export interface ProjectItemResponse {
  id: number;
  required_quantity: number | null;
  cost_price: number | string;
  sale_price: number | string;
  total_sum: number | string;
  estimated_price: number | string | null;
  estimated_total: number | string | null;
  matched_external_id?: string | null;
  supplier_raw_name: string | null;

  product: ProductInfo;
  status: StatusInfo | null;
  supplier: SupplierInfo | null;
}
export async function fetchProjectItems(
  projectId: number,
): Promise<ProjectItemResponse[]> {
  const { data } = await api.get<ProjectItemResponse[]>(
    `/project-items/${projectId}`,
  );

  return data;
}

// ==========================================
// DASHBOARD WIDGETS
// ==========================================

export interface UpcomingDeadline {
  project_id: number;
  name: string;
  deadline: string;
  days_left: number;
}

export const fetchUpcomingDeadlines = async (limit: number = 3): Promise<UpcomingDeadline[]> => {
  const { data } = await api.get<UpcomingDeadline[]>(`/dashboard/upcoming-deadlines?limit=${limit}`);
  return data;
};

export interface RecentActivity {
  text: string;
  time: string;
}

export const fetchRecentActivity = async (limit: number = 5): Promise<RecentActivity[]> => {
  const { data } = await api.get<RecentActivity[]>(`/dashboard/recent-activity?limit=${limit}`);
  return data;
};
export const signProjectContract = async (projectId: number) => {
  const { data } = await api.post<WorkflowResponse>(
    `/project-workflow/${projectId}/sign-contract`,
  );

  return data;
};

export interface WarehouseReceiptResponse {
  id: number;
  receipt_number?: string;
  project_id?: number;         // <-- ID проекта
  project_name?: string;       // <-- Название проекта
  date: string;                // Когда придет товар
  supplier_id: number;
  product_id: number;
  warehouse_id?: number | null;
  quantity: number;
  status: string;              // 'pending' | 'arrived' | 'cancelled'
  actual_quantity?: number | null;
  photo_path?: string | null;
  warehouse_comment?: string | null;
  confirmed_at?: string | null;
  supplier?: {
    id: number;
    supplier_name: string;
    name?: string;
  };
  product?: {
    id: number;
    name: string;
    unit: string;
  };
  warehouse?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
}

export async function fetchWarehouseReceipts(): Promise<
  WarehouseReceiptResponse[]
> {
  const { data } = await api.get<WarehouseReceiptResponse[]>(
    "/warehouse/receipts",
  );

  return data;
}

// ==========================================
// ОТМЕНА ПРИХОДА (чекбокс, для роли "warehouse")
// ==========================================

export async function setReceiptCancelled(
  receiptId: number,
  isCancelled: boolean
): Promise<WarehouseReceiptResponse> {
  const { data } = await api.patch<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/cancel`,
    { is_cancelled: isCancelled }
  );
  return data;
}

// ==========================================
// ПОДТВЕРЖДЕНИЕ ПРИХОДА (фото + факт. количество + комментарий)
// ==========================================

export interface ConfirmReceiptPayload {
  actual_quantity: number;
  defective_quantity?: number; // <-- ДОБАВИТЬ ЭТУ СТРОКУ
  comment?: string;
  photo?: File | null;
}

export async function confirmReceipt(
  receiptId: number,
  payload: ConfirmReceiptPayload
): Promise<WarehouseReceiptResponse> {
  const formData = new FormData();
  formData.append("actual_quantity", String(payload.actual_quantity));
  
  // Добавляем отправку брака на бэкенд (если не передано, отправляем 0)
  if (payload.defective_quantity !== undefined) {
    formData.append("defective_quantity", String(payload.defective_quantity));
  } else {
    formData.append("defective_quantity", "0");
  }
  
  formData.append("comment", payload.comment || "");
  if (payload.photo) formData.append("photo", payload.photo);

  const { data } = await api.post<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/confirm`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return data;
}


// ==========================================
// РЕДАКТИРОВАНИЕ ФОТО/КОММЕНТАРИЯ УЖЕ ПОДТВЕРЖДЁННОГО ПРИХОДА
// (количество и остаток на складе этим не трогаются — только эти два поля)
// ==========================================

export interface UpdateReceiptDetailsPayload {
  comment?: string;
  photo?: File | null;
}

export async function updateReceiptDetails(
  receiptId: number,
  payload: UpdateReceiptDetailsPayload
): Promise<WarehouseReceiptResponse> {
  const formData = new FormData();
  if (payload.comment !== undefined) formData.append("comment", payload.comment);
  if (payload.photo) formData.append("photo", payload.photo);

  const { data } = await api.patch<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/details`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return data;
}

// ==========================================
// ОТГРУЗКИ (для вкладки "Отгрузка")
// ==========================================

export interface ShipmentResponse {
  id: number;
  project_id: number;
  date: string;
  project_name: string;
  items_count: number;
  status: string;
}

export interface ShipmentPendingWarehouseOption {
  warehouse_id: number;
  warehouse_name: string;
}

export interface ShipmentPendingItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit: string;
  available_warehouses: ShipmentPendingWarehouseOption[];
}

export interface ShipmentPendingProject {
  project_id: number;
  project_name: string;
  items: ShipmentPendingItem[];
}

export const fetchPendingShipments = async (): Promise<ShipmentPendingProject[]> => {
  const { data } = await api.get<ShipmentPendingProject[]>("/warehouse/shipments/pending");
  return data;
};

export interface ShipItemWarehouseChoice {
  item_id: number;
  warehouse_id: number;
}

export const shipProjectItemsPerWarehouse = async (
  projectId: number,
  items: ShipItemWarehouseChoice[],
) => {
  const { data } = await api.post(
    `/warehouse/projects/${projectId}/ship-items`,
    { items },
  );
  return data;
};

export const fetchWarehouseShipments = async (): Promise<ShipmentResponse[]> => {
  const { data } = await api.get<ShipmentResponse[]>("/warehouse/shipments");
  return data;
};

export async function deleteProjectDocument(
  documentId: number
): Promise<void> {
  const { data } = await api.delete(
    `/documents/${documentId}`
  );
  return data;
}

export async function completeProjectOnBackend(projectId: string | number): Promise<void> {
  await api.post(`/projects/${projectId}/complete`);
}


// ==========================================
// ДОГОВОР: ГЕНЕРАЦИЯ (только бухгалтер)
// ==========================================
// Бэкенд сам подтягивает Спецификацию из project_items — сюда передаются
// только реквизиты покупателя и условия договора. Ничего не сохраняется
// на бэкенде (см. POST /contracts/generate) — только generate -> download.
// Проверенный/исправленный файл бухгалтер потом отдельно загружает на
// странице "Документы" через уже существующий uploadProjectDocument().
 
export interface ContractGenerateRequest {
  project_id: number;
  contract_number: string;
  contract_date?: string; // YYYY-MM-DD; по умолчанию на бэкенде — сегодня
  contract_valid_until?: string; // YYYY-MM-DD; по умолчанию — 31 декабря года подписания
  buyer_company_name: string;
  buyer_director_name: string;
  buyer_address: string;
  buyer_bin: string;
  buyer_iik: string;
  buyer_bik: string;
  buyer_kbe?: string;
  specification_number?: string;
  delivery_term_days?: number;
  // "pickup" — самовывоз покупателем со склада (можно указать pickup_address).
  // "delivery" — доставка силами Поставщика; текст в договоре генерируется
  // без адреса, ничего вводить не нужно.
  shipment_method?: "pickup" | "delivery";
  pickup_address?: string;
}
 
// Человекочитаемые названия для полей ContractGenerateRequest — используются
// только чтобы собрать понятное сообщение из 422-ответа Pydantic, если
// что-то невалидное всё же прошло через проверку на фронте (например,
// странный формат даты).
const FIELD_LABELS: Record<string, string> = {
  contract_number: "Номер договора",
  buyer_company_name: "Название компании",
  buyer_director_name: "ФИО директора",
  buyer_address: "Адрес",
  buyer_bin: "БИН",
  buyer_iik: "ИИК",
  buyer_bik: "БИК",
  contract_date: "Дата подписания",
  contract_valid_until: "Действует до",
  project_id: "Проект",
};
 
function friendlyErrorFromDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
 
  // Pydantic 422: detail — массив {loc: [...], msg: "...", type: "..."}
  if (Array.isArray(detail) && detail.length > 0) {
    const fieldNames = detail
      .map((item) => {
        const loc = item?.loc;
        const fieldKey = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
        return (fieldKey && FIELD_LABELS[fieldKey]) || fieldKey;
      })
      .filter(Boolean);
 
    return fieldNames.length > 0
      ? `Заполните все обязательные поля: ${[...new Set(fieldNames)].join(", ")}`
      : "Заполните все обязательные поля корректно";
  }
 
  return null;
}
 
export const generateContract = async (
  payload: ContractGenerateRequest,
): Promise<void> => {
  let response;
 
  try {
    response = await api.post("/contracts/generate", payload, {
      responseType: "blob",
    });
  } catch (error) {
    // responseType: "blob" means axios also stuffs JSON error bodies (400,
    // 422, 500 from FastAPI) into a Blob instead of parsed JSON — have to
    // read it back out manually to surface the real "detail" message
    // (e.g. "У проекта нет позиций...") instead of a generic axios error.
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      const errorBlob = error.response.data;
      let friendly: string | null = null;
      try {
        const text = await errorBlob.text();
        const parsed = JSON.parse(text);
        friendly = friendlyErrorFromDetail(parsed?.detail);
      } catch {
        // wasn't JSON / no detail field — friendly stays null, falls through below
      }
      // ВАЖНО: throw здесь, а не внутри try выше — иначе его же ловит
      // соседний catch{} и подменяет вот этим самым generic-сообщением ниже,
      // и реальный текст ошибки с бэкенда никогда не доходит до пользователя.
      if (friendly) throw new Error(friendly);
    }
    throw error instanceof Error ? error : new Error("Не удалось сгенерировать договор");
  }
 
  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
 
  let filename = `Договор_${payload.contract_number}.docx`;
  const disposition = response.headers["content-disposition"];
  if (disposition && disposition.includes("filename*=UTF-8''")) {
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
};
 
// Бухгалтер загрузил финальный файл договора на странице "Документы" —
// переводит проект из "Ожидание подписания" в "Активный закуп".
// См. project_status_router.py: POST /projects/{project_id}/contract-uploaded
export const markContractUploaded = async (
  projectId: string | number,
): Promise<void> => {
  await api.post(`/projects/${projectId}/contract-uploaded`);
};
 