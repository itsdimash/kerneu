import React, { useEffect, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp } from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

type RevenuePoint = {
  month: string; // "2026-01"
  label: string; // "янв 2026"
  revenue: number;
};

type RevenueDynamicsResponse = {
  items: RevenuePoint[];
};

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн ₸`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} тыс ₸`;
  return `${value.toFixed(0)} ₸`;
}

/**
 * Виджет "Динамика выручки" — реальные данные с бэкенда
 * (GET /api/v1/dashboard/revenue-dynamics) вместо статичного мока.
 * Линейный график на чистом SVG, без внешних зависимостей от chart-библиотек.
 */
export function RevenueTrendWidget() {
  const [data, setData] = useState<RevenueDynamicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_BASE}/dashboard/revenue-dynamics?months=12`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Не удалось загрузить динамику выручки");
        const json = (await response.json()) as RevenueDynamicsResponse;
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

  const items = data?.items ?? [];
  const total = items.reduce((sum, item) => sum + item.revenue, 0);
  const lastMonth = items[items.length - 1];
  const prevMonth = items[items.length - 2];
  const delta =
    lastMonth && prevMonth && prevMonth.revenue > 0
      ? ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
      : null;

  return (
    <div className="bg-card rounded-lg border border-border p-5 transition-shadow transition-colors duration-200 hover:shadow-elevated hover:border-primary/20">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-foreground">Динамика выручки</h3>
        {delta !== null && (
          <span
            className={`text-xs font-medium flex items-center gap-1 ${
              delta >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
            }`}
          >
            <TrendingUp size={12} className={delta < 0 ? "rotate-180" : ""} />
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}% за месяц
          </span>
        )}
      </div>
      {!loading && !error && items.length > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Итого за {items.length} мес.: <span className="text-foreground font-medium">{formatCompact(total)}</span>
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground text-sm">
          <AlertTriangle size={16} className="text-amber-500" />
          {error}
        </div>
      )}

      {!loading && !error && items.length > 0 && <RevenueLineChart items={items} />}
    </div>
  );
}

function RevenueLineChart({ items }: { items: RevenuePoint[] }) {
  const width = 480;
  const height = 160;
  const paddingX = 8;
  const paddingY = 12;

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Triggers the entrance draw-in once, right after this chart mounts (i.e.
  // right when real data first becomes available). Pure presentation state —
  // doesn't touch fetching/loading/error logic above. prefers-reduced-motion
  // is handled globally (see theme.css), so no extra branching needed here.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  const maxRevenue = Math.max(...items.map((i) => i.revenue), 1);
  const stepX = (width - paddingX * 2) / Math.max(items.length - 1, 1);

  const points = items.map((item, i) => {
    const x = paddingX + i * stepX;
    const y = height - paddingY - (item.revenue / maxRevenue) * (height - paddingY * 2);
    return { x, y, item };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  // Показываем подписи месяцев не под каждой точкой (тесно), а через шаг
  const labelStep = Math.ceil(items.length / 6);

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * width;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relativeX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHoverIndex(closest);
  };

  return (
    <div>
      <div className="relative">
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2E75B5" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2E75B5" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={areaPath}
            fill="url(#revenueFill)"
            style={{
              opacity: animated ? 1 : 0,
              transition: "opacity 700ms ease-out 500ms",
            }}
          />
          <path
            d={linePath}
            fill="none"
            stroke="#2E75B5"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: animated ? 0 : 1,
              transition: "stroke-dashoffset 1100ms cubic-bezier(0.65,0,0.35,1)",
            }}
          />
          {hovered && (
            <line
              x1={hovered.x}
              y1={paddingY}
              x2={hovered.x}
              y2={height - paddingY}
              stroke="#94A3B8"
              strokeWidth={1}
              strokeDasharray="3 3"
              className="animate-in fade-in duration-150"
            />
          )}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === hoverIndex ? 4.5 : i === points.length - 1 ? 3.5 : 2.5}
              fill="#2E75B5"
              stroke={i === hoverIndex ? "white" : "none"}
              strokeWidth={i === hoverIndex ? 1.5 : 0}
              style={{
                opacity: animated ? 1 : 0,
                transform: animated ? "scale(1)" : "scale(0.2)",
                transformBox: "fill-box",
                transformOrigin: "50% 50%",
                filter: i === hoverIndex ? "drop-shadow(0 0 4px rgba(46,117,181,0.65))" : "none",
                transition:
                  `opacity 350ms ease-out ${(i / Math.max(points.length - 1, 1)) * 900}ms, ` +
                  `transform 450ms cubic-bezier(0.34,1.56,0.64,1) ${(i / Math.max(points.length - 1, 1)) * 900}ms, ` +
                  "r 150ms ease-out, filter 150ms ease-out",
              }}
            />
          ))}
          {/* Прозрачная область для ловли hover по всей ширине графика */}
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full bg-slate-900 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: `${(hovered.x / width) * 100}%`,
              top: `${(hovered.y / height) * 100}%`,
              marginTop: -10,
            }}
          >
            <div className="font-medium">{hovered.item.label}</div>
            <div className="text-slate-300">{formatCompact(hovered.item.revenue)}</div>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-2">
        {items.map((item, i) =>
          i % labelStep === 0 || i === items.length - 1 ? (
            <span
              key={item.month}
              className={`text-[10px] ${i === hoverIndex ? "text-foreground font-medium" : "text-muted-foreground"}`}
            >
              {item.label}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}
