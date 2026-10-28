import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fileError,
  guessMapping,
  mappingError,
} from "../src/lib/import/types.ts";

test("unsupported, empty and oversized files fail before processing", () => {
  assert.match(fileError(new File(["data"], "file.exe"))!, /Choose a CSV/);
  assert.match(fileError(new File([], "file.csv"))!, /empty/);
  const large = new File(["data"], "large.csv");
  Object.defineProperty(large, "size", { value: 1_000_000_001 });
  assert.match(fileError(large)!, /1 GB/);
});
test("mapping rejects duplicated roles, unknown columns, excessive factors and unconfirmed aggregation", () => {
  const columns = [
    "date",
    "series_id",
    "target",
    ...Array.from({ length: 11 }, (_, i) => `factor_${i}`),
  ];
  const mapping = guessMapping(columns);
  assert.equal(mappingError(mapping, columns), null);
  assert.match(
    mappingError({ ...mapping, target: "date" }, columns)!,
    /different column/,
  );
  assert.match(
    mappingError({ ...mapping, target: "unknown" }, columns)!,
    /existing column/,
  );
  assert.match(
    mappingError({ ...mapping, factors: columns.slice(3) }, columns)!,
    /10 factor/,
  );
  assert.match(
    mappingError({ ...mapping, period: "month" }, columns)!,
    /sum or average/,
  );
  assert.equal(
    mappingError({ ...mapping, period: "month", aggregation: "sum" }, columns),
    null,
  );
});
