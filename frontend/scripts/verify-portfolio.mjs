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
const validate = (name) =>
  ajv.compile({
    ...contract.components.schemas[name],
    components: contract.components,
  });
const ids = ["Store / A", "Store B", "=Plant C"];
const dates = Array.from({ length: 8 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString(),
);
const dataset = {
  additive: true,
  dataset_id: "portfolio-fixture",
  name: "Weekly demand portfolio",
  frequency: "weekly",
  holiday_country: "IN",
  series_count: 5,
  factor_columns: [],
  series: ids.map((series_id) => ({ series_id, status: "ready", length: 40 })),
  health: { ready: true, checks: [] },
};
const forecast = {
  quantile_levels: [0.1, 0.3, 0.5, 0.7, 0.9],
  series: ids.map((series_id, i) => ({
    series_id,
    dates,
    quantiles: [1, 2, 3, 4, 5].map((n) => dates.map(() => n * 10)),
    total_distribution: {
      aggregation: "sum",
      percentiles: Array.from({ length: 101 }, (_, n) => 1000 + n),
    },
    risk: {
      uncertainty_score: [0.08, 0.45, 1.2][i],
      ...(i !== 1
        ? { uncertainty_label: ["predictable", "moderate", "volatile"][i] }
        : {}),
      risk_direction: ["balanced", "upside", "downside"][i],
      trust_horizon: [6, 0, 3][i],
    },
    latency_ms: 25,
  })),
};
for (const [name, value] of [
  ["Dataset", dataset],
  ["ForecastResult", forecast],
]) {
  const check = validate(name);
  assert(check(value), JSON.stringify(check.errors));
}
await mkdir("screenshots/f6", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const base = "http://localhost:3000";
const errors = [],
  requests = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
page.on("request", (r) => {
  if (new URL(r.url()).port === "4010")
    requests.push({ url: r.url(), method: r.method() });
});
const shot = async (name) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `screenshots/f6/${name}.png`,
    fullPage: true,
    caret: "initial",
    animations: "disabled",
  });
};
let phase = "succeeded",
  malformed = false,
  empty = false,
  offline = false;
