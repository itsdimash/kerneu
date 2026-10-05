import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PARTNER_STATUS_LABEL, type PartnerRequestStatus } from "../../api/partner";

// Фирменный акцент Kerneu: сине-фиолетовый градиент (primary → violet).
export const BRAND_GRADIENT = "bg-gradient-to-r from-primary to-violet-600";
export const BRAND_TEXT_GRADIENT = "bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent";

// Карточка: rounded-2xl, тонкая граница, мягкая тень.
export const CARD = "rounded-2xl border border-border bg-card shadow-[var(--elevation-card)]";

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// ------------------------------------------
// Количество
// ------------------------------------------

export function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function QtyStepper({
  value,
  max,
  onChange,
  onRemove,
  label,
  disabled,
  size = "md",
}: {
  value: string;
  max: number;
  onChange: (next: string) => void;
  /** Если задан — «−» на единице удаляет позицию, иначе кнопка неактивна */
  onRemove?: () => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const current = parseQuantity(value);
  const btn = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const base = `flex ${btn} items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

  const dec = () => {
    if (current === null) return onChange("1");
    if (current <= 1) {
      onRemove?.();
      return;
    }
    onChange(String(current - 1));
  };
  const inc = () => onChange(String(Math.min(max, (current ?? 0) + 1)));

  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={dec}
        disabled={disabled || (current !== null && current <= 1 && !onRemove)}
        aria-label={`Уменьшить количество: ${label}`}
        className={base}
      >
        <Minus size={13} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        aria-label={`Количество: ${label}`}
        className={`${size === "sm" ? "h-7 w-10 text-xs" : "h-8 w-12 text-sm"} border-x border-border bg-transparent text-center font-mono font-medium text-foreground focus:outline-none focus:bg-accent/40 disabled:opacity-60`}
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled || (current !== null && current >= max)}
        aria-label={`Увеличить количество: ${label}`}
        className={base}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

// ------------------------------------------
// Бейджи
// ------------------------------------------

const STATUS_STYLE: Record<PartnerRequestStatus, { dot: string; cls: string }> = {
  pending_director: { dot: "bg-primary", cls: "bg-accent text-accent-foreground" },
  approved: { dot: "bg-success", cls: "bg-success-muted text-success" },
  issued: { dot: "bg-teal-500", cls: "bg-teal-50 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300" },
  rejected: { dot: "bg-destructive", cls: "bg-destructive-muted text-destructive" },
  cancelled: { dot: "bg-muted-foreground", cls: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status }: { status: PartnerRequestStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style.cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {PARTNER_STATUS_LABEL[status]}
    </span>
  );
}

// Остаток: мягкая индикация без «крика» (много / мало / нет).
const LOW_STOCK_THRESHOLD = 50;

export function AvailabilityBadge({ quantity, unit }: { quantity: number; unit?: string | null }) {
  const tone =
    quantity <= 0
      ? { dot: "bg-destructive", cls: "bg-destructive-muted text-destructive", hint: "нет в наличии" }
      : quantity < LOW_STOCK_THRESHOLD
        ? { dot: "bg-warning", cls: "bg-warning-muted text-warning", hint: "мало" }
        : { dot: "bg-success", cls: "bg-success-muted text-success", hint: "много" };
  return (
    <span
      title={tone.hint}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${tone.cls}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {quantity.toLocaleString("ru-RU")}
      {unit ? <span className="font-sans font-normal opacity-80">{unit}</span> : null}
    </span>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
