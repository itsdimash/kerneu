import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Clock, FileMinus, FileText, FileX, XCircle } from "lucide-react";
import type { DocStatus } from "../../../store/documentsStore";

export function docStatusLabel(status: DocStatus) {
  if (status === "approved")  return "Одобрено клиентом";
  if (status === "rejected")  return "Отклонено клиентом";
  if (status === "generated") return "Сгенерирован";
  if (status === "no_contract") return "Без договора";
  if (status === "not_uploaded") return "Не загружен";
  if (status === "not_required") return "Не требуется";
  if (status === "uploaded")  return "Загружен";
  return "Ожидается";
}

// Токены темы вместо сырых blue-50/green-50/orange-50: так пилюля сама
// подстраивается под тёмную тему и совпадает с ReceiptStatusBadge —
// единой идиомой статус-бейджа в приложении.
const VARIANT: Record<DocStatus, { cls: string; icon: typeof Check }> = {
  pending:   { cls: "text-warning bg-warning-muted ring-warning/25",         icon: Clock },
  generated: { cls: "text-info bg-info-muted ring-info/25",                  icon: FileText },
  uploaded:  { cls: "text-success bg-success-muted ring-success/25",         icon: Check },
  approved:  { cls: "text-success bg-success-muted ring-success/25",         icon: CheckCircle2 },
  rejected:  { cls: "text-destructive bg-destructive-muted ring-destructive/20", icon: XCircle },
  // Нейтральный: договор осознанно не нужен — это штатное состояние, не
  // «успех» (как «Загружен») и не «ждём» (как «Ожидается»).
  no_contract: { cls: "text-muted-foreground bg-muted ring-border", icon: FileX },
  not_uploaded: { cls: "text-muted-foreground bg-muted ring-border", icon: FileMinus },
  not_required: { cls: "text-muted-foreground bg-muted ring-border", icon: FileX },
};

/**
 * Статус документа. Смена статуса («Ожидается» → «Загружен») — редкое
 * событие и заметное изменение состояния, поэтому цвет/фон/обводка
 * переезжают transition-ом (а не мгновенно), плюс один короткий «выдох»
 * по scale, чтобы взгляд поймал, какая именно строка изменилась.
 *
 * Именно transition, а не keyframes: статус может прийти повторно с
 * опроса бэкенда, и transition в этом случае доводит значение с текущей
 * точки, а не дёргает анимацию с нуля.
 */
export function DocStatusPill({ status }: { status: DocStatus }) {
  const [popping, setPopping] = useState(false);
  const previousStatus = useRef(status);

  useEffect(() => {
    if (previousStatus.current === status) return;
    previousStatus.current = status;
    setPopping(true);
    const timeoutId = window.setTimeout(() => setPopping(false), 250);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const { cls, icon: Icon } = VARIANT[status];

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 transition-[color,background-color,box-shadow,transform] duration-[250ms] ease-out-strong ${cls} ${
        popping ? "scale-[1.08]" : "scale-100"
      }`}
    >
      <Icon size={11} className="flex-shrink-0" />
      {docStatusLabel(status)}
    </span>
  );
}
