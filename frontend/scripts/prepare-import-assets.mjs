import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const source = "node_modules/@duckdb/duckdb-wasm/dist";
const target = "public/vendor/duckdb";
// Keep this engine version in sync with the DuckDB version embedded in the
// @duckdb/duckdb-wasm package. DuckDB extensions are version-specific.
const engineVersion = "1.5.4";
const platform = "wasm_mvp";
const extensionUrl = `https://extensions.duckdb.org/v${engineVersion}/${platform}/parquet.duckdb_extension.wasm`;
const extensionFile = `${target}/extensions/v${engineVersion}/${platform}/parquet.duckdb_extension.wasm`;
const manifestFile = `${target}/extensions/manifest.json`;
await mkdir(target, { recursive: true });
for (const file of ["duckdb-mvp.wasm", "duckdb-browser-mvp.worker.js"])
  await copyFile(`${source}/${file}`, `${target}/${file}`);

let parquetBundled = false;
try {
  const current = new Uint8Array(await readFile(extensionFile));
  parquetBundled = WebAssembly.validate(current);
} catch {
  // The asset may not have been built in this checkout yet.
}
try {
  const response = await fetch(extensionUrl, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`DuckDB returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!WebAssembly.validate(bytes))
    throw new Error("DuckDB returned an invalid WebAssembly extension");
  await mkdir(dirname(extensionFile), { recursive: true });
  await writeFile(extensionFile, bytes);
  parquetBundled = true;
} catch (error) {
  console.warn(
    `Could not bundle DuckDB's Parquet extension (${error instanceof Error ? error.message : "download failed"}). Online builds can still load it from DuckDB's CDN.`,
  );
}
await mkdir(dirname(manifestFile), { recursive: true });
await writeFile(
  manifestFile,
  JSON.stringify({ version: engineVersion, platform, parquetBundled }),
);
console.log(
  parquetBundled
    ? "Prepared local DuckDB worker, WASM, and Parquet extension."
    : "Prepared local DuckDB worker and WASM; Parquet will use DuckDB's CDN if reachable.",
);
