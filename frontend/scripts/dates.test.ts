import assert from "node:assert/strict";
import test from "node:test";
import { formatPeriod } from "../src/lib/dates.ts";

test("period labels follow frequency without timezone shifts or ISO timestamps", () => {
  const date = "2026-02-06T14:00:00+05:30";
  assert.equal(formatPeriod(date, "daily"), "6 Feb 2026");
  assert.equal(formatPeriod(date, "monthly"), "Feb 2026");
  assert.equal(formatPeriod(date, "hourly"), "6 Feb 2026, 14:00");
  assert.equal(formatPeriod("2026-02-06T00:00:00Z", "daily"), "6 Feb 2026");
  assert.equal(
    formatPeriod("2026-02-06T00:00:00Z", "hourly"),
    "6 Feb 2026, 00:00",
  );
  assert.equal(formatPeriod(date, "quarterly"), "Q1 2026");
  assert.equal(formatPeriod(date, "yearly"), "2026");
  assert.equal(formatPeriod(date, "weekly"), "Wk of 6 Feb 2026");
  assert.equal(formatPeriod(date), "6 Feb 2026");
});

test("missing or invalid dates never leak raw source strings", () => {
  assert.equal(formatPeriod(), "Not supplied");
  assert.equal(formatPeriod("invalid"), "Date unavailable");
  assert.equal(formatPeriod("2026-02-30T00:00:00Z"), "Date unavailable");
});
