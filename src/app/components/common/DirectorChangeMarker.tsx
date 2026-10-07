import { useState } from "react";
import { Pencil } from "lucide-react";
import type { DirectorChange } from "../../../api/api";

const FIELD_LABELS: Record<DirectorChange["field"], string> = {
  name: "Название",
  quantity: "Количество",
  price: "Цена продажи",
  supplier: "Поставщик",
  cost_price: "Себестоимость",
};

const MONEY_FIELDS = new Set<DirectorChange["field"]>(["price", "cost_price"]);

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) + " ₸";

const formatValue = (field: DirectorChange["field"], value: DirectorChange["from_value"]) => {
  if (value == null || value === "") return "—";
  if (MONEY_FIELDS.has(field)) {
    const amount = Number(value);
    return Number.isFinite(amount) ? formatMoney(amount) : String(value);
  }
  return String(value);
};

export interface DirectorChangeComponent {
  name: string;
  changes: DirectorChange[];
}

interface DirectorChangeMarkerProps {
  // Изменения одной позиции.
  changes?: DirectorChange[] | null;
  // Для заголовка комплекта: изменения по компонентам, с их названиями.
  components?: DirectorChangeComponent[];
}

// Значок «Комдир менял эту строку» — только индикатор, не кнопка. Список
// изменений приходит с backend (director_changes), на фронте ничего не
// вычисляется; без изменений (или на старом backend без поля) не рисуется.
export function DirectorChangeMarker({ changes, components }: DirectorChangeMarkerProps) {
  const [show, setShow] = useState(false);

  const sections: DirectorChangeComponent[] = [
    ...(changes && changes.length > 0 ? [{ name: "", changes }] : []),
    ...(components ?? []).filter((component) => component.changes.length > 0),
  ];
  if (sections.length === 0) return null;

  const author = sections
    .flatMap((section) => section.changes)
    .map((change) => change.changed_by_name)
    .find((name) => Boolean(name));

  return (
    <span
      className="relative inline-flex flex-shrink-0 items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      aria-label="Изменено Комдиром"
    >
      <Pencil size={13} className="text-muted-foreground" />
      {show && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 space-y-1.5 rounded-md bg-slate-900 px-2.5 py-2 text-xs font-normal text-white shadow-lg">
          {sections.map((section, sectionIndex) => (
            <span key={`${section.name}-${sectionIndex}`} className="block space-y-0.5">
              {section.name && <span className="block font-semibold">{section.name}</span>}
              {section.changes.map((change, changeIndex) => (
                <span key={changeIndex} className="block whitespace-normal">
                  {FIELD_LABELS[change.field] ?? change.field}: было {formatValue(change.field, change.from_value)} → стало{" "}
                  {formatValue(change.field, change.to_value)}
                </span>
              ))}
            </span>
          ))}
          {author && <span className="block border-t border-white/20 pt-1 text-white/70">Изменил: {author}</span>}
        </span>
      )}
    </span>
  );
}
