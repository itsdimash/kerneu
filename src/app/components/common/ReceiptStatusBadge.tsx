import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ReceiptStatus } from "../../../types";
export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  if (status === "Проверен")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded ring-1 ring-green-200"><CheckCircle2 size={10} /> Проверен</span>;
  if (status === "Отклонен")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded ring-1 ring-red-200"><XCircle size={10} /> Отклонен</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded ring-1 ring-amber-200"><Clock size={10} /> В обработке</span>;
}
