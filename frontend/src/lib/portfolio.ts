import type { components } from "./api/schema";
import type { SeriesForecast } from "./forecast";
type Frequency = components["schemas"]["Frequency"];
export type RiskSort = "series_id" | "uncertainty" | "direction" | "trust";
export function sortRisk(
  rows: SeriesForecast[],
  sort: RiskSort,
  descending: boolean,
) {
  return [...rows].sort((a, b) => {
    const value =
      sort === "series_id"
        ? a.series_id.localeCompare(b.series_id)
        : sort === "uncertainty"
          ? a.risk.uncertainty_score - b.risk.uncertainty_score
          : sort === "trust"
            ? a.risk.trust_horizon - b.risk.trust_horizon
            : a.risk.risk_direction.localeCompare(b.risk.risk_direction);
    return (
      value * (descending ? -1 : 1) || a.series_id.localeCompare(b.series_id)
    );
  });
}
export function trustText(steps: number, frequency: Frequency) {
  if (steps === 0) return "No reliable steps reported";
  const unit = {
    hourly: "hour",
    daily: "day",
    weekly: "week",
    monthly: "month",
    quarterly: "quarter",
    yearly: "year",
    unknown: "step",
  }[frequency];
  return `~${steps} ${unit}${steps === 1 ? "" : "s"}`;
}
export function portfolioCsv(rows: SeriesForecast[], frequency: Frequency) {
  const cell = (v: string | number) =>
    '"' +
    (typeof v === "string"
      ? v.replace(/^[=+@\-\t\r]/, "'$&")
      : String(v)
    ).replaceAll('"', '""') +
    '"';
  return [
    [
      "series_id",
      "uncertainty_score",
      "uncertainty_label",
      "risk_direction",
      "trust_horizon_steps",
      "frequency",
    ],
    ...rows.map((s) => [
      s.series_id,
      s.risk.uncertainty_score,
      s.risk.uncertainty_label ?? "",
      s.risk.risk_direction,
      s.risk.trust_horizon,
      frequency,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
