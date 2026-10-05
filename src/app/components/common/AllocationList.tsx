import type { PartnerRequestAllocation } from "../../../api/partner";
import { WarehouseChip } from "./WarehouseChip";

// Склады позиции партнёрской заявки — единое правило для всех экранов:
// • один склад — только название (количество уже есть в колонке «Кол.»);
// • два и больше — «Название | число» для каждого;
// • пусто — «—».
export function AllocationList({
  allocations,
  layout = "inline",
  unit,
}: {
  allocations: PartnerRequestAllocation[] | undefined;
  /** inline — для ячейки таблицы; list — для диалогов подтверждения (число с единицей рядом) */
  layout?: "inline" | "list";
  /** Единица после числа — только для layout="list" при нескольких складах */
  unit?: string | null;
}) {
  const items = allocations ?? [];
  if (items.length === 0) {
    return layout === "list" ? <p className="mt-0.5 text-xs text-muted-foreground">—</p> : <>—</>;
  }

  const withQuantity = items.length > 1;

  return (
    <span className={`flex flex-wrap gap-1.5 ${layout === "list" ? "mt-1" : ""}`}>
      {items.map((a) => (
        <WarehouseChip
          key={a.warehouse_id}
          id={a.warehouse_id}
          name={a.warehouse_name}
          quantity={withQuantity ? a.quantity : null}
          unit={layout === "list" ? unit : null}
        />
      ))}
    </span>
  );
}
