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
const validator = (name) =>
  ajv.compile({
    ...contract.components.schemas[name],
    components: contract.components,
  });
const validRequest = validator("FactorRequest");
const names = [
  "promotion_history",
  "cost_index",
  "weather_history",
  "noise_indicator",
  ...Array.from({ length: 7 }, (_, i) => `extra_${i}`),
];
const dataset = {
  additive: true,
  dataset_id: "factor-fixture",
  name: "Demand factor study",
  frequency: "daily",
  holiday_country: "IN",
  series_count: 2,
  factor_columns: names,
  series: [
    { series_id: "A", status: "ready", length: 100 },
    { series_id: "Excluded", status: "excluded", length: 8 },
  ],
  health: { ready: true, checks: [] },
};
const result = {
  series_id: "A",
  baseline_wql: 0.2,
  factors: names.slice(0, 4).map((factor, i) => ({
    factor,
    related:
      i === 3
        ? {}
        : {
            is_related: [true, true, false][i],
            best_lag: i,
            effect: i / 10,
            p_value: i === 0 ? 0.000001 : i / 10,
          },
    helps_yug:
      i === 3
        ? {}
        : {
            helps: [true, false, true][i],
            wql_with_factor: [0.15, 0.22, 0.19][i],
            change_pct: [-25, 10, -5][i],
            ci_low: [-30, -2, -8][i],
            ci_high: [-10, 18, -1][i],
          },
    verdict: [
      "use_it",
      "real_driver_yug_cannot_use",
      "helps_yug_unclear_link",
      "probably_drop",
    ][i],
    explanation: "Supplied verdict and evidence for this test.",
  })),
};
for (const [name, value] of [
  ["Dataset", dataset],
  ["FactorResult", result],
]) {
  const check = validator(name);
  assert(check(value), JSON.stringify(check.errors));
}
for (const [file, name] of [
  ["dataset", "Dataset"],
  ["factors", "FactorResult"],
]) {
  const check = validator(name);
  assert(
    check(
      JSON.parse(
        await readFile(`public/demo/factors-mock/${file}.json`, "utf8"),
      ),
    ),
    JSON.stringify(check.errors),
  );
}
await mkdir("screenshots/f8", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [],
  requests = [],
  submissions = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
page.on("request", (r) => {
  if (new URL(r.url()).port === "4010")
    requests.push({ url: r.url(), method: r.method() });
});
const base = "http://localhost:3000";
const shot = async (name) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `screenshots/f8/${name}.png`,
    fullPage: true,
    caret: "initial",
    animations: "disabled",
  });
};
let phase = "running",
  bad = false,
  offline = false,
  noFactors = false,
  postFails = false,
  empty = false,
  mismatch = false,
  calls = 0;
