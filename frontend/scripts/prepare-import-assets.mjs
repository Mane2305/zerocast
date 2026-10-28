import { copyFile, mkdir } from "node:fs/promises";
const source = "node_modules/@duckdb/duckdb-wasm/dist";
const target = "public/vendor/duckdb";
await mkdir(target, { recursive: true });
for (const file of ["duckdb-mvp.wasm", "duckdb-browser-mvp.worker.js"])
  await copyFile(`${source}/${file}`, `${target}/${file}`);
console.log("Prepared local DuckDB worker and WASM assets.");
