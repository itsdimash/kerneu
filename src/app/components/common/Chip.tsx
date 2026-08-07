export function Chip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    // Новые статусы из БД (Alembic)
    'Новый проект': { label: 'Новый проект', cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-slate-400/25' },
    'Новый': { label: 'Новый', cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-slate-400/25' },
    'В редактировании': { label: 'В редактировании', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-400/15 dark:text-blue-300 dark:ring-blue-400/25' },
    // Цвет в БД для "Завершен" — тёмно-серый (#1E293B, статус-архив),
    // здесь ближайший Tailwind-эквивалент — slate-800 на светлом фоне.
    'Завершен': { label: 'Завершен', cls: 'bg-slate-200 text-slate-800 ring-1 ring-slate-300 dark:bg-slate-400/25 dark:text-slate-200 dark:ring-slate-400/35' },
    'Ожидание подписания': { label: 'Ожидание подписания', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/25' },
    'Активный закуп': { label: 'Активный закуп', cls: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-400/15 dark:text-violet-300 dark:ring-violet-400/25' },
    // Соответствует #14B8A6 в БД.
    'На приходе': { label: 'На приходе', cls: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-400/15 dark:text-teal-300 dark:ring-teal-400/25' },
    'На отгрузке': { label: 'На отгрузке', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-400/15 dark:text-red-300 dark:ring-red-400/25' },
    'Ожидание документов': { label: 'Ожидание документов', cls: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-400/15 dark:text-yellow-300 dark:ring-yellow-400/25' },
    // Соответствует #EC4899 в БД. Раньше отсутствовал в карте вовсе —
    // из-за этого рендерился без цвета (серый fallback ниже).
    'Ожидание клиента': { label: 'Ожидание клиента', cls: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 dark:bg-pink-400/15 dark:text-pink-300 dark:ring-pink-400/25' },
    // Новый статус "мягкого удаления" — вместо удаления проекта в
    // ARCHIVABLE_STATUSES (см. project_service.py) ему проставляется этот статус.
    'Договор расторгнут': { label: 'Договор расторгнут', cls: 'bg-red-100 text-red-900 ring-1 ring-red-300 dark:bg-red-400/25 dark:text-red-200 dark:ring-red-400/35' },

    // Статусы согласования Комдиром — раньше отсутствовали в мапе,
    // поэтому падали в серый fallback ниже, хотя выше в статус-степпере
    // ("На согласовании", "Одобрено", "Отклонено") у каждого этапа уже
    // задумывался свой цвет.
    'На согласовании у Комдира': { label: 'На согласовании у Комдира', cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-400/15 dark:text-indigo-300 dark:ring-indigo-400/25' },
    'Одобрено Комдиром': { label: 'Одобрено Комдиром', cls: 'bg-success-muted text-success ring-1 ring-success/25' },
    'Отклонено Комдиром': { label: 'Отклонено Комдиром', cls: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-400/15 dark:text-rose-300 dark:ring-rose-400/25' },

    // Старые/системные статусы
    'draft': { label: 'Черновик', cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-slate-400/25' },
    'confirmed': { label: 'Подтверждено', cls: 'bg-success-muted text-success ring-1 ring-success/25' },
    'kp': { label: "КП", cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-400/15 dark:text-blue-300 dark:ring-blue-400/25" },
    'review': { label: "На проверке", cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-400/15 dark:text-violet-300 dark:ring-violet-400/25" },
    'approved': { label: "Одобрен", cls: "bg-success-muted text-success ring-1 ring-success/25" },
  };

  const c = map[status] || { label: status, cls: "bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/20" };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  );
}
