import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart";

// MOCK — placeholder monthly revenue series. Replace once the backend exposes
// a historical endpoint (fetchDashboardStats today only returns the current
// month's snapshot, not a series) — swap this array for the real response,
// the chart/config below don't need to change shape-wise.
const REVENUE_TREND_MOCK = [
  { month: "Фев", plan: 24.1, fact: 22.4 },
  { month: "Мар", plan: 27.8, fact: 26.9 },
  { month: "Апр", plan: 29.2, fact: 31.0 },
  { month: "Май", plan: 31.5, fact: 29.8 },
  { month: "Июн", plan: 33.0, fact: 34.6 },
  { month: "Июл", plan: 35.4, fact: 38.2 },
];

const chartConfig = {
  plan: { label: "План", color: "var(--chart-3)" },
  fact: { label: "Факт", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function RevenueTrendWidget() {
  return (
    <div className="bg-card rounded-lg border border-border shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-success-muted text-success flex items-center justify-center">
            <TrendingUp size={15} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Динамика выручки</h3>
            <p className="text-xs text-muted-foreground">План vs факт, млн ₸</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={REVENUE_TREND_MOCK} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillFact" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-fact)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-fact)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs font-mono"
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area
              dataKey="plan"
              type="monotone"
              stroke="var(--color-plan)"
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
            <Area
              dataKey="fact"
              type="monotone"
              stroke="var(--color-fact)"
              strokeWidth={2.5}
              fill="url(#fillFact)"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
