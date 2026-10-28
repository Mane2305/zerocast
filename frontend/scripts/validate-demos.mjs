import { readFile } from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";
import assert from "node:assert/strict";
const contract = YAML.parse(
  await readFile("../contracts/openapi.yaml", "utf8"),
);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: "contract", components: contract.components });
const ids =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ["retail-mock", "manufacturing-mock"];
for (const id of ids) {
  assert(/^[a-zA-Z0-9_-]+$/.test(id), "Use a demo directory ID, not a path.");
  const data = {};
  for (const [file, schema] of Object.entries({
    dataset: "Dataset",
    history: "SeriesHistory",
    forecast: "ForecastResult",
  })) {
    data[file] = JSON.parse(
      await readFile(`public/demo/${id}/${file}.json`, "utf8"),
    );
    const validate = ajv.compile({
      $ref: `contract#/components/schemas/${schema}`,
    });
    assert(
      validate(data[file]),
      `${id}/${file}: ${JSON.stringify(validate.errors?.slice(0, 5))}`,
    );
  }
  const series = data.forecast.series[0];
  assert.equal(data.dataset.series[0].series_id, series.series_id);
  assert.equal(data.history.series_id, series.series_id);
  assert.equal(data.history.dates.length, data.history.target.length);
  assert.equal(series.quantiles.length, data.forecast.quantile_levels.length);
  assert(series.quantiles.every((row) => row.length === series.dates.length));
  assert(
    series.total_distribution.percentiles.every(
      (v, i, arr) => i === 0 || v >= arr[i - 1],
    ),
  );
}
console.log(
  `Static demo bundles (${ids.join(", ")}) validate against contracts/openapi.yaml and have aligned arrays.`,
);
