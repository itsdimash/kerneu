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