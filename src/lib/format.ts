import type { Page, ProjectState } from "../types";
export function fmt(n: number) { return n.toLocaleString("ru-RU") + " ₸"; }

export function daysFromNow(deadline: string): number {
  const [d, m, y] = deadline.split(".");
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const today = new Date(2024, 6, 17); // fixed demo date: 17 Jul 2024
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

export function deadlineBadge(deadline: string): string {
  const d = daysFromNow(deadline);
  if (d <= 7)  return "bg-red-50 text-red-600 ring-1 ring-red-200";
  if (d <= 14) return "bg-orange-50 text-orange-600 ring-1 ring-orange-200";
  return "bg-green-50 text-green-600 ring-1 ring-green-200";
}

// Nav is always open — actions inside sections carry the locks, not the nav itself
export function getNavAvail(_page: Page, _ps: ProjectState): { ok: boolean; tip: string } {
  return { ok: true, tip: "" };
}