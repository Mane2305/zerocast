import { chooseOption } from "./lib/choose-option.mjs";
import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import YAML from "yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const expect = baseExpect.configure({ timeout: 20000 });
const contract = YAML.parse(
  await readFile("../contracts/openapi.yaml", "utf8"),
);
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const schema = (name) =>
  ajv.compile({
    ...contract.components.schemas[name],
    components: contract.components,
  });
const validResult = schema("ForecastResult"),
  validDataset = schema("Dataset"),
  validRequest = schema("ForecastRequest");
const forecast = {
  quantile_levels: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  series: ["A", "B"].map((id, index) => ({
    series_id: id,
    dates: [
      "2026-03-01T00:00:00Z",
      "2026-03-02T00:00:00Z",
      "2026-03-03T00:00:00Z",
    ],
    quantiles: Array.from({ length: 9 }, (_, q) => [
      q * 10 - 30,
      q * 10 - 25,
      q * 10 - 20,
    ]),
    total_distribution: {
      aggregation: "sum",
      percentiles: Array.from(
        { length: 101 },
        (_, i) => 1000 + index * 1000 + i,
      ),
    },
    step_exceedance_grid: {
      percentiles: Array.from({ length: 99 }, (_, i) => [
        i - 40,
        i - 35,
        i - 30,
      ]),
    },
    last_year: [4, null, 12],
    risk: {
      uncertainty_score: 1,
      risk_direction: "balanced",
      trust_horizon: 3,
    },
    latency_ms: 125,
  })),
};
const dataset = {
  additive: true,
  dataset_id: "f5-fixture",
  name: "Demand planning",
  frequency: "daily",
  series_count: 3,
  factor_columns: ["promo"],
  holiday_country: "IN",
  health: { ready: true, checks: [] },
  series: ["A", "B", "Excluded"].map((series_id, i) => ({
    series_id,
    length: 40,
    status: i === 2 ? "excluded" : "ready",
  })),
};
assert(validResult(forecast), JSON.stringify(validResult.errors));
assert(validDataset(dataset), JSON.stringify(validDataset.errors));
await mkdir("screenshots/f5", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [],
  backend = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
page.on("request", (r) => {
  if (new URL(r.url()).port === "4010") backend.push(r.url());
});
const base = "http://localhost:3000";
const shot = async (name) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `screenshots/f5/${name}.png`,
    fullPage: true,
    caret: "initial",
    animations: "disabled",
  });
};
let phase = "running",
  calls = 0,
  submissions = [],
  bad = false,
  failPost = false,
  historyFails = false;
