export function Chip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    // Новые статусы из БД (Alembic)
    'Новый': { label: 'Новый', cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300' },
    'В редактировании': { label: 'В редактировании', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-300' },
    'Завершен': { label: 'Завершен', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300' },
    'Ожидание подписания': { label: 'Ожидание подписания', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-300' },
    'Активный закуп': { label: 'Активный закуп', cls: 'bg-violet-50 text-violet-700 ring-1 ring-violet-300' },
    'На отгрузке': { label: 'На отгрузке', cls: 'bg-red-50 text-red-700 ring-1 ring-red-300' },
    'Ожидание документов': { label: 'Ожидание документов', cls: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-300' },
    
    // Старые/системные статусы
    'draft': { label: 'Черновик', cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80' },
    'confirmed': { label: 'Подтверждено', cls: 'bg-green-50 text-green-700 ring-1 ring-green-200/80' },
    'kp': { label: "КП", cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80" },
    'review': { label: "На проверке", cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80" },
    'approved': { label: "Одобрен", cls: "bg-green-50 text-green-700 ring-1 ring-green-200/80" },
  };

  const c = map[status] || { label: status, cls: "bg-slate-50 text-slate-600 ring-1 ring-slate-200/80" };
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  );
}