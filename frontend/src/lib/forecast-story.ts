import type { Review } from "./review";
import { object } from "./forecast.ts";
export type ReviewSeries = Review["series"][number];
export type BacktestPoint = {
  date: string;
  actual: number | null;
  expected_p50: number;
  expected_p10?: number;
  expected_p90?: number;
};
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
// Optional producer additions requested by the owner. Keep them independent of
// core forecast validity: unavailable or invalid arrays must never be invented.
export function suppliedPaths(series: unknown, horizon: number): number[][] {
  if (
    !object(series) ||
    !Array.isArray(series.sample_paths) ||
    !series.sample_paths.length ||
    series.sample_paths.length > 100
  )
    return [];
  return series.sample_paths.every(
    (row) => Array.isArray(row) && row.length === horizon && row.every(finite),
  )
    ? series.sample_paths
    : [];
}
export function suppliedBacktest(series: unknown): BacktestPoint[] {
  if (!object(series) || !Array.isArray(series.backtest_points)) return [];
  const points = series.backtest_points;
  if (
    !points.every(
      (p) =>
        object(p) &&
        typeof p.date === "string" &&
        Number.isFinite(Date.parse(p.date)) &&
        finite(p.actual) &&
        finite(p.expected_p50) &&
        (p.expected_p10 === undefined ||
          (finite(p.expected_p10) && p.expected_p10 <= p.expected_p50)) &&
        (p.expected_p90 === undefined ||
          (finite(p.expected_p90) && p.expected_p90 >= p.expected_p50)),
    )
  )
    return [];
  if (new Set(points.map((p) => periodKey(p.date))).size !== points.length)
    return [];
  return [...points].sort((a, b) =>
    periodKey(a.date).localeCompare(periodKey(b.date)),
  ) as BacktestPoint[];
}
export function periodKey(date: string) {
  return date.replace(" ", "T").slice(0, 19);
}
export function recentBacktest(points: BacktestPoint[]): BacktestPoint[] {
  if (!points.length) return [];
  const end = new Date(periodKey(points.at(-1)!.date) + "Z");
  const start = new Date(
    Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth() - 1,
      1,
      end.getUTCHours(),
      end.getUTCMinutes(),
      end.getUTCSeconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0),
  ).getUTCDate();
  start.setUTCDate(Math.min(end.getUTCDate(), lastDay));
  const cutoff = start.toISOString().slice(0, 19);
  return points.filter(
    (p) =>
      periodKey(p.date) > cutoff &&
      periodKey(p.date) <= periodKey(points.at(-1)!.date),
  );
}
export function periodUnit(frequency: string, count: number) {
  const unit =
    (
      {
        hourly: "hour",
        daily: "day",
        weekly: "week",
        monthly: "month",
        quarterly: "quarter",
        yearly: "year",
      } as Record<string, string>
    )[frequency] ?? "period";
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
