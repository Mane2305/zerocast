import test from "node:test";
import assert from "node:assert/strict";
import {
  valueFormatter,
  parameterFormatter,
  averagePerPeriod,
} from "../src/lib/numbers.ts";
test("count values use whole numbers and the dataset or browser grouping", () => {
  assert.equal(
    valueFormatter({ unit: "units", country: "GB" }, "en-US").format(1234567.6),
    "1,234,568",
  );
  assert.equal(
    valueFormatter({ unit: "items" }, "de-DE").format(1234567.6),
    "1.234.568",
  );
  assert.equal(
    valueFormatter({ unit: "units", country: "IN" }, "en-US").format(1234567.6),
    "12,34,568",
  );
  assert.equal(
    valueFormatter({ unit: "index points" }, "en-US").format(1234567.89),
    "1,234,567.9",
  );
  assert.equal(
    valueFormatter({ currency: "INR" }, "en-US").format(1234567.89),
    "₹12,34,567.89",
  );
  assert.equal(parameterFormatter.format(271845260), "271,845,260");
  assert.equal(
    valueFormatter({ unit: "INR" }, "en-US").format(1234567.89),
    "₹12,34,567.89",
  );
});
test("aggregation follows the explicit dataset flag", () => {
  assert.equal(averagePerPeriod({ additive: false }), true);
  assert.equal(averagePerPeriod({ additive: true }), false);
});
