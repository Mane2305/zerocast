import type { components } from "./api/schema";
import { object } from "./forecast.ts";
import { periodKey, type BacktestPoint } from "./forecast-story.ts";
export type Accuracy = components["schemas"]["AccuracyResult"];
export type AccuracySeries = Accuracy["series"][number];
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const metrics = (v: unknown) =>
  object(v) &&
  finite(v.wape) &&
  v.wape >= 0 &&
  finite(v.bias_pct) &&
  finite(v.coverage_p10_p90) &&
  v.coverage_p10_p90 >= 0 &&
  v.coverage_p10_p90 <= 1 &&
  (v.naive_wape === undefined ||
    v.naive_wape === null ||
    (finite(v.naive_wape) && v.naive_wape >= 0)) &&
  (v.improvement_vs_naive_pct === undefined ||
    v.improvement_vs_naive_pct === null ||
    finite(v.improvement_vs_naive_pct));
export function validAccuracy(v: unknown): v is Accuracy {
  if (
    !object(v) ||
    !Number.isInteger(v.horizon) ||
    Number(v.horizon) < 1 ||
    !Number.isInteger(v.origins) ||
    Number(v.origins) < 1 ||
    !metrics(v.portfolio) ||
    !Array.isArray(v.series)
  )
    return false;
  const ids = new Set<string>();
  return v.series.every((item) => {
    if (
      !object(item) ||
      typeof item.series_id !== "string" ||
      ids.has(item.series_id) ||
      !metrics(item) ||
      !object(item.backtest) ||
      !Array.isArray(item.quantile_coverage) ||
      !item.quantile_coverage.every(
        (q) =>
          object(q) &&
          finite(q.level) &&
          q.level >= 0 &&
          q.level <= 1 &&
          finite(q.observed) &&
          q.observed >= 0 &&
          q.observed <= 1,
      )
    )
      return false;
    const b = item.backtest;
    if (
      new Set(item.quantile_coverage.map((q) => (q as { level: number }).level))
        .size !== item.quantile_coverage.length
    )
      return false;
    if (
      !Array.isArray(b.dates) ||
      !b.dates.every(
        (date, i, dates) =>
          typeof date === "string" &&
          Number.isFinite(Date.parse(date)) &&
          (!i || periodKey(date) > periodKey(dates[i - 1] as string)),
      ) ||
      ![b.actual, b.p10, b.p50, b.p90].every(
        (values) =>
          Array.isArray(values) &&
          values.length === (b.dates as unknown[]).length,
      )
    )
      return false;
    const actual = b.actual as unknown[],
      low = b.p10 as unknown[],
      middle = b.p50 as unknown[],
      high = b.p90 as unknown[];
    if (
      !actual.every((value) => value === null || finite(value)) ||
      !low.every(
        (value, i) =>
          finite(value) &&
          finite(middle[i]) &&
          finite(high[i]) &&
          value <= Number(middle[i]) &&
          Number(middle[i]) <= Number(high[i]),
      )
    )
      return false;
    ids.add(item.series_id);
    return true;
  });
}
export function lastBacktest(
  accuracy: Accuracy | undefined,
  id: string,
  forecastStart: string,
): BacktestPoint[] {
  const item = accuracy?.series.find((item) => item.series_id === id);
  if (!item || !accuracy) return [];
  const b = item.backtest;
  if (b.dates.some((date) => periodKey(date) >= periodKey(forecastStart)))
    return [];
  return b.dates
    .map((date, i) => ({
      date,
      actual: b.actual[i],
      expected_p10: b.p10[i],
      expected_p50: b.p50[i],
      expected_p90: b.p90[i],
    }))
    .slice(-accuracy.horizon);
}
