export const RAW_LIMIT = 1_000_000_000;
export const UPLOAD_LIMIT = 50_000_000;
export type Mapping = {
  format?: "long" | "wide";
  idColumns?: string[];
  wideColumns?: string[];
  date: string;
  series: string;
  target: string;
  factors: string[];
  period: "original" | "day" | "week" | "month";
  aggregation: "reject" | "sum" | "avg";
};
export type Inspection = {
  columns: string[];
  rows: number;
  sample: Record<string, string>[];
  sheets: string[];
  sheet: string;
};
export type Prepared = {
  idColumns?: string[];
  inputFormat?: "long" | "wide";
  file: File;
  rows: number;
  series: number;
  shortSeries: number;
  missingTargets: number;
  collapsed: number;
  sample: Record<string, string>[];
};
export function guessMapping(columns: string[]): Mapping {
  const pick = (names: string[]) =>
    columns.find((c) => names.includes(c.toLowerCase().trim())) ?? "";
  const date = pick(["date", "timestamp", "ds", "day"]);
  const target = pick(["target", "sales", "units", "value", "y"]);
  const ids = columns.filter((c) =>
    /^(store|store_id|product|product_id|sku|region|plant|series|series_id)$/i.test(
      c,
    ),
  );
  return {
    format: date && (!target || !ids.length) ? "wide" : "long",
    idColumns: ids.length > 1 && !ids.includes("series_id") ? ids : undefined,
    wideColumns: columns.filter((c) => c !== date),
    date: pick(["date", "timestamp", "ds", "day"]),
    series: pick(["series_id", "series", "product", "sku", "store"]),
    target: pick(["target", "sales", "units", "value", "y"]),
    factors: [],
    period: "original",
    aggregation: "reject",
  };
}
export function mappingError(mapping: Mapping, columns: string[]) {
  if (mapping.format === "wide") {
    const items = mapping.wideColumns || [];
    if (!columns.includes(mapping.date)) return "Choose the date column.";
    if (
      !items.length ||
      items.some((c) => !columns.includes(c) || c === mapping.date)
    )
      return "Choose at least one item column distinct from the date.";
    return mapping.period !== "original" && mapping.aggregation === "reject"
      ? "Choose sum or average when grouping dates into periods."
      : null;
  }
  const ids = mapping.idColumns?.length ? mapping.idColumns : [mapping.series];
  if (ids.some((id) => ["date", "target"].includes(id.toLowerCase())))
    return "Rename reserved ID columns before mapping them.";
  if (
    ids.length > 1 &&
    ids.some((id) => ["date", "series_id", "target"].includes(id.toLowerCase()))
  )
    return "Rename reserved ID columns before combining them into a hierarchy.";
  const fields = [mapping.date, ...ids, mapping.target, ...mapping.factors];
  if (fields.some((field) => !field || !columns.includes(field)))
    return "Choose an existing column for date, series, and target.";
  if (
    new Set(fields.map((field) => field.toLowerCase())).size !== fields.length
  )
    return "Use a different column for each role.";
  if (mapping.factors.length > 10) return "Select at most 10 factor columns.";
  if (
    mapping.factors.some((f) =>
      ["date", "series_id", "target"].includes(f.toLowerCase()),
    )
  )
    return "Factor names cannot be date, series_id, or target. Rename that column in your source file.";
  if (mapping.period !== "original" && mapping.aggregation === "reject")
    return "Choose sum or average when grouping dates into periods.";
  return null;
}
export function fileError(file: File) {
  if (!/\.(csv|xlsx|xls|parquet|json)$/i.test(file.name))
    return "Choose a CSV, Excel, Parquet or JSON records file.";
  if (file.size === 0)
    return "This file is empty. Choose a file with a header and data rows.";
  if (file.size > RAW_LIMIT)
    return "This file exceeds the 1 GB browser limit. Split it into smaller files first.";
  return null;
}
export const fileSize = (bytes: number) =>
  bytes < 10_000
    ? `${bytes.toLocaleString()} bytes`
    : `${(bytes / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;
