import test from "node:test";
import assert from "node:assert/strict";
import { defaultItems, itemLabel, seriesOptions } from "../src/lib/pickers.ts";

test("item labels join hierarchy parts readably", () => {
  assert.equal(itemLabel("shop_01|gulab-jamun"), "shop_01 · gulab-jamun");
  assert.equal(itemLabel("BAGS"), "BAGS");
  assert.equal(seriesOptions([{ series_id: "a|b" }])[0].label, "a · b");
});

test("default items skip excluded series and stop at the count", () => {
  const series = [
    { series_id: "x", status: "excluded" },
    { series_id: "a", status: "ready" },
    { series_id: "b", status: "warning" },
    { series_id: "c", status: "ready" },
    { series_id: "d", status: "ready" },
  ];
  assert.deepEqual(defaultItems(series), ["a", "b", "c"]);
  assert.deepEqual(defaultItems(undefined), []);
});
