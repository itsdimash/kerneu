import { Cpu, Wifi, WifiOff, Wrench } from "lucide-react";
import { ROBOT_FLEET_INIT, fleetSummary, type RobotUnitStatus } from "../../../data/robotFleet";

const STATUS_META: Record<RobotUnitStatus, { label: string; dot: string; icon: typeof Wifi }> = {
  operational: { label: "В работе", dot: "bg-success", icon: Wifi },
  maintenance: { label: "Обслуживание", dot: "bg-warning", icon: Wrench },
  offline: { label: "Офлайн", dot: "bg-muted-foreground", icon: WifiOff },
};

export function RobotFleetWidget() {
  const fleet = ROBOT_FLEET_INIT;
  const { total, operational, avgUptime } = fleetSummary(fleet);

  return (
    <div className="bg-card rounded-lg border border-border shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-info-muted text-info flex items-center justify-center">
            <Cpu size={15} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Робототехнический парк</h3>
            <p className="text-xs text-muted-foreground">{operational}/{total} в работе · аптайм {avgUptime}%</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {fleet.map((unit) => {
          const meta = STATUS_META[unit.status];
          const StatusIcon = meta.icon;
          return (
            <div key={unit.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                {unit.status === "operational" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground font-mono">{unit.id}</p>
                  <span className="text-xs text-muted-foreground truncate">{unit.model} · {unit.site}</span>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 w-24 flex-shrink-0">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${unit.batteryPercent > 20 ? "bg-success" : "bg-destructive"}`}
                    style={{ width: `${unit.batteryPercent}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{unit.batteryPercent}%</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0 w-28 justify-end">
                <StatusIcon size={11} />
                {meta.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