try {
  await page.goto(`${base}/forecast/retail-mock`);
  await expect(
    page.getByRole("heading", { name: "Your range of possibilities" }),
  ).toBeVisible();
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  const demo = JSON.parse(
    await readFile("public/demo/retail-mock/forecast.json", "utf8"),
  );
  await expect(page.getByTestId("total-50")).toHaveText(
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
      demo.series[0].total_distribution.percentiles[50],
    ),
  );
  await expect(
    page.getByText(/source did not provide the step exceedance grid/),
  ).toBeVisible();
  await shot("demo");
  assert.equal(backend.length, 0, "Demo must remain offline");
  await page.route("**/datasets/f5-fixture", (route) =>
    route.fulfill({ json: dataset }),
  );
  await page.route("**/datasets/f5-fixture/series/*", (route) =>
    historyFails
      ? route.abort("connectionrefused")
      : route.fulfill({
          json: {
            series_id: decodeURIComponent(
              new URL(route.request().url()).pathname.split("/").at(-1),
            ),
            dates: ["2026-02-27T00:00:00Z", "2026-02-28T00:00:00Z"],
            target: [null, 8],
          },
        }),
  );
  await page.route("**/model/info", (route) =>
    route.fulfill({
      json: {
        name: "test",
        parameters: 1,
        quantile_levels: forecast.quantile_levels,
        max_context: 2048,
        block_size: 64,
        license: "test",
        device: "cpu",
      },
    }),
  );
  await page.route("**/jobs/forecast", (route) => {
    submissions.push(route.request().postDataJSON());
    assert(
      validRequest(submissions.at(-1)),
      JSON.stringify(validRequest.errors),
    );
    return failPost
      ? route.fulfill({
          status: 503,
          json: { code: "unavailable", message: "Worker unavailable" },
        })
      : route.fulfill({
          status: 202,
          json: { job_id: "job-f5", job_type: "forecast", status: "queued" },
        });
  });
  await page.route("**/jobs/job-f5", (route) => {
    calls++;
    if (phase === "offline") return route.abort("connectionrefused");
    const result = structuredClone(forecast);
    if (bad) result.series[0].total_distribution.percentiles.pop();
    return route.fulfill({
      json: {
        job_id: "job-f5",
        job_type: "forecast",
        status: phase,
        progress: phase === "succeeded" ? 100 : 35,
        message: phase === "running" ? "Forecasting series 1 of 2" : undefined,
        error:
          phase === "failed"
            ? { code: "worker_failed", message: "The model worker failed." }
            : null,
        result: phase === "succeeded" ? result : null,
      },
    });
  });
  await page.goto(`${base}/forecast/dataset/f5-fixture`);
  await expect(
    page.getByRole("heading", { name: "Your forecast starts here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run forecast", exact: true }),
  ).toBeDisabled();
  assert.equal(submissions.length, 0);
  await shot("empty");
  await expect(page.getByRole("checkbox", { name: /Excluded/ })).toBeDisabled();
  await page.getByRole("checkbox", { name: "A ready", exact: true }).check();
  await page.getByRole("checkbox", { name: "B ready", exact: true }).check();
  await page.getByLabel("Horizon (steps)", { exact: true }).fill("257");
  await expect(
    page.getByRole("button", { name: "Run forecast", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Horizon (steps)", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Run forecast", exact: true }).click();
  await expect(
    page.getByText(/running · Forecasting series 1 of 2/),
  ).toBeVisible();
  await shot("progress");
  assert.deepEqual(submissions[0], {
    dataset_id: "f5-fixture",
    series_ids: ["A", "B"],
    horizon: 3,
    seed: 0,
  });
  await page.getByRole("button", { name: "Pause polling" }).click();
  await expect(page.getByText(/^Polling paused/)).toBeVisible();
  const pausedCalls = calls;
  await page.waitForTimeout(1200);
  assert.equal(calls, pausedCalls);
  phase = "succeeded";
  await page.getByRole("button", { name: "Resume polling" }).click();
  await expect(page.getByTestId("total-50")).toHaveText("1,050");
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  await page.getByLabel("Service level:", { exact: false }).last().fill("90");
  await expect(page.getByTestId("plan-value")).toHaveText("1,090");
  await page.getByLabel("Target total", { exact: true }).fill("1050");
  await expect(
    page.getByText(/50–51% chance of reaching at least/),
  ).toBeVisible();
  await page.getByLabel("Capacity per step", { exact: true }).fill("1000");
  await expect(
    page.getByRole("region", { name: "Capacity risks" }),
  ).toContainText("0–1%");
  await chooseOption(page, "Number display", "INR");
  await expect(page.getByTestId("plan-value")).toContainText("₹");
  await chooseOption(page, "Number display", "units");
  await shot("desktop");
  await chooseOption(page, "View series", "B");
  await expect(page.getByTestId("total-50")).toHaveText("2,050");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export forecast CSV" }).click();
  const csv = await readFile(await (await pending).path(), "utf8");
  assert(csv.includes('"-30"'));
  assert.equal(csv.trim().split(/\r?\n/).length, 7);
  assert(!csv.includes("1050"));
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await shot("mobile-dark");
  await page.reload();
  await expect(page.getByTestId("total-50")).toHaveText("1,050");
  assert.equal(
    submissions.length,
    1,
    "Reload must resume existing job without a POST",
  );
  phase = "failed";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Forecast failed" }),
  ).toBeVisible();
  await shot("failed");
  phase = "offline";
  await page.reload();
  await expect(page.getByText(/Backend unreachable/)).toBeVisible();
  await shot("backend-unreachable");
  phase = "succeeded";
  await page.getByRole("button", { name: "Retry job status" }).click();
  await expect(page.getByTestId("total-50")).toBeVisible();
  bad = true;
  await page.reload();
  await expect(
    page.getByText(/completed job has an invalid forecast/),
  ).toBeVisible();
  await shot("invalid");
  bad = false;
  historyFails = true;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry history" }),
  ).toBeVisible();
  await expect(page.getByTestId("total-50")).toBeVisible();
  await page.goto(`${base}/forecast/dataset/f5-fixture`);
  failPost = true;
  await page.getByRole("checkbox", { name: "A ready", exact: true }).check();
  await page.getByLabel("Horizon (steps)", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Run forecast", exact: true }).click();
  await expect(page.getByText(/Forecast request rejected/)).toBeVisible();
  await shot("submission-error");
  assert.deepEqual(errors, []);
  console.log(
    "F5 passed: offline demo, Run-only submission, exact contract body, polling/pause/resume/reload, total distribution, capacity tails, export, failure recovery, invalid results and mobile themes.",
  );
} finally {
  await browser.close();
}
