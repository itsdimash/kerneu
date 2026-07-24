import type { Role } from "../types";
export const ROLES: Record<string, { full: string; dot: string }> = {
  admin: {
    full: "Администратор",
    dot: "bg-red-500",
  },
  commercial_director: {
    full: "Коммерческий директор",
    dot: "bg-purple-500",
  },
  pm: {
    full: "Проджект менеджер",
    dot: "bg-blue-500",
  },
  accountant: {
    full: "Бухгалтер",
    dot: "bg-green-500",
  },
  warehouse: {
    full: "Склад",
    dot: "bg-yellow-500",
  },
};

export const ROLE_EMAILS: Record<Role, string> = {
  pm: "pm@kerneu.kz", director: "director@kerneu.kz",
  accountant: "accounting@kerneu.kz", warehouse: "warehouse@kerneu.kz",
};