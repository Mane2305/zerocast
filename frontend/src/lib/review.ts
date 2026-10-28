import type { components } from "./api/schema";
import { object } from "./forecast.ts";
export type Review = components["schemas"]["ReviewResult"];
export type Event = components["schemas"]["SurpriseEvent"];
export type Annotation = components["schemas"]["Annotation"];
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const optional = (v: unknown, test: (v: unknown) => boolean) =>
  v === undefined || test(v);
export function validEvent(v: unknown): v is Event {
  return (
    object(v) &&
    date(v.date) &&
    finite(v.actual) &&
    finite(v.expected_p50) &&
    finite(v.deviation_pct) &&
    optional(v.expected_p10, finite) &&
    optional(v.expected_p90, finite) &&
    (v.expected_p10 === undefined ||
      (v.expected_p10 as number) <= v.expected_p50) &&
    (v.expected_p90 === undefined ||
      (v.expected_p90 as number) >= v.expected_p50) &&
    optional(
      v.calendar_events,
      (x) => Array.isArray(x) && x.every((y) => typeof y === "string"),
    ) &&
    optional(v.recurring_as_expected, (x) => typeof x === "boolean") &&
    optional(v.annotation, (x) => x === null || typeof x === "string")
  );
}
export function validReview(v: unknown): v is Review {
  if (!object(v) || !Array.isArray(v.series)) return false;
  const seen = new Set<string>();
  return v.series.every((s) => {
    if (
      !object(s) ||
      typeof s.series_id !== "string" ||
      seen.has(s.series_id) ||
      !Array.isArray(s.positive_surprises) ||
      !s.positive_surprises.every(validEvent) ||
      !Array.isArray(s.misses) ||
      !s.misses.every(validEvent) ||
      !optional(s.expected_total, finite) ||
      !optional(s.actual_total, finite) ||
      !optional(s.aggregation, (x) => x === "sum" || x === "mean") ||
      !optional(s.band_coverage, (x) => finite(x) && x >= 0 && x <= 1)
    )
      return false;
    seen.add(s.series_id);
    return true;
  });
}
export function validAnnotation(v: unknown): v is Annotation {
  return (
    object(v) &&
    typeof v.annotation_id === "string" &&
    typeof v.series_id === "string" &&
    date(v.date) &&
    typeof v.text === "string" &&
    [...v.text].length <= 500 &&
    optional(v.created_at, date)
  );
}
export const eventKey = (series: string, when: string) =>
  JSON.stringify([series, Date.parse(when)]);
export function reviewGroups(series: Review["series"][number]) {
  const unique = (events: Event[]) => [
    ...new Map(events.map((e) => [Date.parse(e.date), e])).values(),
  ];
  const expected = unique(
    [...series.positive_surprises, ...series.misses].filter(
      (e) => e.recurring_as_expected,
    ),
  );
  const expectedDates = new Set(expected.map((e) => Date.parse(e.date)));
  const ranked = (events: Event[]) =>
    unique(events)
      .filter((e) => !expectedDates.has(Date.parse(e.date)))
      .sort(
        (a, b) =>
          Math.abs(b.actual - b.expected_p50) -
            Math.abs(a.actual - a.expected_p50) ||
          Date.parse(a.date) - Date.parse(b.date),
      )
      .slice(0, 5);
  return {
    positive: ranked(series.positive_surprises),
    misses: ranked(series.misses),
    expected: expected.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
  };
}
export function reviewCsv(review: Review, annotations: Annotation[] = []) {
  const notes = new Map(
    annotations.map((a) => [eventKey(a.series_id, a.date), a.text]),
  );
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
      "category",
      "date",
      "actual",
      "expected_p50",
      "deviation_pct",
      "calendar_events",
      "annotation",
    ],
    ...review.series.flatMap((s) => {
      const groups = reviewGroups(s);
      return (["positive", "misses", "expected"] as const).flatMap((group) =>
        groups[group].map((e) => [
          s.series_id,
          group,
          e.date,
          e.actual,
          e.expected_p50,
          e.deviation_pct,
          e.calendar_events?.join("; "),
          notes.get(eventKey(s.series_id, e.date)) ?? e.annotation,
        ]),
      );
    }),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
