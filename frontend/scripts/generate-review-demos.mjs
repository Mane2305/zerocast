import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const contract = YAML.parse(
  await readFile("../contracts/openapi.yaml", "utf8"),
);
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile({
  ...contract.components.schemas.ReviewResult,
  components: contract.components,
});
for (const id of ["retail-mock", "manufacturing-mock"]) {
  const history = JSON.parse(
    await readFile(`public/demo/${id}/history.json`, "utf8"),
  );
  function event(index, delta, extra = {}) {
    const actual = history.target[index] ?? 100,
      expected = actual - delta;
    return {
      date: history.dates[index],
      actual,
      expected_p50: expected,
      expected_p10: expected - 12,
      expected_p90: expected + 12,
      deviation_pct: (delta / Math.abs(expected)) * 100,
      ...extra,
    };
  }
  const actual = history.target.reduce((sum, v) => sum + (v ?? 0), 0);
  const review = {
    series: [
      {
        series_id: history.series_id,
        positive_surprises: [
          event(4, 35),
          event(8, 20, { calendar_events: ["Illustrative seasonal event"] }),
          event(12, 2, {
            calendar_events: ["Illustrative recurring event"],
            recurring_as_expected: true,
          }),
        ],
        misses: [event(16, -30), event(20, -18)],
        actual_total: actual,
        expected_total: actual - 7,
        band_coverage: 0.83,
      },
    ],
  };
  if (!validate(review)) throw new Error(JSON.stringify(validate.errors));
  await writeFile(
    `public/demo/${id}/review.json`,
    JSON.stringify(review, null, 2) + "\n",
  );
}
console.log(
  "Generated contract-valid synthetic review illustrations. No model or holiday matching was run.",
);
