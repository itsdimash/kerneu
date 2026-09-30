import { useState } from "react";
import { Loader2, Truck } from "lucide-react";
import {
  updateProjectItemSource,
  type ProjectItemResponse,
  type SupplySource,
} from "../../../api/api";

const SOURCE_LABELS: Record<SupplySource, string> = {
  stock: "Закупка",
  supplier_direct: "Со склада поставщика",
};

// Бейдж получает только источник, отличный от обычной закупки: прямая
// отгрузка со склада поставщика (такая позиция не попадает в приход).
export function SupplySourceBadge({
  source,
  className,
}: {
  source: SupplySource | undefined;
  className?: string;
}) {
  if (source === "supplier_direct") {
    return (
      <span
        title="Отгружается напрямую со склада поставщика, на наш склад не приходит"
        className={`inline-flex w-fit items-center gap-1 rounded-md bg-sky-100 dark:bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300 ${className ?? ""}`}
      >
        <Truck size={10} className="shrink-0" />
        От поставщика
      </span>
    );
  }
  return null;
}

// Подписи для уже состоявшейся отгрузки не через наш склад (история отгрузок).
export const SUPPLY_SOURCE_SHIPPED_LABELS: Partial<Record<SupplySource, string>> = {
  supplier_direct: "Отправлено со склада поставщика",
};

// Статус закрытого (denied) прихода, за которым стоит отгрузка мимо склада:
// физически товар ещё не отправлен, приход просто не нужен — поэтому будущее
// время, а не подписи из SUPPLY_SOURCE_SHIPPED_LABELS (те — про факт отгрузки).
export const SUPPLY_SOURCE_PENDING_SHIPMENT_LABELS: Partial<Record<SupplySource, string>> = {
  supplier_direct: "Будет отправлено со склада поставщика",
};

const DEFAULT_SOURCE_OPTIONS: SupplySource[] = ["stock"];

interface SupplySourceFieldProps {
  value: SupplySource | undefined;
  onChange: (next: SupplySource) => void;
  disabled?: boolean;
  saving?: boolean;
  error?: string | null;
  // Какие варианты предлагать выбрать. Текущее значение, которого нет в
  // списке (например supplier_direct на странице проекта), показывается
  // как есть, а не подменяется на "Закупка".
  options?: SupplySource[];
  // Источник зафиксирован (проект ушёл дальше редактирования / договор
  // подписан): рисуем статичное значение без <select> и без стрелки —
  // чтобы не выглядело как поле, которое можно открыть.
  readOnly?: boolean;
}

// Чисто визуальный селект источника: сам ничего не сохраняет, вызов API —
// на стороне родителя (project_item через SupplySourceSelect ниже или
// ml_import_item через handleMlItemUpdate в таблице черновика).
export function SupplySourceField({
  value,
  onChange,
  disabled,
  saving,
  error,
  options = DEFAULT_SOURCE_OPTIONS,
  readOnly,
}: SupplySourceFieldProps) {
  const selectValue: SupplySource = value ?? "stock";
  if (readOnly) {
    return (
      <span
        title="Источник зафиксирован и не меняется"
        aria-label="Источник позиции"
        className="inline-flex w-fit items-center rounded-md border border-border bg-muted px-1.5 py-1 text-xs text-foreground whitespace-nowrap cursor-default"
      >
        {SOURCE_LABELS[selectValue]}
      </span>
    );
  }
  const shown = options.includes(selectValue) ? options : [...options, selectValue];
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5">
        <select
          value={selectValue}
          disabled={disabled || saving}
          onChange={(event) => {
            const next = event.target.value as SupplySource;
            if (next !== selectValue) onChange(next);
          }}
          aria-label="Источник позиции"
          className="rounded-md border border-border bg-card px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-primary disabled:bg-muted"
        >
          {shown.map((source) => (
            <option key={source} value={source}>{SOURCE_LABELS[source]}</option>
          ))}
        </select>
        {saving && <Loader2 size={13} className="animate-spin text-primary" />}
      </div>
      {error && <span className="max-w-[180px] text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

interface SupplySourceSelectProps {
  projectId: number | string;
  itemId: number;
  value: SupplySource | undefined;
  onUpdated: (updated: ProjectItemResponse) => void;
  options?: SupplySource[];
}

// Выбор источника позиции для PM у позиции проекта (после одобрения). Как и
// FixProductButton — точечный PATCH позиции; причину отказа backend'а
// показываем под селектом, потому что заранее её не знаем.
export function SupplySourceSelect({ projectId, itemId, value, onUpdated, options }: SupplySourceSelectProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (next: SupplySource) => {
    setSaving(true);
    setError(null);
    try {
      onUpdated(await updateProjectItemSource(projectId, itemId, next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить источник");
    } finally {
      setSaving(false);
    }
  };

  return <SupplySourceField value={value} onChange={handleChange} saving={saving} error={error} options={options} />;
}