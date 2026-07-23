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