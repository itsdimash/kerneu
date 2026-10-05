import { useMemo } from "react";
import { CheckCircle2, Clock, PackageCheck } from "lucide-react";
import { Skeleton } from "../../app/components/ui/skeleton";
import type { PartnerRequestsState } from "./usePartnerRequests";
import { BRAND_TEXT_GRADIENT, CARD } from "./partnerUi";

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className={`${CARD} flex items-center gap-3 px-3 py-3 sm:px-4`}>
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary sm:flex">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-tight text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-8" />
        ) : (
          <p className={`text-xl font-bold leading-tight tracking-tight ${BRAND_TEXT_GRADIENT}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

// Плитки считаются по уже загруженным заявкам — отдельных запросов нет.
export function PartnerStats({ requests }: { requests: PartnerRequestsState }) {
  const stats = useMemo(() => {
    const count = (s: string) => requests.items.filter((r) => r.status === s).length;
    const plus = requests.truncated ? "+" : "";
    return {
      pending: `${count("pending_director")}`,
      approved: `${count("approved")}`,
      issued: `${count("issued")}${plus}`,
    };
  }, [requests.items, requests.truncated]);

  const loading = requests.loading && requests.items.length === 0;

  return (
    <div className="mb-5 grid grid-cols-3 gap-3 sm:gap-4" aria-label="Статистика заявок">
      <StatTile icon={Clock} label="На рассмотрении" value={stats.pending} loading={loading} />
      <StatTile icon={CheckCircle2} label="Одобрено" value={stats.approved} loading={loading} />
      <StatTile icon={PackageCheck} label="Выдано" value={stats.issued} loading={loading} />
    </div>
  );
}
