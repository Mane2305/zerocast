import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validModelInfo,
  validModelHealth,
  phaseQuantiles,
  latencyState,
  type ModelInfo,
} from "../src/lib/model-info.ts";
const info: ModelInfo = {
  name: "model",
  parameters: 271845260,
  max_context: 2048,
  block_size: 64,
  license: "CC-BY-NC-4.0 (weights)",
  quantile_levels: [0.1, 0.5, 0.9, 0.95, 0.99],
};
test("model metadata preserves optional fields and rejects invalid measurements", () => {
  assert(validModelInfo(info));
  assert(validModelInfo({ ...info, latency_ms: { p50: 0, count: 0 } }));
  assert(!validModelInfo({ ...info, parameters: "271M" }));
  assert(!validModelInfo({ ...info, quantile_levels: [0.1, NaN] }));
  assert(!validModelInfo({ ...info, latency_ms: { p50: -1 } }));
  assert(!validModelInfo({ ...info, latency_ms: { count: -1 } }));
  assert(!validModelInfo({ ...info, latency_ms: { p95: "bad" } }));
});
test("phase quantiles stay in the supported range without mutating input", () => {
  const levels = [0.99, 0.9, 0.1, 0.5, 0.95];
  assert.deepEqual(phaseQuantiles(levels), ["P10", "P50", "P90"]);
  assert.deepEqual(levels, [0.99, 0.9, 0.1, 0.5, 0.95]);
});
test("missing latency differs from empty history and measured zero", () => {
  assert.equal(latencyState(info), "missing");
  assert.equal(
    latencyState({ ...info, latency_ms: { p50: 0, count: 0 } }),
    "empty",
  );
  assert.equal(
    latencyState({ ...info, latency_ms: { p50: 0, count: 4 } }),
    "measured",
  );
  assert.equal(latencyState({ ...info, latency_ms: { count: 4 } }), "missing");
  assert(validModelHealth({ status: "degraded", model_loaded: false }));
  assert(!validModelHealth({ status: "ok", model_loaded: "yes" }));
});
