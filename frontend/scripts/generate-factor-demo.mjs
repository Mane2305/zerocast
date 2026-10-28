import { readFile, writeFile, mkdir } from "node:fs/promises";
import YAML from "yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const contract = YAML.parse(
  await readFile("../contracts/openapi.yaml", "utf8"),
);
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const factors = [
  "promotion_history",
  "commodity_index",
  "temperature_history",
  "noise_indicator",
];
const result = {
  series_id: "illustrative_sales",
  baseline_wql: 0.2,
  factors: factors.map((factor, i) => ({
    factor,
    related: {
      is_related: [true, true, false, false][i],
      best_lag: [1, 2, 0, 0][i],
      effect: [0.4, 0.6, 0.05, 0.01][i],
      p_value: [0.01, 0.001, 0.6, 0.8][i],
    },
    helps_yug: {
      helps: [true, false, true, false][i],
      wql_with_factor: [0.16, 0.23, 0.18, 0.2][i],
      change_pct: [-20, 15, -10, 0][i],
      ci_low: [-25, -4, -16, -5][i],
      ci_high: [-10, 20, -4, 6][i],
    },
    verdict: [
      "use_it",
      "real_driver_yug_cannot_use",
      "helps_yug_unclear_link",
      "probably_drop",
    ][i],
    explanation:
      "Invented evidence for a UI example. No inference or backtest was performed.",
  })),
};
const dataset = {
  dataset_id: "factors-mock",
  additive: true,
  name: "Historical factor illustration",
  frequency: "daily",
  series_count: 1,
  factor_columns: factors,
  health: { ready: true, checks: [] },
  series: [{ series_id: "illustrative_sales", length: 100, status: "ready" }],
};
await mkdir("public/demo/factors-mock", { recursive: true });
for (const [file, name, value] of [
  ["dataset", "Dataset", dataset],
  ["factors", "FactorResult", result],
]) {
  const validate = ajv.compile({
    ...contract.components.schemas[name],
    components: contract.components,
  });
  if (!validate(value)) throw new Error(JSON.stringify(validate.errors));
  await writeFile(
    `public/demo/factors-mock/${file}.json`,
    JSON.stringify(value, null, 2) + "\n",
  );
}
console.log(
  "Generated contract-valid synthetic factor illustration. No statistics or model backtest was run.",
);
