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

  product?: {
    id: number;
    name: string;
    unit?: string | null;
    cost_price?: number | string;
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
  supplier_name?: string | null;

  user_comment?: string | null;
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

export async function confirmMlImport(
  importId: number,
): Promise<MlImportCreateResponse> {
  const { data } = await api.post<MlImportCreateResponse>(
    `/ml-imports/${importId}/confirm`,
  );

  return data;
}

// ==========================================
// СКЛАДЫ (справочник) — реальные id/названия, без хардкода
// ==========================================

export interface WarehouseInfo {
  id: number;
  name: string; // "Карабулак", "Абишова"
  code: string; // "KAR", "AB"
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
  if (disposition && disposition.includes("filename=")) {
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
  project_id?: number;         // <-- ДОБАВЛЕНО: ID проекта
  project_name?: string;       // <-- ДОБАВЛЕНО: Название проекта
  date: string;                // Когда придет товар
  supplier_id: number;
  product_id: number;
  quantity: number;
  status: string;

  supplier?: {
    id: number;
    supplier_name: string;
    name?: string;
  };
  product?: {
    id: number;
    name: string;
    unit: string;
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

export type ReceiptStatusValue = "pending" | "transit" | "arrived";

export async function updateReceiptStatus(
  receiptId: number,
  status: ReceiptStatusValue,
  warehouseId: number = 1
): Promise<WarehouseReceiptResponse> {
  const { data } = await api.patch<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/status?warehouse_id=${warehouseId}`,
    { status }
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

export const fetchWarehouseShipments = async (): Promise<ShipmentResponse[]> => {
  const { data } = await api.get<ShipmentResponse[]>("/warehouse/shipments");
  return data;
};