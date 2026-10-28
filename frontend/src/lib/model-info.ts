import type { components } from "./api/schema";
import { object } from "./forecast.ts";
export type ModelInfo = components["schemas"]["ModelInfo"];
export type Health = components["schemas"]["Health"];
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const integer = (v: unknown) => finite(v) && Number.isSafeInteger(v) && v > 0;
const optional = (v: unknown, test: (x: unknown) => boolean) =>
  v === undefined || test(v);
export function validModelInfo(v: unknown): v is ModelInfo {
  if (
    !object(v) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    !integer(v.parameters) ||
    !integer(v.max_context) ||
    !integer(v.block_size) ||
    typeof v.license !== "string" ||
    !v.license.trim() ||
    !Array.isArray(v.quantile_levels) ||
    !v.quantile_levels.every((x) => finite(x) && x > 0 && x < 1) ||
    new Set(v.quantile_levels).size !== v.quantile_levels.length ||
    !optional(v.revision, (x) => typeof x === "string") ||
    !optional(v.device, (x) => typeof x === "string") ||
    !optional(v.num_samples, integer)
  )
    return false;
  if (v.latency_ms !== undefined) {
    if (
      !object(v.latency_ms) ||
      !optional(v.latency_ms.p50, (x) => finite(x) && x >= 0) ||
      !optional(v.latency_ms.p95, (x) => finite(x) && x >= 0) ||
      !optional(
        v.latency_ms.count,
        (x) => finite(x) && Number.isSafeInteger(x) && x >= 0,
      )
    )
      return false;
  }
  return true;
}
export function validModelHealth(v: unknown): v is Health {
  return (
    object(v) &&
    ["ok", "degraded"].includes(String(v.status)) &&
    typeof v.model_loaded === "boolean" &&
    optional(v.device, (x) => typeof x === "string") &&
    optional(v.version, (x) => typeof x === "string")
  );
}
export function phaseQuantiles(levels: number[]) {
  return [...levels]
    .filter((x) => x >= 0.1 && x <= 0.9)
    .sort((a, b) => a - b)
    .map((x) => `P${Number((x * 100).toFixed(4))}`);
}
export function latencyState(
  info: ModelInfo,
): "empty" | "missing" | "measured" {
  return info.latency_ms?.count === 0
    ? "empty"
    : info.latency_ms?.p50 === undefined
      ? "missing"
      : "measured";
}
