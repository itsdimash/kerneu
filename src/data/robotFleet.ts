// MOCK — placeholder fleet-telemetry data for the Dashboard's "Робототехнический парк"
// widget. Isolated here so it's a single, obvious spot to swap for a real
// endpoint (e.g. GET /api/v1/fleet/status) once the backend exposes one —
// the widget component itself only depends on the RobotUnit shape below.

export type RobotUnitStatus = "operational" | "maintenance" | "offline";

export type RobotUnit = {
  id: string;
  name: string;
  model: string;
  site: string;
  status: RobotUnitStatus;
  uptimePercent: number;
  batteryPercent: number;
  lastPing: string;
};

export const ROBOT_FLEET_INIT: RobotUnit[] = [
  { id: "RX-01", name: "Юнит RX-01", model: "Unitree G1", site: "Склад Карабулак", status: "operational", uptimePercent: 99.2, batteryPercent: 87, lastPing: "только что" },
  { id: "RX-02", name: "Юнит RX-02", model: "Unitree G1", site: "Склад Абишова", status: "operational", uptimePercent: 98.6, batteryPercent: 74, lastPing: "2 мин назад" },
  { id: "RX-03", name: "Юнит RX-03", model: "Unitree H1", site: "Цех сборки №2", status: "maintenance", uptimePercent: 91.4, batteryPercent: 42, lastPing: "18 мин назад" },
  { id: "RX-04", name: "Юнит RX-04", model: "Unitree G1", site: "Склад Карабулак", status: "operational", uptimePercent: 99.8, batteryPercent: 95, lastPing: "только что" },
  { id: "RX-05", name: "Юнит RX-05", model: "Unitree H1", site: "Цех сборки №1", status: "offline", uptimePercent: 76.1, batteryPercent: 0, lastPing: "3 ч назад" },
];

export function fleetSummary(fleet: RobotUnit[] = ROBOT_FLEET_INIT) {
  const operational = fleet.filter((r) => r.status === "operational").length;
  const avgUptime = fleet.reduce((sum, r) => sum + r.uptimePercent, 0) / fleet.length;
  return {
    total: fleet.length,
    operational,
    avgUptime: Math.round(avgUptime * 10) / 10,
  };
}
