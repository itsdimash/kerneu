import type { StockPartnerReservation } from "../../api/api";
import { parsePartnerDate } from "../../lib/partnerRequests";

// Строки партнёрских заявок во всплывашке резервов товара (ReservationsPopover).
// Оформление — как у строк проектов. Поле partner_reservations может
// отсутствовать у старого бэкенда — тогда ничего не рисуется.
export function PartnerReservationRows({
  items,
  unit,
}: {
  items: StockPartnerReservation[] | undefined;
  unit: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <>
      {items.map((it) => {
        const decided = it.decided_at ? parsePartnerDate(it.decided_at) : null;
        return (
          <li key={`partner-${it.request_id}`} className="px-4 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <span className="text-sm font-medium text-foreground break-words">
                Партнёр: {it.client_name} · {it.project_name?.trim() ? it.project_name : "Без названия"} · №{it.request_id}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground ring-1 ring-primary/20">
                  Партнёрская заявка
                </span>
                <span className="text-xs text-muted-foreground">
                  {decided && !Number.isNaN(decided.getTime()) ? decided.toLocaleDateString("ru-RU") : "—"}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-sm font-mono text-foreground text-right whitespace-nowrap">
              {it.quantity.toLocaleString("ru-RU")} {unit}
            </span>
          </li>
        );
      })}
    </>
  );
}
