import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ReceiptStatus } from "../../../types";
export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  if (status === "Проверен")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success-muted px-2 py-0.5 rounded-md ring-1 ring-success/25"><CheckCircle2 size={10} /> Проверен</span>;
  if (status === "Отклонен")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive-muted px-2 py-0.5 rounded-md ring-1 ring-destructive/20"><XCircle size={10} /> Отклонен</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning-muted px-2 py-0.5 rounded-md ring-1 ring-warning/25"><Clock size={10} /> В обработке</span>;
}
