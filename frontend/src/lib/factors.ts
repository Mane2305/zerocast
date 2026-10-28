import type { components } from "./api/schema";
import { object } from "./forecast.ts";
export type FactorResult = components["schemas"]["FactorResult"];
export type Factor = FactorResult["factors"][number];
export const verdicts: Record<
  Factor["verdict"],
  { label: string; meaning: string }
> = {
  use_it: {
    label: "Related and useful in this backtest",
    meaning:
      "Both lenses support tracking this factor. Sales-only forecasting remains the default.",
  },
  real_driver_yug_cannot_use: {
    label: "Related, but no model benefit yet",
    meaning:
      "Track it separately. A statistical relationship does not mean this model can use it well.",
  },
  helps_yug_unclear_link: {
    label: "Forecast gain, unclear statistical link",
    meaning:
      "It helped this backtest, while the statistical link remains unclear. Check stability on more history.",
  },
  probably_drop: {
    label: "No demonstrated benefit here",
    meaning:
      "This check does not support using the factor. Revisit it if the data or evidence changes.",
  },
};
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const optional = (v: unknown, test: (x: unknown) => boolean) =>
  v === undefined || test(v);
export function validFactors(v: unknown): v is FactorResult {
  if (
    !object(v) ||
    typeof v.series_id !== "string" ||
    !optional(v.baseline_wql, (x) => finite(x) && x >= 0) ||
    !Array.isArray(v.factors)
  )
    return false;
  const seen = new Set<string>();
  return v.factors.every((f) => {
    if (
      !object(f) ||
      typeof f.factor !== "string" ||
      seen.has(f.factor) ||
      !object(f.related) ||
      !object(f.helps_yug) ||
      !Object.hasOwn(verdicts, String(f.verdict)) ||
      !optional(f.explanation, (x) => typeof x === "string")
    )
      return false;
    const r = f.related,
      h = f.helps_yug;
    if (
      !optional(r.is_related, (x) => typeof x === "boolean") ||
      !optional(
        r.best_lag,
        (x) => typeof x === "number" && Number.isSafeInteger(x) && x >= 0,
      ) ||
      !optional(r.effect, finite) ||
      !optional(r.p_value, (x) => finite(x) && x >= 0 && x <= 1) ||
      !optional(h.helps, (x) => typeof x === "boolean") ||
      !optional(h.wql_with_factor, (x) => finite(x) && x >= 0) ||
      !optional(h.change_pct, finite) ||
      !optional(h.ci_low, finite) ||
      !optional(h.ci_high, finite) ||
      (h.ci_low !== undefined &&
        h.ci_high !== undefined &&
        (h.ci_low as number) > (h.ci_high as number))
    )
      return false;
    seen.add(f.factor);
    return true;
  });
}
export function evidenceLabel(
  value: boolean | undefined,
  positive: string,
  negative: string,
) {
  return value === undefined ? "Not reported" : value ? positive : negative;
}
export function factorsCsv(
  result: FactorResult,
  rows: Factor[] = result.factors,
) {
  const cell = (v: unknown) =>
    '"' +
    (typeof v === "string"
      ? v.replace(/^[=+@\-\t\r]/, "'$&")
      : String(v ?? "")
    ).replaceAll('"', '""') +
    '"';
  return [
    [
      "series_id",
      "factor",
      "is_related",
      "best_lag",
      "effect",
      "p_value",
      "helps_forecast",
      "baseline_wql",
      "wql_with_factor",
      "change_pct",
      "ci_low",
      "ci_high",
      "verdict",
      "explanation",
    ],
    ...rows.map((f) => [
      result.series_id,
      f.factor,
      f.related.is_related,
      f.related.best_lag,
      f.related.effect,
      f.related.p_value,
      f.helps_yug.helps,
      result.baseline_wql,
      f.helps_yug.wql_with_factor,
      f.helps_yug.change_pct,
      f.helps_yug.ci_low,
      f.helps_yug.ci_high,
      f.verdict,
      f.explanation,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
