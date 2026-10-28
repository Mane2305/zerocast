import test from "node:test";
import assert from "node:assert/strict";
import { validAccuracy, lastBacktest } from "../src/lib/accuracy.ts";
const metrics = { wape: 12.3, bias_pct: -2, coverage_p10_p90: 0.8 };
const source = {
  horizon: 2,
  origins: 1,
  portfolio: metrics,
  series: [
    {
      ...metrics,
      series_id: "A",
      quantile_coverage: [{ level: 0.5, observed: 0.6 }],
      backtest: {
        dates: [
          "2026-02-01T00:00:00Z",
          "2026-02-02T00:00:00Z",
          "2026-02-03T00:00:00Z",
        ],
        actual: [5, null, 12],
        p10: [2, 3, 4],
        p50: [6, 7, 8],
        p90: [10, 11, 12],
      },
    },
  ],
};
test("accuracy keeps supplied scores and null gaps; overlay is the last horizon", () => {
  assert(validAccuracy(source));
  const points = lastBacktest(source, "A", "2026-02-04T00:00:00Z");
  assert.equal(points.length, 2);
  assert.equal(points[0].actual, null);
  assert.equal(points[1].expected_p50, 8);
  assert.equal(source.series[0].wape, 12.3);
  assert.deepEqual(lastBacktest(source, "B", "2026-02-04T00:00:00Z"), []);
  assert.deepEqual(lastBacktest(source, "A", "2026-02-03T00:00:00Z"), []);
});
test("invalid scores, duplicate dates, crossed or misaligned backtest ranges are rejected", () => {
  const invalid = structuredClone(source);
  invalid.series[0].backtest.p10[0] = 100;
  assert(!validAccuracy(invalid));
  const duplicate = structuredClone(source);
  duplicate.series[0].backtest.dates[1] = duplicate.series[0].backtest.dates[0];
  assert(!validAccuracy(duplicate));
  const short = structuredClone(source);
  short.series[0].backtest.p90.pop();
  assert(!validAccuracy(short));
  assert(!validAccuracy({ ...source, portfolio: { ...metrics, wape: NaN } }));
});
test("optional benchmarks stay optional and invalid evidence never gets charted", () => {
  assert(
    validAccuracy({
      ...source,
      portfolio: {
        ...metrics,
        naive_wape: null,
        improvement_vs_naive_pct: null,
      },
    }),
  );
  assert(
    validAccuracy({
      ...source,
      portfolio: { ...metrics, naive_wape: 12, improvement_vs_naive_pct: -3.4 },
    }),
  );
  assert(
    !validAccuracy({ ...source, portfolio: { ...metrics, naive_wape: -1 } }),
  );
  assert(
    !validAccuracy({
      ...source,
      portfolio: { ...metrics, improvement_vs_naive_pct: Infinity },
    }),
  );
  const duplicate = structuredClone(source);
  duplicate.series[0].quantile_coverage.push({ level: 0.5, observed: 0.4 });
  assert(!validAccuracy(duplicate));
});
