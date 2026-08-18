import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

const API_BASE = "/api/v1";

type StatusItem = {
  status: string;
  color: string;
  count: number;
  percent: number;
};

type StatusBreakdownResponse = {
  total: number;
  items: StatusItem[];
};

/**
 * Виджет "Статусы проектов" — замена "Робототехнический парк" на дашборде.
 * Донат-чарт: сколько проектов сейчас на каждом этапе воронки
 * (Активный закуп / На отгрузке / На приходе / Ожидание клиента / Завершен и т.д.)
 *
 * Использует уже существующий цвет из project_statuses.color, так что
 * ничего дополнительно настраивать не нужно — цвета сегментов будут
 * совпадать с цветами статусов, которые уже используются в остальном UI.
 */
export function ProjectStatusBreakdown() {
  const [data, setData] = useState<StatusBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_BASE}/dashboard/project-status-breakdown`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Не удалось загрузить статусы проектов");
        const json = (await response.json()) as StatusBreakdownResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Не удалось загрузить данные");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-card rounded-lg border border-border p-5 transition-shadow transition-colors duration-200 hover:shadow-elevated hover:border-primary/20">
      <h3 className="text-sm font-semibold text-foreground mb-4">Статусы проектов</h3>

      {loading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground text-sm">
          <AlertTriangle size={16} className="text-amber-500" />
          {error}
        </div>
      )}

      {!loading && !error && data && data.total === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">Пока нет активных проектов</p>
      )}

      {!loading && !error && data && data.total > 0 && (
        <StatusBreakdownChart items={data.items} total={data.total} />
      )}
    </div>
  );
}

/**
 * Split out purely so the entrance/hover animation state resets naturally
 * whenever this mounts fresh with real data — same data, same markup, just
 * wired up to animate. Legend hover and segment hover share one state so
 * either side can highlight the other.
 */
function StatusBreakdownChart({ items, total }: { items: StatusItem[]; total: number }) {
  const [hoverStatus, setHoverStatus] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-4">
      <Donut items={items} total={total} hoverStatus={hoverStatus} onHoverChange={setHoverStatus} />
      <ul className="flex-1 space-y-2.5 min-w-0">
        {items.map((item, i) => (
          <li
            key={item.status}
            onMouseEnter={() => setHoverStatus(item.status)}
            onMouseLeave={() => setHoverStatus(null)}
            className={`flex items-center text-sm rounded-md px-1.5 -mx-1.5 py-1 cursor-default transition-colors duration-150 animate-in fade-in slide-in-from-left-1 fill-mode-both ${
              hoverStatus === item.status ? "bg-muted" : ""
            }`}
            style={{ animationDelay: `${i * 60}ms`, animationDuration: "400ms" }}
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0 mr-2 transition-transform duration-150"
              style={{
                backgroundColor: item.color,
                transform: hoverStatus === item.status ? "scale(1.25)" : "scale(1)",
              }}
            />
            <span
              className={`truncate transition-colors duration-150 ${
                hoverStatus === item.status ? "text-foreground font-medium" : "text-foreground"
              }`}
            >
              {item.status}
            </span>
            <span className="text-muted-foreground font-semibold ml-1.5 flex-shrink-0">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Donut({
  items,
  total,
  hoverStatus,
  onHoverChange,
}: {
  items: StatusItem[];
  total: number;
  hoverStatus: string | null;
  onHoverChange: (status: string | null) => void;
}) {
  const size = 190;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Same mount-triggered entrance pattern as the revenue chart: draw each
  // segment in from 0, staggered, using the exact same real percentages —
  // nothing here changes what the final, settled values are.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  let cumulativePercent = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 -rotate-90">
      {items.map((item, i) => {
        const fraction = item.percent / 100;
        const dash = fraction * circumference;
        const gap = circumference - dash;
        const offset = (cumulativePercent / 100) * circumference;
        cumulativePercent += item.percent;

        const isHovered = hoverStatus === item.status;
        const isDimmed = hoverStatus !== null && !isHovered;

        return (
          <circle
            key={item.status}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={item.color}
            strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
            strokeDasharray={animated ? `${dash} ${gap}` : `0 ${circumference}`}
            strokeDashoffset={-offset}
            onMouseEnter={() => onHoverChange(item.status)}
            onMouseLeave={() => onHoverChange(null)}
            style={{
              opacity: isDimmed ? 0.45 : 1,
              cursor: "default",
              transformBox: "fill-box",
              transformOrigin: "50% 50%",
              transition:
                `stroke-dasharray 900ms cubic-bezier(0.65,0,0.35,1) ${i * 90}ms, ` +
                "stroke-width 150ms ease-out, opacity 150ms ease-out",
            }}
          />
        );
      })}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground"
        style={{
          fontSize: 34,
          fontWeight: 600,
          transform: `rotate(90deg)`,
          transformOrigin: "center",
          opacity: animated ? 1 : 0,
          transition: "opacity 400ms ease-out 500ms",
        }}
      >
        {total}
      </text>
    </svg>
  );
}