try {
  await page.goto(`${base}/portfolio`);
  await expect(
    page.getByRole("heading", { name: "Know where to look first." }),
  ).toBeVisible();
  await shot("empty");
  await page.getByRole("link", { name: "Retail sales portfolio" }).click();
  await expect(
    page.getByRole("region", { name: "Portfolio risk table" }),
  ).toBeVisible();
  await shot("demo");
  assert.equal(
    requests.length,
    0,
    "Saved portfolios must work without API requests",
  );
  await page.locator("tbody th a").first().click();
  await expect(page.getByRole("combobox", { name: "View series" })).toHaveValue(
    "grocery_units",
  );
  await page.getByRole("link", { name: "View portfolio risk" }).click();
  await expect(page).toHaveURL(/\/portfolio\/demo\/retail-mock$/);
  await page.route("**/datasets/portfolio-fixture", (r) =>
    r.fulfill({ json: dataset }),
  );
  await page.route("**/datasets/portfolio-fixture/series/*", (r) =>
    r.fulfill({
      json: {
        series_id: decodeURIComponent(
          new URL(r.request().url()).pathname.split("/").at(-1),
        ),
        dates: ["2025-12-25T00:00:00Z"],
        target: [5],
      },
    }),
  );
  await page.route("**/jobs/portfolio-job", (r) => {
    if (offline) return r.abort("connectionrefused");
    const value = structuredClone(forecast);
    if (malformed) value.series[0].risk.uncertainty_label = "invented";
    if (empty) value.series = [];
    return r.fulfill({
      json: {
        job_id: "portfolio-job",
        job_type: "forecast",
        status: phase,
        progress: phase === "succeeded" ? 100 : 40,
        error:
          phase === "failed"
            ? { code: "failed", message: "The model worker failed." }
            : null,
        result: phase === "succeeded" ? value : null,
      },
    });
  });
  await page.goto(
    `${base}/portfolio/dataset/portfolio-fixture?job=portfolio-job`,
  );
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  await expect(page.locator("tbody th a").first()).toContainText(ids[2]);
  await expect(
    page.getByText("120% band width", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("~3 weeks", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No reliable steps reported", { exact: true }),
  ).toBeVisible();
  await shot("desktop");
  await page.getByRole("button", { name: /^Uncertainty score/ }).click();
  await expect(page.locator("tbody th a").first()).toContainText(ids[0]);
  await page.getByRole("button", { name: /^Trust horizon/ }).click();
  await expect(page.locator("tbody th a").first()).toContainText(ids[1]);
  await page.getByRole("button", { name: /^Risk direction/ }).click();
  await expect(page.locator("tbody th a").first()).toContainText(ids[0]);
  await page
    .getByRole("combobox", { name: "Uncertainty label" })
    .selectOption("unreported");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText(ids[1]);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("combobox", { name: "Risk direction", exact: true })
    .selectOption("downside");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await shot("filtered");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export visible rows" }).click();
  const csv = await readFile(await (await pending).path(), "utf8");
  assert(csv.includes("'=Plant C"));
  assert(csv.includes('"1.2"'));
  assert.equal(csv.trim().split(/\r?\n/).length, 2);
  await page.getByLabel("Search series", { exact: true }).fill("absent");
  await expect(
    page.getByRole("heading", { name: "No series match these filters." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export visible rows" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Clear filters" }).click();
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
  await page.getByRole("link", { name: /Store \/ A/ }).click();
  await expect(page).toHaveURL(/series=Store\+%2F\+A/);
  await expect(page.getByRole("combobox", { name: "View series" })).toHaveValue(
    ids[0],
  );
  await page.reload();
  await expect(page.getByRole("combobox", { name: "View series" })).toHaveValue(
    ids[0],
  );
  await page.getByRole("link", { name: "View portfolio risk" }).click();
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  // Clicking a non-link cell also opens that row's forecast, preserving the job.
  await page
    .locator("tbody tr")
    .filter({ hasText: ids[1] })
    .locator("td")
    .first()
    .click();
  await expect(page.getByRole("combobox", { name: "View series" })).toHaveValue(
    ids[1],
  );
  await page.goto(`${base}/portfolio/dataset/portfolio-fixture`);
  await expect(
    page.getByRole("heading", { name: "Choose a completed forecast." }),
  ).toBeVisible();
  const url = `${base}/portfolio/dataset/portfolio-fixture?job=portfolio-job`;
  phase = "running";
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "The forecast is still in progress." }),
  ).toBeVisible();
  await shot("running");
  phase = "failed";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "This forecast failed." }),
  ).toBeVisible();
  await shot("failed");
  phase = "succeeded";
  malformed = true;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Portfolio risk unavailable" }),
  ).toBeVisible();
  await shot("invalid");
  malformed = false;
  offline = true;
  await page.reload();
  await expect(page.getByText(/Backend unreachable/)).toBeVisible();
  await shot("backend-unreachable");
  offline = false;
  await page.getByRole("button", { name: "Retry portfolio" }).click();
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  empty = true;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No series returned." }),
  ).toBeVisible();
  await shot("no-series");
  await page.unroute("**/jobs/portfolio-job");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/jobs/portfolio-job", async (r) => {
    await gate;
    await r.fulfill({
      json: {
        job_id: "portfolio-job",
        job_type: "forecast",
        status: "succeeded",
        progress: 100,
        result: forecast,
      },
    });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Loading portfolio risk…" }),
  ).toBeVisible();
  await shot("loading");
  release();
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  assert.equal(
    requests.filter((r) => r.method === "POST").length,
    0,
    "Portfolio must never submit jobs",
  );
  assert.deepEqual(errors, []);
  console.log(
    "F6 passed: offline demo, contract risk metrics, numeric sort/filter/export, encoded series links and reload, row navigation, all states, no job submission and 390px themes.",
  );
} finally {
  await browser.close();
}
