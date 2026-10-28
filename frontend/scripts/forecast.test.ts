import { test } from "node:test";
import assert from "node:assert/strict";
import {
  probabilityBounds,
  validForecast,
  forecastCsv,
} from "../src/lib/forecast.ts";
test("probability bounds preserve inclusive targets, strict capacity, ties and unobserved tails", () => {
  const total = Array.from({ length: 101 }, (_, i) => i * 10);
  assert.deepEqual(probabilityBounds(total, 225, 0, true), [77, 78]);
  assert.deepEqual(probabilityBounds(total, 1001, 0, true), [0, 0]);
  assert.deepEqual(probabilityBounds(total, -1, 0, true), [100, 100]);
  assert.deepEqual(
    probabilityBounds(Array(101).fill(5), 5, 0, true),
    [100, 100],
  );
  assert.deepEqual(probabilityBounds(Array(101).fill(5), 5, 0, false), [0, 0]);
  const steps = Array.from({ length: 99 }, (_, i) => i + 1);
  assert.deepEqual(probabilityBounds(steps, 200, 1, false), [0, 1]);
  assert.deepEqual(probabilityBounds(steps, -1, 1, false), [99, 100]);
});
test("forecast validation rejects crossed quantiles and malformed grids; export uses exact per-step values", () => {
  const result = {
    quantile_levels: [0.1, 0.3, 0.5, 0.7, 0.9],
    series: [
      {
        series_id: "=1+1",
        dates: ["2026-01-01T00:00:00Z"],
        quantiles: [[-5], [-3], [1], [3], [5]],
        total_distribution: {
          aggregation: "sum",
          percentiles: Array.from({ length: 101 }, (_, i) => i + 1000),
        },
        risk: {
          uncertainty_score: 1,
          risk_direction: "balanced",
          trust_horizon: 1,
        },
        latency_ms: 25,
        step_exceedance_grid: {
          percentiles: Array.from({ length: 99 }, (_, i) => [i]),
        },
      },
    ],
  };
  assert(validForecast(result));
  const csv = forecastCsv(result);
  assert(csv.includes('"\'=1+1"'));
  assert(csv.includes('"-5"'));
  assert(!csv.includes("1050"));
  const crossed = structuredClone(result);
  crossed.series[0].quantiles[0][0] = 9;
  assert(!validForecast(crossed));
  const malformed = structuredClone(result);
  malformed.series[0].step_exceedance_grid.percentiles.pop();
  assert(!validForecast(malformed));
  const unordered = structuredClone(result);
  unordered.series[0].total_distribution.percentiles[50] = -500;
  assert(!validForecast(unordered));
});
