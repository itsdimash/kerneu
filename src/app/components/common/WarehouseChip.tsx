import { Warehouse } from "lucide-react";

// Цвет чипа закреплён за складом: оттенок выбирается по warehouse_id, поэтому один и тот
// же склад везде одного цвета. Оранжевый, жёлтый и красный не используем: они заняты под
// «Зарезервировано» и ошибки. Классы записаны целиком, чтобы Tailwind их увидел.
const TONES = [
  {
    chip: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200",
    count: "bg-indigo-100 text-indigo-900 dark:bg-indigo-400/20 dark:text-indigo-50",
  },
  {
    chip: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-200",
    count: "bg-teal-100 text-teal-900 dark:bg-teal-400/20 dark:text-teal-50",
  },
  {
    chip: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200",
    count: "bg-sky-100 text-sky-900 dark:bg-sky-400/20 dark:text-sky-50",
  },
  {
    chip: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-200",
    count: "bg-violet-100 text-violet-900 dark:bg-violet-400/20 dark:text-violet-50",
  },
] as const;

// id 1 → indigo, 2 → teal, 3 → sky, 4 → violet, 5 → indigo… Неизвестный id — indigo.
function toneFor(id: number | null | undefined) {
  if (id === null || id === undefined || !Number.isFinite(id)) return TONES[0];
  const n = TONES.length;
  return TONES[(((Math.trunc(id) - 1) % n) + n) % n];
}

/** Чип склада: иконка, название и необязательное число («Карабулак | 2 шт»). */
export function WarehouseChip({
  id,
  name,
  quantity,
  unit,
}: {
  id?: number | null;
  name: string;
  /** Число показываем только когда оно несёт новую информацию (складов несколько) */
  quantity?: number | string | null;
  unit?: string | null;
}) {
  const tone = toneFor(id);
  const hasQuantity = quantity !== null && quantity !== undefined && quantity !== "";
  const quantityText = hasQuantity ? `${typeof quantity === "number" ? quantity.toLocaleString("ru-RU") : quantity}${unit ? ` ${unit}` : ""}` : null;

  return (
    <span
      title={quantityText ? `${name}: ${quantityText}` : name}
      className={`inline-flex max-w-[220px] items-stretch overflow-hidden rounded-full border text-xs font-medium ${tone.chip}`}
    >
      <span className="inline-flex min-w-0 items-center gap-1 px-2.5 py-1">
        <Warehouse size={12} className="shrink-0" aria-hidden />
        <span className="truncate">{name}</span>
      </span>
      {quantityText && (
        <span className={`inline-flex shrink-0 items-center border-l border-current/20 px-2 py-1 font-mono font-semibold ${tone.count}`}>
          {quantityText}
        </span>
      )}
    </span>
  );
}

/** «+N ещё» — тот же стиль, но нейтральный и чуть бледнее; полный список в подсказке. */
export function WarehouseMoreChip({ count, title, ariaLabel, className = "" }: { count: number; title?: string; ariaLabel?: string; className?: string }) {
  return (
    <span
      tabIndex={0}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex cursor-help items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-300 ${className}`}
    >
      +{count} ещё
    </span>
  );
}
