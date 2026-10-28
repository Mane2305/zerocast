import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reviewGroups,
  reviewCsv,
  validReview,
  validAnnotation,
  eventKey,
  type Event,
} from "../src/lib/review.ts";
const event = (
  day: number,
  delta: number,
  extra: Partial<Event> = {},
): Event => ({
  date: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
  actual: 100 + delta,
  expected_p50: 100,
  deviation_pct: delta,
  ...extra,
});
test("review ranks by magnitude, caps lists, separates and deduplicates expected events", () => {
  const expected = event(9, 2, { recurring_as_expected: true });
  const groups = reviewGroups({
    series_id: "A",
    positive_surprises: [
      ...Array.from({ length: 7 }, (_, i) => event(i + 1, i * 10)),
      expected,
    ],
    misses: [expected, event(10, -50)],
  });
  assert.equal(groups.positive.length, 5);
  assert.equal(groups.positive[0].actual, 160);
  assert.equal(groups.expected.length, 1);
  assert.equal(groups.misses.length, 1);
});
test("review validates optional values without inventing metrics", () => {
  assert(
    validReview({
      series: [{ series_id: "A", positive_surprises: [], misses: [] }],
    }),
  );
  assert(
    !validReview({
      series: [
        {
          series_id: "A",
          positive_surprises: [event(1, 10, { expected_p10: 120 })],
          misses: [],
        },
      ],
    }),
  );
  assert(
    !validReview({
      series: [
        {
          series_id: "A",
          positive_surprises: [],
          misses: [],
          band_coverage: 5,
        },
      ],
    }),
  );
  assert(
    !validAnnotation({
      annotation_id: "x",
      series_id: "A",
      date: "not a date",
      text: "note",
    }),
  );
});
test("review exports fresh dataset notes safely and normalizes date keys", () => {
  const review = {
    series: [
      {
        series_id: "=A",
        positive_surprises: [event(1, 10, { annotation: "old" })],
        misses: [],
      },
    ],
  };
  const csv = reviewCsv(review, [
    {
      annotation_id: "n",
      series_id: "=A",
      date: "2026-01-01T00:00:00.000Z",
      text: "=fresh",
    },
  ]);
  assert(csv.includes("'=fresh"));
  assert(csv.includes("'=A"));
  assert(!csv.includes('"old"'));
  assert.equal(
    eventKey("A", "2026-01-01T00:00:00Z"),
    eventKey("A", "2026-01-01T00:00:00.000Z"),
  );
});
