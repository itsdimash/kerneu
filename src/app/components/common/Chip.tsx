
export function Chip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:      { label: "Активен",           cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80" },
    pending:     { label: "На согласовании",   cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80" },
    review:      { label: "На проверке",       cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80" },
    completed:   { label: "Завершён",          cls: "bg-green-50 text-green-700 ring-1 ring-green-200/80" },
    approved:    { label: "Одобрен",           cls: "bg-green-50 text-green-700 ring-1 ring-green-200/80" },
    rejected:    { label: "Отклонён",          cls: "bg-red-50 text-red-700 ring-1 ring-red-200/80" },
    paid:        { label: "Оплачен",           cls: "bg-green-50 text-green-700 ring-1 ring-green-200/80" },
    kp:          { label: "КП",                cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80" },
    contract:    { label: "Договор",           cls: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80" },
    procurement: { label: "Закупка",           cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200/80" },
    documents:   { label: "Документы",         cls: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80" },
    arrived:     { label: "Получен",           cls: "bg-green-50 text-green-700 ring-1 ring-green-200/80" },
    transit:     { label: "В пути",            cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80" },
    shipped:     { label: "Отгружен",          cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80" },
    prepared:    { label: "Подготовлен",       cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80" },
    low:         { label: "Низкий",            cls: "bg-red-50 text-red-700 ring-1 ring-red-200/80" },
  };
  const c = map[status] || { label: status, cls: "bg-slate-50 text-slate-600 ring-1 ring-slate-200/80" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.cls}`}>{c.label}</span>;
}