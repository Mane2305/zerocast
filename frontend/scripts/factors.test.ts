import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validFactors,
  verdicts,
  evidenceLabel,
  factorsCsv,
} from "../src/lib/factors.ts";
test("all verdicts have plain-language meanings and missing evidence is distinct from false", () => {
  assert.equal(Object.keys(verdicts).length, 4);
  for (const value of Object.values(verdicts))
    assert(value.label && value.meaning);
  assert.equal(evidenceLabel(undefined, "yes", "no"), "Not reported");
  assert.equal(evidenceLabel(false, "yes", "no"), "no");
  assert.equal(evidenceLabel(true, "yes", "no"), "yes");
});
test("factor validation accepts optional zero values and rejects invalid evidence", () => {
  const result = {
    series_id: "A",
    baseline_wql: 0,
    factors: [
      {
        factor: "F",
        related: { is_related: false, best_lag: 0, effect: 0, p_value: 0 },
        helps_yug: {
          helps: false,
          wql_with_factor: 0,
          change_pct: 0,
          ci_low: -1,
          ci_high: 1,
        },
        verdict: "probably_drop",
      },
    ],
  };
  assert(validFactors(result));
  assert(
    validFactors({
      series_id: "A",
      factors: [
        { factor: "F", related: {}, helps_yug: {}, verdict: "probably_drop" },
      ],
    }),
  );
  const bad = structuredClone(result);
  bad.factors[0].related.p_value = 2;
  assert(!validFactors(bad));
  const interval = structuredClone(result);
  interval.factors[0].helps_yug.ci_low = 2;
  assert(!validFactors(interval));
  assert(
    !validFactors({
      ...result,
      factors: [...result.factors, ...result.factors],
    }),
  );
});
test("factor CSV exports raw source values, preserves false and safely quotes names", () => {
  const result = {
    series_id: "A",
    baseline_wql: 0.2,
    factors: [
      {
        factor: "=factor",
        related: { is_related: true },
        helps_yug: { helps: false, change_pct: -20 },
        verdict: "real_driver_yug_cannot_use" as const,
      },
    ],
  };
  const csv = factorsCsv(result);
  assert(csv.includes("'=factor"));
  assert(csv.includes('"false"'));
  assert(csv.includes('"-20"'));
  assert(csv.includes('"0.2"'));
});
