import { AlertCircle, CheckCircle2 } from "lucide-react";
export type BannerVariant = "neutral" | "warning" | "info" | "success";
export function InfoBanner({ variant, text }: { variant: BannerVariant; text: string }) {
  const styles: Record<BannerVariant, string> = {
    neutral: "bg-muted border-border text-foreground/80",
    warning: "bg-warning-muted border-warning/20 text-warning",
    info:    "bg-info-muted border-info/20 text-info",
    success: "bg-success-muted border-success/20 text-success",
  };
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;
  const iconCls: Record<BannerVariant, string> = {
    neutral: "text-muted-foreground", warning: "text-warning", info: "text-info", success: "text-success",
  };
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm mb-5 ${styles[variant]}`}>
      <Icon size={15} className={`flex-shrink-0 mt-0.5 ${iconCls[variant]}`} />
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}
