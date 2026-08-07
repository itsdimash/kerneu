import { TrendingUp, TrendingDown } from "lucide-react";
export function StatCard({ label, value, sub, delta, icon: Icon, iconColor = "text-blue-500 dark:text-indigo-300", iconBg = "bg-blue-50 dark:bg-indigo-400/15" }: {
  label: string; value: string; sub?: string; delta?: string;
  icon: React.ElementType; iconColor?: string; iconBg?: string;
}) {
  const up = delta && delta.startsWith("+");
  return (
    <div className="group bg-card rounded-lg border border-border p-5 flex gap-4 shadow-card transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <p className="font-mono text-2xl font-semibold text-foreground leading-none mb-1.5 tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground/80">{sub}</p>}
        {delta && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}>
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}