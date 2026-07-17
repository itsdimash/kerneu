import { api } from "./api";

export const getMe = async () => {
    const response = await api.get("/auth/me");

    console.log("ME:", response.data);

    return response.data;
};
export const logout = async () => {
    await api.post("/auth/logout");
};