import assert from "node:assert/strict";
import test from "node:test";
import {
  suppliedPaths,
  suppliedBacktest,
  recentBacktest,
  periodUnit,
} from "../src/lib/forecast-story.ts";
test("optional trajectories are supplied, finite, bounded and aligned, never reconstructed", () => {
  assert.deepEqual(suppliedPaths({ quantiles: [[1, 2]] }, 2), []);
  assert.deepEqual(
    suppliedPaths(
      {
        sample_paths: [
          [0, 2],
          [3, 4],
        ],
      },
      2,
    ),
    [
      [0, 2],
      [3, 4],
    ],
  );
  assert.deepEqual(suppliedPaths({ sample_paths: [[1]] }, 2), []);
  assert.deepEqual(suppliedPaths({ sample_paths: [[1, Infinity]] }, 2), []);
  assert.deepEqual(
    suppliedPaths(
      { sample_paths: Array.from({ length: 101 }, () => [1, 2]) },
      2,
    ),
    [],
  );
});
test("backtest points stay separate from ranked events and respect a calendar-month window", () => {
  const point = (date: string) => ({
    date,
    actual: 0,
    expected_p50: 2,
    expected_p10: 0,
    expected_p90: 4,
  });
  assert.deepEqual(
    suppliedBacktest({ positive_surprises: [point("2026-03-31T00:00:00Z")] }),
    [],
  );
  const input = [
    point("2026-03-31T00:00:00Z"),
    point("2026-02-28T00:00:00Z"),
    point("2026-03-01T00:00:00Z"),
  ];
  const sorted = suppliedBacktest({ backtest_points: input });
  assert.deepEqual(
    recentBacktest(sorted).map((p) => p.date),
    ["2026-03-01T00:00:00Z", "2026-03-31T00:00:00Z"],
  );
  assert.equal(input[0].date, "2026-03-31T00:00:00Z");
  assert.deepEqual(
    suppliedBacktest({
      backtest_points: [
        point("2026-03-01T00:00:00Z"),
        point("2026-03-01T00:00:00Z"),
      ],
    }),
    [],
  );
  assert.deepEqual(
    suppliedBacktest({
      backtest_points: [{ ...point("2026-03-01T00:00:00Z"), expected_p10: 5 }],
    }),
    [],
  );
  assert.equal(periodUnit("daily", 14), "14 days");
  assert.equal(periodUnit("monthly", 1), "1 month");
});
