import { mkdir, writeFile } from "node:fs/promises";
import type { components } from "../src/lib/api/schema.d.ts";
// Deterministic synthetic UI fixtures, not output from a forecasting model.
for (const monthly of [false, true]) {
  const id = monthly ? "manufacturing-mock" : "retail-mock";
  const seriesId = monthly ? "cement_index" : "grocery_units";
  const horizon = monthly ? 6 : 14;
  const date = (i: number) =>
    new Date(
      Date.UTC(monthly ? 2023 : 2026, monthly ? i : 0, monthly ? 1 : i + 1),
    ).toISOString();
  const values = Array.from({ length: 36 }, (_, i) =>
    Math.round((monthly ? 105 : 120) + i * 0.6 + Math.sin(i * 0.9) * 9),
  );
  const future = Array.from(
    { length: horizon },
    (_, i) => values[35] + i * 0.8 + Math.sin(i * 0.9) * 6,
  );
  // Total percentiles come from synthetic sample-path totals, never summed quantiles.
  const paths = Array.from({ length: 101 }, (_, sample) =>
    future.map((mean, step) =>
      Math.max(
        0,
        mean + (sample - 50) * 0.45 + Math.sin(sample * 0.7 + step) * 3,
      ),
    ),
  );
  const percentile = (samples: number[], p: number) =>
    [...samples].sort((a, b) => a - b)[Math.round((samples.length - 1) * p)];
  const levels = Array.from({ length: 9 }, (_, i) => (i + 1) / 10);
  const totals = paths.map((path) =>
    path.reduce((total, value) => total + value, 0),
  );
  const dataset: components["schemas"]["Dataset"] = {
    dataset_id: id,
    additive: true,
    name: monthly ? "Synthetic cement production" : "Synthetic grocery sales",
    frequency: monthly ? "monthly" : "daily",
    holiday_country: monthly ? "IN" : null,
    series_count: 1,
    factor_columns: [],
    date_range: { start: date(0), end: date(35) },
    series: [
      {
        series_id: seriesId,
        length: 36,
        status: "ready",
        start: date(0),
        end: date(35),
        missing_count: 0,
        issues: [],
      },
    ],
    health: { ready: true, checks: [] },
  };
  const history: components["schemas"]["SeriesHistory"] = {
    series_id: seriesId,
    dates: values.map((_, i) => date(i)),
    target: values,
  };
  const quantiles = levels.map((p) =>
    future.map((_, step) =>
      percentile(
        paths.map((path) => path[step]),
        p,
      ),
    ),
  );
  const forecast: components["schemas"]["ForecastResult"] = {
    quantile_levels: levels,
    series: [
      {
        series_id: seriesId,
        dates: future.map((_, i) => date(36 + i)),
        quantiles,
        step_exceedance_grid: {
          percentiles: Array.from({ length: 99 }, (_, i) =>
            future.map((_, step) =>
              percentile(
                paths.map((path) => path[step]),
                (i + 1) / 100,
              ),
            ),
          ),
        },
        total_distribution: {
          aggregation: "sum",
          percentiles: Array.from({ length: 101 }, (_, p) =>
            percentile(totals, p / 100),
          ),
        },
        risk: {
          uncertainty_score:
            future.reduce(
              (total, _, i) =>
                total +
                (quantiles[8][i] - quantiles[0][i]) / Math.abs(quantiles[4][i]),
              0,
            ) / horizon,
          risk_direction: "balanced",
          trust_horizon: horizon,
        },
        latency_ms: 0,
      },
    ],
  };
  const folder = `public/demo/${id}`;
  await mkdir(folder, { recursive: true });
  for (const [file, data] of Object.entries({ dataset, history, forecast }))
    await writeFile(
      `${folder}/${file}.json`,
      JSON.stringify(data, null, 2) + "\n",
    );
}
await mkdir("public/templates", { recursive: true });
await writeFile(
  "public/templates/zerocast-template.csv",
  "date,series_id,target\r\n",
);
const rows = Array.from(
  { length: 36 },
  (_, i) =>
    `${new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10)},store_01,${[120, 132, 125][i % 3] + Math.floor(i / 3)}`,
);
await writeFile(
  "public/templates/zerocast-example.csv",
  "date,series_id,target\r\n" + rows.join("\r\n") + "\r\n",
);
console.log("Generated two synthetic demo bundles and CSV templates.");
