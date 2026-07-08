import type { Role } from "../types";
export const ROLES: Record<Role, { label: string; full: string; badge: string; dot: string }> = {
  pm:        { label: "PM",        full: "Проектный менеджер",      badge: "bg-blue-100 text-blue-700",    dot: "bg-blue-500" },
  director:  { label: "Комдир",    full: "Коммерческий директор",   badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  accountant:{ label: "Бухгалтер", full: "Бухгалтер",              badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500" },
  warehouse: { label: "Склад",     full: "Менеджер склада",         badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
};

export const ROLE_EMAILS: Record<Role, string> = {
  pm: "pm@kerneu.kz", director: "director@kerneu.kz",
  accountant: "accounting@kerneu.kz", warehouse: "warehouse@kerneu.kz",
};