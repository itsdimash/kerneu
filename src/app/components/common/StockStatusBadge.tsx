import {
  ML_STATUS_STYLES,
  UNKNOWN_ML_STATUS_STYLE,
  normalizeMlStatus,
} from "../../../lib/stockStatus";

interface StockStatusBadgeProps {
  status: string | null | undefined;
  // Переопределяет видимый текст, не трогая цвет — нужно кит-пикеру,
  // чтобы показать «Не хватает N» тем же жёлтым стилем, что и «Есть в
  // системе (недостаточно)», вместо сырого названия статуса.
  label?: string;
  // По умолчанию — размер как в основной таблице позиций. Кит-пикер
  // передаёт свой (более компактный) набор классов отступов/шрифта.
  className?: string;
}

export function StockStatusBadge({ status, label, className }: StockStatusBadgeProps) {
  const normalized = normalizeMlStatus(status);
  const style = normalized ? ML_STATUS_STYLES[normalized] : UNKNOWN_ML_STATUS_STYLE;
  const text = label ?? normalized ?? status?.trim() ?? "Статус не указан";

  return (
    <span
        className={`inline-flex rounded-md font-semibold whitespace-nowrap ${className ?? "px-2.5 py-1 text-xs"} ${style.badge}`}
    >
      {text}
    </span>
  );
}
