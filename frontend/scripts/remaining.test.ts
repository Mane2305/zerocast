import test from "node:test";
import assert from "node:assert/strict";
import {
  guessMapping,
  mappingError,
  fileError,
} from "../src/lib/import/types.ts";
import { publishedSheetUrl } from "../src/lib/import/sheets.ts";
test("wide and long hierarchy detection stays explicit and validates selected roles", () => {
  const wide = guessMapping(["date", "A", "B"]);
  assert.equal(wide.format, "wide");
  assert.equal(mappingError(wide, ["date", "A", "B"]), null);
  assert.match(
    mappingError({ ...wide, wideColumns: [] }, ["date", "A", "B"])!,
    /at least one/,
  );
  const long = guessMapping(["date", "store", "product", "target"]);
  assert.equal(long.format, "long");
  assert.deepEqual(long.idColumns, ["store", "product"]);
  assert.equal(
    mappingError(long, ["date", "store", "product", "target"]),
    null,
  );
  assert(
    mappingError({ ...long, idColumns: ["store", "target"] }, [
      "date",
      "store",
      "product",
      "target",
    ]),
  );
  assert.equal(
    fileError(new File(['[{"date":"2026-01-01","A":2}]'], "records.json")),
    null,
  );
});
test("published Sheets URLs cannot turn into arbitrary authenticated fetches", () => {
  assert(
    publishedSheetUrl(
      "https://docs.google.com/spreadsheets/d/e/test/pub?output=csv",
    ),
  );
  assert(
    publishedSheetUrl(
      "https://docs.google.com/spreadsheets/d/test/export?format=csv",
    ),
  );
  for (const value of [
    "https://evil.test/spreadsheets/d/e/test/pub?output=csv",
    "http://docs.google.com/spreadsheets/d/e/test/pub?output=csv",
    "https://docs.google.com/spreadsheets/d/test/edit",
    "https://user:pass@docs.google.com/spreadsheets/d/test/export?format=csv",
  ])
    assert.throws(() => publishedSheetUrl(value));
});
