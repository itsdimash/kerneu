// Сопоставление статуса проекта (status_name из БД) со значимым названием
// и цветом для колонки "Этап" в дашборде.
//
// Если бэкенд добавит новый статус, которого нет в этой карте — функция
// вернёт исходное status_name с нейтральным цветом, а не сломается и не
// покажет "—".
//
// Статусы ниже, отмеченные (зарезервировано), пока не устанавливаются
// никаким бэкенд-кодом — Модули 2-5 из ТЗ (Договор/Закупка/Склад/
// Документы) ещё не реализованы. Названия и переходы между ними могут
// измениться, когда эти модули будут написаны.

type StageMeta = { label: string; cls: string };

const STAGE_META: Record<string, StageMeta> = {
  // ── Модуль 1: КП (реализовано) ──
  "Новый": {
    label: "Загрузка КП",
    cls: "bg-slate-50 text-slate-600 ring-1 ring-slate-200/80",
  },
  "На согласовании у Комдира": {
    label: "КП на согласовании",
    cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
  },
  "Отклонено Комдиром": {
    label: "КП отклонено (правки)",
    cls: "bg-red-50 text-red-700 ring-1 ring-red-200/80",
  },
  "Одобрено Комдиром": {
    label: "Договор",
    cls: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80",
  },

  // ── Модуль 2: Договор/Подпись (зарезервировано, ещё не реализовано) ──
  "Ожидание подписания": {
    label: "Подпись",
    cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80",
  },

  // ── Модуль 3: Закупка (зарезервировано, ещё не реализовано) ──
  "Активный закуп": {
    label: "Закупка",
    cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200/80",
  },

  // ── Модуль 4: Склад (зарезервировано, ещё не реализовано) ──
  "На отгрузке": {
    label: "Склад",
    cls: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/80",
  },

  // ── Модуль 5: Документы (зарезервировано, ещё не реализовано) ──
  "Ожидание документов": {
    label: "Документы",
    cls: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200/80",
  },

  // ── Финал ──
  "Завершен": {
    label: "Завершён",
    cls: "bg-green-50 text-green-700 ring-1 ring-green-200/80",
  },

  // ── Архив (расторгнутый договор) ──
  "Договор расторгнут": {
    label: "Расторгнут",
    cls: "bg-red-100 text-red-800 ring-1 ring-red-300",
  },

  // Старый общий статус, оставлен для совместимости
  "В работе": {
    label: "В работе",
    cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80",
  },
};

const FALLBACK_CLS = "bg-slate-50 text-slate-600 ring-1 ring-slate-200/80";

export function getStageMeta(statusName?: string | null): StageMeta {
  if (!statusName) return { label: "—", cls: FALLBACK_CLS };
  return STAGE_META[statusName] ?? { label: statusName, cls: FALLBACK_CLS };
}
