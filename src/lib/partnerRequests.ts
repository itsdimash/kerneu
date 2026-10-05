// Время партнёрских заявок приходит naive (без Z и смещения), но всегда в UTC.
// Если в строке нет ни "Z", ни смещения (+hh:mm / -hh:mm), добавляем "Z",
// иначе new Date() прочитал бы её как локальное время и сдвинул на часовой пояс.
// Функция только для партнёрских полей — остальной ERP разбирает даты как раньше.
const HAS_TIMEZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

export function parsePartnerDate(value: string): Date {
  const trimmed = value.trim();
  // Только дата без времени (YYYY-MM-DD) тоже считаем UTC-полуночью.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed;
  return new Date(HAS_TIMEZONE.test(iso) ? iso : `${iso}Z`);
}

// Отображение — в локальном времени пользователя.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parsePartnerDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("ru-RU")} ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

// dd.mm.yyyy в локальном времени.
export function formatPartnerDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parsePartnerDate(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ru-RU");
}

export function requestNumber(id: number): string {
  return `№${id}`;
}

export function projectLabel(projectName: string | null | undefined): string {
  return projectName && projectName.trim() ? projectName : "—";
}
