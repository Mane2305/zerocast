import * as duckdb from "@duckdb/duckdb-wasm/dist/duckdb-browser.mjs";
import {
  fileError,
  mappingError,
  UPLOAD_LIMIT,
  type Inspection,
  type Mapping,
  type Prepared,
} from "./types";

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const text = (name: string) =>
  `NULLIF(TRIM(CAST(${identifier(name)} AS VARCHAR)), '')`;
const numeric = (name: string) => `TRY_CAST(${text(name)} AS DOUBLE)`;
const display = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);
export class FileProcessor {
  private db?: duckdb.AsyncDuckDB;
  private connection?: duckdb.AsyncDuckDBConnection;
  private worker?: Worker;
  private excelWorker?: Worker;
  private closed = false;
  private inspection?: Inspection;
  async dispose() {
    this.closed = true;
    this.excelWorker?.terminate();
    this.worker?.terminate();
    await this.db?.terminate().catch(() => undefined);
  }
  private async query(sql: string) {
    if (this.closed || !this.connection)
      throw new Error("Processing cancelled.");
    return this.connection.query(sql);
  }
  private async count(sql: string) {
    const result = await this.query(sql);
    return Number(result.get(0)?.n ?? 0);
  }
  private async sample(table: string) {
    const result = await this.query(
      `SELECT ${table === "output" ? "CAST(date AS VARCHAR) AS date, * EXCLUDE(date)" : "*"} FROM ${table} ${table === "output" ? "ORDER BY series_id, date" : ""} LIMIT 5`,
    );
    return result
      .toArray()
      .map((row) =>
        Object.fromEntries(
          Object.entries(row.toJSON()).map(([key, value]) => [
            key,
            display(value),
          ]),
        ),
      );
  }
  async inspect(
    file: File,
    sheet: string,
    status: (text: string) => void,
  ): Promise<Inspection> {
    const invalid = fileError(file);
    if (invalid) throw new Error(invalid);
    let source = file;
    let sheets: string[] = [];
    let selectedSheet = "";
    if (/\.xlsx?$/i.test(file.name)) {
      status("Reading workbook in your browser…");
      const result = await new Promise<{
        file: File;
        sheets: string[];
        sheet: string;
      }>((resolve, reject) => {
        const worker = new Worker(
          new URL("./excel.worker.ts", import.meta.url),
        );
        this.excelWorker = worker;
        worker.onmessage = (event) => {
          worker.terminate();
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data);
        };
        worker.onerror = () => {
          worker.terminate();
          reject(
            new Error(
              "The workbook could not be read. Try a smaller workbook or export it as CSV.",
            ),
          );
        };
        worker.postMessage({ file, sheet });
      });
      source = result.file;
      sheets = result.sheets;
      selectedSheet = result.sheet;
    }
    if (this.closed) throw new Error("Processing cancelled.");
    status("Starting the local file processor…");
    this.worker = new Worker("/vendor/duckdb/duckdb-browser-mvp.worker.js");
    this.db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), this.worker);
    await this.db.instantiate("/vendor/duckdb/duckdb-mvp.wasm");
    if (this.closed) throw new Error("Processing cancelled.");
    this.connection = await this.db.connect();
    try {
      const response = await fetch("/vendor/duckdb/extensions/manifest.json");
      if (response.ok) {
        const manifest: unknown = await response.json();
        if (
          manifest &&
          typeof manifest === "object" &&
          "version" in manifest &&
          manifest.version === "1.5.4" &&
          "platform" in manifest &&
          manifest.platform === "wasm_mvp" &&
          "parquetBundled" in manifest &&
          manifest.parquetBundled === true
        )
          await this.query(
            `SET custom_extension_repository='${window.location.origin}/vendor/duckdb/extensions'`,
          );
      }
    } catch {
      // Development without network access can still use DuckDB's normal CDN fallback.
    }
    await this.query("SET memory_limit='768MB'");
    await this.query("SET preserve_insertion_order=false");
    status("Checking file structure and counting rows…");
    const parquet = /\.parquet$/i.test(source.name);
    const json = /\.json$/i.test(source.name);
    const name = parquet
      ? "source.parquet"
      : json
        ? "source.json"
        : "source.csv";
    await this.db.registerFileHandle(
      name,
      source,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true,
    );
    await this.query(
      `CREATE VIEW raw AS SELECT * FROM ${parquet ? "read_parquet('source.parquet')" : json ? "read_json_auto('source.json', format='array')" : "read_csv('source.csv', header=true, all_varchar=true, ignore_errors=false)"}`,
    );
    const description = await this.query("DESCRIBE raw");
    const columns = description.toArray().map((row) => String(row.column_name));
    if (columns.length < 2)
      throw new Error(
        "At least a date column and one item column are needed. Check the file header and delimiter.",
      );
    const rows = await this.count("SELECT COUNT(*) AS n FROM raw");
    if (!rows) throw new Error("This file has a header but no data rows.");
    this.inspection = {
      columns,
      rows,
      sample: await this.sample("raw"),
      sheets,
      sheet: selectedSheet,
    };
    return this.inspection;
  }
  async convert(
    mapping: Mapping,
    status: (text: string) => void,
  ): Promise<Prepared> {
    if (!this.inspection || !this.db)
      throw new Error("Run the file check first.");
    const invalid = mappingError(mapping, this.inspection.columns);
    if (invalid) throw new Error(invalid);
    const wide = mapping.format === "wide";
    const ids = wide
      ? []
      : mapping.idColumns?.length
        ? mapping.idColumns
        : [mapping.series];
    const attributes = ids.filter((id) => id.toLowerCase() !== "series_id");
    const factors = wide ? [] : mapping.factors;
    status("Validating dates, series IDs, and numeric values…");
    const dateValue = text(mapping.date);
    const dateCast = `TRY_CAST(${dateValue} AS TIMESTAMP)`;
    const badDates = await this.count(
      `SELECT COUNT(*) AS n FROM raw WHERE ${dateValue} IS NULL OR NOT regexp_full_match(${dateValue}, '[0-9]{4}-[0-9]{2}-[0-9]{2}([ T][0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]+)?)?)?') OR ${dateCast} IS NULL`,
    );
    if (badDates)
      throw new Error(
        `${badDates.toLocaleString("en-US")} rows have missing or invalid dates. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS without timezone offsets.`,
      );
    const missingIds = await this.count(
      wide
        ? "SELECT 0 AS n"
        : `SELECT COUNT(*) AS n FROM raw WHERE ${ids.map((id) => `${text(id)} IS NULL`).join(" OR ")}`,
    );
    if (missingIds)
      throw new Error(
        `${missingIds.toLocaleString("en-US")} rows have a blank series ID. Fill in the series column before importing.`,
      );
    if (
      ids.length > 1 &&
      (await this.count(
        `SELECT COUNT(*) AS n FROM raw WHERE ${ids.map((id) => `contains(${text(id)}, '|')`).join(" OR ")}`,
      ))
    )
      throw new Error(
        "Combined ID parts cannot contain | because it would make item identities ambiguous.",
      );
    for (const column of wide
      ? mapping.wideColumns || []
      : [mapping.target, ...factors]) {
      const bad = await this.count(
        `SELECT COUNT(*) AS n FROM raw WHERE ${text(column)} IS NOT NULL AND (${numeric(column)} IS NULL OR NOT isfinite(${numeric(column)}))`,
      );
      if (bad)
        throw new Error(
          `${bad.toLocaleString("en-US")} values in “${column}” are not finite numbers. Remove currency symbols, grouping commas, text, NaN, and infinity. Leave unknown values blank.`,
        );
    }
    // Only allow predefined aggregation and date functions; source identifiers are escaped.
    const dateExpr =
      mapping.period === "original"
        ? dateCast
        : `date_trunc('${mapping.period}', ${dateCast})`;
    if (wide)
      await this.query(
        "CREATE OR REPLACE TEMP TABLE wide_source AS SELECT * FROM raw",
      );
    const source = wide
      ? (mapping.wideColumns || [])
          .map(
            (column) =>
              `SELECT ${dateExpr} AS date, '${column.replaceAll("'", "''")}' AS series_id, ${numeric(column)} AS target FROM wide_source`,
          )
          .join(" UNION ALL ")
      : `SELECT ${dateExpr} AS date, ${ids.map(text).join(" || '|' || ")} AS series_id, ${numeric(mapping.target)} AS target${attributes.map((id) => `, ${text(id)} AS ${identifier(id)}`).join("")}${factors.map((f) => `, ${numeric(f)} AS ${identifier(f)}`).join("")} FROM raw`;
    await this.query(`CREATE OR REPLACE TEMP TABLE mapped AS ${source}`);
    const groups = await this.count(
      "SELECT COUNT(*) AS n FROM (SELECT date, series_id FROM mapped GROUP BY date, series_id)",
    );
    const collapsed =
      this.inspection.rows * (wide ? mapping.wideColumns!.length : 1) - groups;
    if (mapping.aggregation === "reject" && collapsed > 0)
      throw new Error(
        `${collapsed.toLocaleString("en-US")} extra rows share a date and series. Choose an explicit sum or average rule, or fix the duplicates in your file.`,
      );
    status("Building the universal template…");
    if (mapping.aggregation === "reject")
      await this.query(
        "CREATE OR REPLACE TEMP TABLE output AS SELECT * FROM mapped",
      );
    else
      await this.query(
        `CREATE OR REPLACE TEMP TABLE output AS SELECT date, series_id${attributes.map((id) => `, ${identifier(id)}`).join("")}, CASE WHEN COUNT(target) < COUNT(*) THEN NULL ELSE ${mapping.aggregation === "sum" ? "SUM" : "AVG"}(target) END AS target${factors.map((f) => `, CASE WHEN COUNT(${identifier(f)}) < COUNT(*) THEN NULL ELSE AVG(${identifier(f)}) END AS ${identifier(f)}`).join("")} FROM mapped GROUP BY date, series_id${attributes.map((id) => `, ${identifier(id)}`).join("")}`,
      );
    const shortSeries = await this.count(
      "SELECT COUNT(*) AS n FROM (SELECT series_id FROM output GROUP BY series_id HAVING COUNT(target) < 30)",
    );
    const series = await this.count(
      "SELECT COUNT(DISTINCT series_id) AS n FROM output",
    );
    if (shortSeries === series)
      throw new Error(
        "Every series has fewer than 30 known target points after conversion. Add more history or choose a finer time period.",
      );
    const overflow = await this.count(
      `SELECT COUNT(*) AS n FROM output WHERE (target IS NOT NULL AND NOT isfinite(target))${factors.map((f) => ` OR (${identifier(f)} IS NOT NULL AND NOT isfinite(${identifier(f)}))`).join("")}`,
    );
    if (overflow)
      throw new Error(
        "Aggregation produced numbers that are too large. Use smaller units or choose average instead of sum.",
      );
    const missingTargets = await this.count(
      "SELECT COUNT(*) AS n FROM output WHERE target IS NULL",
    );
    const sample = await this.sample("output");
    status("Compressing to Parquet in your browser…");
    await this.db.dropFile("prepared.parquet").catch(() => undefined);
    await this.query(
      `COPY (SELECT ${attributes.length ? "* EXCLUDE(series_id)" : "*"} FROM output ORDER BY series_id, date) TO 'prepared.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );
    const bytes = await this.db.copyFileToBuffer("prepared.parquet");
    if (bytes.byteLength > UPLOAD_LIMIT)
      throw new Error(
        "The converted Parquet exceeds 50 MB. Select fewer factors, aggregate to a coarser period, or split your source file.",
      );
    const file = new File(
      [new Uint8Array(bytes)],
      "zerocast-prepared.parquet",
      { type: "application/octet-stream" },
    );
    return {
      idColumns: wide ? ["series_id"] : ids,
      inputFormat: wide ? "wide" : "long",
      file,
      rows: groups,
      series,
      shortSeries,
      missingTargets,
      collapsed,
      sample,
    };
  }
}
export function processingMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/memory|allocation|out of bounds/i.test(message))
    return "Your browser ran out of working memory. Close other tabs, try a smaller file, or export just the worksheet you need as CSV.";
  if (/failed to fetch|network/i.test(message))
    return "The browser could not reach DuckDB’s Parquet support. Check the connection and try again. Your file has not been uploaded.";
  if (/worker|wasm|instantiate/i.test(message))
    return "The local file processor could not start. Refresh the app and try again. Your file has not been uploaded.";
  if (
    /CSV Error|Invalid Input Error|Parser Error|Invalid UTF|sniff/i.test(
      message,
    )
  )
    return "This file could not be parsed. Check that its contents match its extension, the CSV uses UTF-8 and consistent columns, or re-export it from the source application.";
  return (
    message || "This file could not be processed. Try exporting it as CSV."
  );
}
