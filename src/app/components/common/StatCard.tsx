import { TrendingUp, TrendingDown } from "lucide-react";
export function StatCard({ label, value, sub, delta, icon: Icon, iconColor = "text-blue-500", iconBg = "bg-blue-50" }: {
  label: string; value: string; sub?: string; delta?: string;
  icon: React.ElementType; iconColor?: string; iconBg?: string;
}) {
  const up = delta && delta.startsWith("+");
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 flex gap-4">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
        <p className="text-xl font-semibold text-slate-900 leading-none mb-1">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
        {delta && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${up ? "text-green-600" : "text-red-500"}`}>
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}