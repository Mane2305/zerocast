import type { components } from "./api/schema";
export type Forecast = components["schemas"]["ForecastResult"];
export type SeriesForecast = components["schemas"]["SeriesForecast"];
export type History = components["schemas"]["SeriesHistory"];
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const numbers = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every(finite);
const dates = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.every((x) => typeof x === "string" && Number.isFinite(Date.parse(x))) &&
  v.every((x, i) => !i || Date.parse(x) > Date.parse(v[i - 1]));
const ordered = (v: number[]) => v.every((x, i) => !i || x >= v[i - 1]);
export function validHistory(v: unknown): v is History {
  return (
    object(v) &&
    typeof v.series_id === "string" &&
    dates(v.dates) &&
    Array.isArray(v.target) &&
    v.target.length === v.dates.length &&
    v.target.every((x) => x === null || finite(x))
  );
}
export function validForecast(v: unknown): v is Forecast {
  if (
    !object(v) ||
    !numbers(v.quantile_levels) ||
    !ordered(v.quantile_levels) ||
    new Set(v.quantile_levels).size !== v.quantile_levels.length ||
    ![0.1, 0.3, 0.5, 0.7, 0.9].every((q) =>
      (v.quantile_levels as number[]).includes(q),
    ) ||
    !Array.isArray(v.series)
  )
    return false;
  const levels = v.quantile_levels;
  const seen = new Set<string>();
  return v.series.every((s) => {
    if (
      !object(s) ||
      typeof s.series_id !== "string" ||
      seen.has(s.series_id) ||
      !dates(s.dates) ||
      !Array.isArray(s.quantiles) ||
      s.quantiles.length !== levels.length ||
      !s.quantiles.every(
        (q) => numbers(q) && q.length === (s.dates as string[]).length,
      ) ||
      !object(s.total_distribution) ||
      !["sum", "mean"].includes(String(s.total_distribution.aggregation)) ||
      !numbers(s.total_distribution.percentiles) ||
      s.total_distribution.percentiles.length !== 101 ||
      !ordered(s.total_distribution.percentiles) ||
      !finite(s.latency_ms) ||
      s.latency_ms < 0 ||
      !object(s.risk) ||
      !finite(s.risk.uncertainty_score) ||
      s.risk.uncertainty_score < 0 ||
      (s.risk.uncertainty_label !== undefined &&
        !["predictable", "moderate", "volatile"].includes(
          String(s.risk.uncertainty_label),
        )) ||
      !Number.isInteger(s.risk.trust_horizon) ||
      (s.risk.trust_horizon as number) < 0 ||
      (s.risk.trust_horizon as number) > s.dates.length ||
      !["upside", "downside", "balanced"].includes(
        String(s.risk.risk_direction),
      )
    )
      return false;
    seen.add(s.series_id);
    const matrix = s.quantiles as number[][];
    if (!s.dates.every((_, i) => ordered(matrix.map((row) => row[i]))))
      return false;
    if (
      s.last_year !== undefined &&
      s.last_year !== null &&
      (!Array.isArray(s.last_year) ||
        s.last_year.length !== s.dates.length ||
        !s.last_year.every((x) => x === null || finite(x)))
    )
      return false;
    if (s.step_exceedance_grid !== undefined) {
      if (!object(s.step_exceedance_grid)) return false;
      const grid = s.step_exceedance_grid.percentiles;
      if (
        grid !== undefined &&
        (!Array.isArray(grid) ||
          grid.length !== 99 ||
          !grid.every(
            (row) =>
              numbers(row) && row.length === (s.dates as string[]).length,
          ) ||
          !s.dates.every((_, i) =>
            ordered((grid as number[][]).map((row) => row[i])),
          ))
      )
        return false;
    }
    return true;
  });
}
// Bounds from sampled percentile knots. Inclusive reaching uses F(t-); strict
// exceeding uses F(t). Keeping a range handles repeated/flat quantiles honestly.
export function probabilityBounds(
  knots: number[],
  threshold: number,
  firstPercentile: 0 | 1,
  inclusive: boolean,
): [number, number] {
  let below = 0,
    above = 100;
  for (let i = 0; i < knots.length; i++) {
    if (inclusive ? knots[i] < threshold : knots[i] <= threshold)
      below = i + firstPercentile;
    else {
      above = i + firstPercentile;
      break;
    }
  }
  return [100 - above, 100 - below];
}
export function probabilityText([low, high]: [number, number]) {
  return low === high ? `about ${low}%` : `${low}–${high}%`;
}
export function forecastCsv(forecast: Forecast) {
  const cell = (v: unknown) =>
    '"' +
    (typeof v === "string"
      ? v.replace(/^[=+@\-\t\r]/, "'$&")
      : String(v ?? "")
    ).replaceAll('"', '""') +
    '"';
  const levels = [0.1, 0.3, 0.5, 0.7, 0.9];
  return [
    ["series_id", "date", ...levels.map((p) => `P${p * 100}`), "last_year"],
    ...forecast.series.flatMap((s) =>
      s.dates.map((date, i) => [
        s.series_id,
        date,
        ...levels.map(
          (q) => s.quantiles[forecast.quantile_levels.indexOf(q)][i],
        ),
        s.last_year?.[i],
      ]),
    ),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
