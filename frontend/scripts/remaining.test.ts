import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyMapping,
  mappingError,
  fileError,
} from "../src/lib/import/types.ts";
import { publishedSheetUrl } from "../src/lib/import/sheets.ts";
test("mapping starts empty and validates the roles the user selects", () => {
  const blank = emptyMapping();
  assert.equal(blank.date, "");
  assert.match(mappingError(blank, ["date", "A"])!, /date column/);
  assert.match(
    mappingError({ ...blank, date: "date" }, ["date", "A"])!,
    /item ID column/,
  );
  const wide = {
    ...blank,
    format: "wide" as const,
    date: "date",
    wideColumns: ["A", "B"],
  };
  assert.equal(mappingError(wide, ["date", "A", "B"]), null);
  assert.match(
    mappingError({ ...wide, wideColumns: [] }, ["date", "A", "B"])!,
    /at least one/,
  );
  const long = {
    ...blank,
    date: "date",
    idColumns: ["store", "product"],
    target: "target",
  };
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
