import { AlertCircle, CheckCircle2 } from "lucide-react";
export type BannerVariant = "neutral" | "warning" | "info" | "success";
export function InfoBanner({ variant, text }: { variant: BannerVariant; text: string }) {
  const styles: Record<BannerVariant, string> = {
    neutral: "bg-slate-50 border-slate-200 text-slate-700",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info:    "bg-blue-50 border-blue-200 text-blue-800",
    success: "bg-green-50 border-green-200 text-green-800",
  };
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;
  const iconCls: Record<BannerVariant, string> = {
    neutral: "text-slate-400", warning: "text-amber-500", info: "text-blue-500", success: "text-green-600",
  };
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm mb-5 ${styles[variant]}`}>
      <Icon size={15} className={`flex-shrink-0 mt-0.5 ${iconCls[variant]}`} />
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}
