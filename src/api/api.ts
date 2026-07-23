import axios from "axios";

export const api = axios.create({
    baseURL: "http://localhost:8000/api/v1",
    withCredentials: true, // очень важно для Cookie
});
export interface ProjectItem {
id: number;
  project_id: number;
  item_name: string;
  quantity: number;
  price: number;
  status_id: number;
}

export const getProjectItems = async (projectId: number) => {
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
  [key: string]: unknown;
}

export interface MlImportItemResponse {
  id: number;
  input_product: string;
  input_quantity: number;
  ml_status: string;
  matched_product: string | null;
  matched_external_id: string | null;
  available_quantity: number;
  unit: string | null;
  category: string | null;

  // Decimal из FastAPI приходит в JSON как число или строка
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

export interface WarehouseStockResponse {
  id: number;
  product_id: number;
  category: string;
  name: string;
  unit: string;
  actual_quantity: number;
  reserved_quantity: number;
  defective_quantity: number;
}

export const fetchWarehouseStocks = async (): Promise<WarehouseStockResponse[]> => {
  const { data } = await api.get<WarehouseStockResponse[]>("/warehouse/stocks");
  return data;
};

export interface WarehouseIncomeItem {
  product_id: number;
  quantity: number;
}

export interface WarehouseIncomeInput {
  items: WarehouseIncomeItem[];
  // добавь другие поля, если WarehouseIncomeInput их требует (например, supplier, date)
}

export const postWarehouseIncome = async (payload: WarehouseIncomeInput) => {
  const { data } = await api.post("/warehouse/income", payload);
  return data;
};

export const reserveProjectItems = async (projectId: number) => {
  const { data } = await api.post(`/warehouse/projects/${projectId}/reserve`);
  return data;
};

export const shipProjectItems = async (projectId: number) => {
  const { data } = await api.post(`/warehouse/projects/${projectId}/ship`);
  return data;
};
