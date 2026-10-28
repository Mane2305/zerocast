import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRisk, trustText, portfolioCsv } from "../src/lib/portfolio.ts";
import { validForecast, type SeriesForecast } from "../src/lib/forecast.ts";
const rows: SeriesForecast[] = [0.08, 1.2, 0.45].map((score, i) => ({
  series_id: ["A", "B", "=1+1"][i],
  dates: ["2026-01-01T00:00:00Z"],
  quantiles: [[1], [2], [3], [4], [5]],
  step_exceedance_grid: {
    percentiles: Array.from({ length: 99 }, (_, n) => [n + 1]),
  },
  total_distribution: {
    aggregation: "sum",
    percentiles: Array.from({ length: 101 }, (_, n) => n),
  },
  latency_ms: 1,
  risk: {
    uncertainty_score: score,
    risk_direction: "balanced",
    trust_horizon: i === 1 ? 0 : 1,
  },
}));
test("risk sorting is numeric, stable, and does not mutate the source", () => {
  assert.deepEqual(
    sortRisk(rows, "uncertainty", true).map((s) => s.series_id),
    ["B", "=1+1", "A"],
  );
  assert.deepEqual(
    rows.map((s) => s.series_id),
    ["A", "B", "=1+1"],
  );
  assert.equal(sortRisk(rows, "trust", false)[0].series_id, "B");
});
test("trust horizon respects supplied cadence and zero", () => {
  assert.equal(trustText(3, "weekly"), "~3 weeks");
  assert.equal(trustText(1, "monthly"), "~1 month");
  assert.equal(trustText(2, "unknown"), "~2 steps");
  assert.equal(trustText(0, "daily"), "No reliable steps reported");
});
test("risk export preserves API scores and neutralizes formula IDs; malformed risk is rejected", () => {
  const csv = portfolioCsv(rows, "weekly");
  assert(csv.includes('"0.08"'));
  assert(csv.includes('"\'=1+1"'));
  assert(csv.includes('"weekly"'));
  const result = {
    quantile_levels: [0.1, 0.3, 0.5, 0.7, 0.9],
    series: structuredClone(rows),
  };
  assert(validForecast(result));
  const badTrust = structuredClone(result);
  badTrust.series[0].risk.trust_horizon = 2;
  assert(!validForecast(badTrust));
  const badScore = structuredClone(result);
  badScore.series[0].risk.uncertainty_score = -1;
  assert(!validForecast(badScore));
});