try {
  await page.goto(`${base}/factors`);
  await expect(
    page.getByRole("heading", { name: "Related does not always mean useful." }),
  ).toBeVisible();
  await shot("empty");
  await page.getByRole("link", { name: "Open cement factor demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Two questions. Separate evidence." }),
  ).toBeVisible();
  const cementFactors = JSON.parse(
    await readFile("public/demo/manufacturing/factors.json", "utf8"),
  );
  await expect(page.locator("tbody tr")).toHaveCount(
    cementFactors.factors.length,
  );
  await shot("demo");
  assert.equal(requests.length, 0, "Factor example must stay offline");
  await page.route("**/datasets/factor-fixture", (r) =>
    r.fulfill({
      json: noFactors ? { ...dataset, factor_columns: [] } : dataset,
    }),
  );
  await page.route("**/jobs/factors", (r) => {
    const body = r.request().postDataJSON();
    assert(validRequest(body), JSON.stringify(validRequest.errors));
    submissions.push(body);
    return postFails
      ? r.fulfill({
          status: 503,
          json: { code: "unavailable", message: "Unavailable" },
        })
      : r.fulfill({
          status: 202,
          json: { job_id: "factor-job", job_type: "factors", status: "queued" },
        });
  });
  await page.route("**/jobs/factor-job", (r) => {
    calls++;
    if (offline) return r.abort("connectionrefused");
    const data = structuredClone(result);
    if (bad) data.factors[0].related.p_value = 2;
    if (empty) data.factors = [];
    if (mismatch) data.series_id = "Wrong series";
    return r.fulfill({
      json: {
        job_id: "factor-job",
        job_type: "factors",
        status: phase,
        progress: phase === "succeeded" ? 100 : 40,
        message:
          phase === "running"
            ? "Comparing sales-only and historical factors"
            : undefined,
        error:
          phase === "failed"
            ? { code: "failed", message: "Backtest failed on the server." }
            : null,
        result: phase === "succeeded" ? data : null,
      },
    });
  });
  await page.goto(`${base}/data-health/factor-fixture`);
  await page.getByRole("link", { name: "Set up a factor check →" }).click();
  await expect(
    page.getByRole("heading", { name: "Start with two separate questions." }),
  ).toBeVisible();
  assert.equal(submissions.length, 0);
  await expect(
    page.getByRole("button", { name: "Run factor check", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Series", exact: true })
    .selectOption("A");
  await expect(page.locator('option[value="Excluded"]')).toHaveJSProperty(
    "disabled",
    true,
  );
  for (const name of names.slice(0, 10))
    await page.getByRole("checkbox", { name, exact: true }).check();
  await expect(
    page.getByRole("checkbox", { name: names[10], exact: true }),
  ).toBeDisabled();
  for (const name of names.slice(4, 10))
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await page.getByLabel("Backtest horizon", { exact: true }).fill("65");
  await expect(
    page.getByRole("button", { name: "Run factor check", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Backtest horizon", { exact: true }).fill("64");
  await page.getByLabel("Maximum lag", { exact: true }).fill("-1");
  await expect(
    page.getByRole("button", { name: "Run factor check", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Maximum lag", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Run factor check", exact: true })
    .click();
  await expect(page.getByText(/running · Comparing sales-only/)).toBeVisible();
  await shot("progress");
  assert.deepEqual(submissions[0], {
    dataset_id: "factor-fixture",
    series_id: "A",
    factors: names.slice(0, 4),
    horizon: 64,
    max_lag: 0,
  });
  await page.getByRole("button", { name: "Pause factor polling" }).click();
  await expect(page.getByText(/^Polling paused/)).toBeVisible();
  const pausedCalls = calls;
  await page.waitForTimeout(1200);
  assert.equal(calls, pausedCalls);
  phase = "succeeded";
  await page.getByRole("button", { name: "Resume factor polling" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  const table = page.getByRole("region", { name: "Two-lens factor results" });
  await expect(
    table.getByText("Related, but no model benefit yet", { exact: true }),
  ).toBeVisible();
  await expect(
    table.getByText("Forecast gain, unclear statistical link", { exact: true }),
  ).toBeVisible();
  const first = page
    .locator("tbody tr")
    .filter({ hasText: "promotion_history" });
  await first.getByText("Statistical details", { exact: true }).click();
  await expect(first.getByText("0", { exact: true })).toHaveCount(2);
  await expect(first.getByText("0.000001", { exact: true })).toBeVisible();
  await first.getByText("Backtest details", { exact: true }).click();
  await expect(first).toContainText("Error change: -25%");
  await expect(first).toContainText(
    "Interval scale and confidence level were not specified",
  );
  await shot("desktop");
  await page
    .getByRole("combobox", { name: "Verdict", exact: true })
    .selectOption("probably_drop");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.locator("tbody td > strong").filter({ hasText: "Not reported" }),
  ).toHaveCount(2);
  await shot("optional-fields");
  await page
    .getByRole("combobox", { name: "Verdict", exact: true })
    .selectOption("real_driver_yug_cannot_use");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export visible factors" }).click();
  const csv = await readFile(await (await pending).path(), "utf8");
  assert(csv.includes('"cost_index"'));
  assert(csv.includes('"false"'));
  assert.equal(csv.trim().split(/\r?\n/).length, 2);
  await page.getByLabel("Search factors", { exact: true }).fill("absent");
  await expect(
    page.getByRole("heading", { name: "No factors match these filters." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export visible factors" }),
  ).toBeDisabled();
  await page.getByLabel("Search factors", { exact: true }).fill("");
  await page
    .getByRole("combobox", { name: "Verdict", exact: true })
    .selectOption("all");
  await page.getByRole("button", { name: /^Factor [↑↓]/ }).click();
  await expect(page.locator("tbody th").first()).toHaveText("weather_history");
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
  await expect(page.locator("tbody tr")).toHaveCount(4);
  assert.equal(
    submissions.length,
    1,
    "Reload must resume the factor job without resubmission",
  );
  phase = "failed";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Factor check failed", exact: true }),
  ).toBeVisible();
  await shot("failed");
  phase = "succeeded";
  bad = true;
  await page.reload();
  await expect(
    page.getByText(/completed job has an invalid factor result/),
  ).toBeVisible();
  await shot("invalid");
  bad = false;
  offline = true;
  await page.reload();
  await expect(page.getByText(/Backend unreachable/)).toBeVisible();
  await shot("backend-unreachable");
  offline = false;
  await page.getByRole("button", { name: "Retry factor status" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  empty = true;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No factor results returned." }),
  ).toBeVisible();
  await shot("no-results");
  empty = false;
  await page.goto(`${base}/factors/dataset/factor-fixture`);
  noFactors = true;
  await page.reload();
  await expect(
    page.getByText(/This dataset has no factor columns/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run factor check", exact: true }),
  ).toBeDisabled();
  await shot("no-factors");
  noFactors = false;
  await page.reload();
  postFails = true;
  await page
    .getByRole("combobox", { name: "Series", exact: true })
    .selectOption("A");
  await page.getByRole("checkbox", { name: names[0], exact: true }).check();
  await page
    .getByRole("button", { name: "Run factor check", exact: true })
    .click();
  await expect(page.getByText(/Factor check request rejected/)).toBeVisible();
  await shot("submission-error");
  assert.deepEqual(errors, []);
  console.log(
    "F8 passed: contract demo and payloads, two separate lenses and all verdicts, zero/missing fields, ten-factor and 64-step limits, Run-only jobs, polling/reload, filters/export, no-factor state, failures/retry and 390px themes.",
  );
} finally {
  await browser.close();
}
