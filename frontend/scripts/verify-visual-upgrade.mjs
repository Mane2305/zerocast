import { chromium, expect as baseExpect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 20000 });
const read = async (file) =>
  JSON.parse(await readFile(`public/demo/retail/${file}.json`, "utf8"));
const forecast = await read("forecast"),
  review = await read("review"),
  history = await read("history");
const series = forecast.series[0],
  reviewed = review.series.find((s) => s.series_id === series.series_id);
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("screenshots/visual-upgrade", { recursive: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "dark",
  locale: "en-US",
});
const errors = [],
  api = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (["8000", "4010"].includes(new URL(r.url()).port)) api.push(r.url());
});
const base = "http://localhost:3000";
const shot = async (name, fullPage = true) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `screenshots/visual-upgrade/${name}.png`,
    fullPage,
  });
};
try {
  await page.goto(base);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("link", { name: "Try a demo", exact: true }).click();
  await expect(page).toHaveURL(`${base}/forecast/retail`);
  await expect(
    page.getByRole("heading", { name: "Your range of possibilities" }),
  ).toBeVisible();
  await expect(page.locator(".forecast-chart")).toContainText(/2011/);
  const whole = (value) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  await expect(page.getByTestId("plan-value")).toHaveText(
    whole(series.total_distribution.percentiles[80]),
  );
  await expect(page.locator(".plan-headline")).toContainText("next 14 days");
  await expect(page.locator(".plan-headline")).toContainText(
    "8 times out of 10",
  );
  await expect(page.getByTestId("total-50")).toHaveText(
    whole(series.total_distribution.percentiles[50]),
  );
  await expect(page.getByTestId("review-coverage")).toHaveText(
    reviewed?.band_coverage === undefined
      ? "Unavailable"
      : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(reviewed.band_coverage * 100)}%`,
  );
  await expect(page.getByLabel("Forecast overview")).toContainText(
    "no training",
  );
  await shot("after");
  await shot("after-viewport", false);
  await page
    .getByRole("button", { name: "About observed coverage", exact: true })
    .focus();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Observed share" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await shot("after-mobile");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await shot("after-mobile-dark");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/demo/retail/review.json", (r) =>
    r.fulfill({ status: 503 }),
  );
  await page.reload();
  await expect(page.getByTestId("review-coverage")).toHaveText("Unavailable");
  await expect(page.getByTestId("plan-value")).toHaveText(
    whole(series.total_distribution.percentiles[80]),
  );
  await shot("review-unavailable");
  await page.unroute("**/demo/retail/review.json");
  // Rendering-only fixtures exercise optional arrays without writing product data.
  const supplied = structuredClone(forecast);
  supplied.series[0].sample_paths = Array.from({ length: 100 }, (_, p) =>
    series.dates.map((_, i) => p + i),
  );
  const replay = structuredClone(review);
  replay.series.find((s) => s.series_id === series.series_id).backtest_points =
    history.dates.slice(-30).map((date, i) => ({
      date,
      actual: history.target.at(-30 + i),
      expected_p50: 100 + i,
      expected_p10: 50,
      expected_p90: 200 + i,
    }));
  await page.route("**/demo/retail/forecast.json", (r) =>
    r.fulfill({ json: supplied }),
  );
  await page.route("**/demo/retail/review.json", (r) =>
    r.fulfill({ json: replay }),
  );
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "100 possible futures", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".forecast-chart")).toContainText(
    "Backtest forecast",
  );
  await expect(page.locator(".forecast-chart")).toContainText(
    "Backtest actual",
  );
  const withPaths = await page.locator(".forecast-chart svg path").count();
  await page
    .getByRole("checkbox", { name: "100 possible futures", exact: true })
    .uncheck();
  await expect
    .poll(async () => page.locator(".forecast-chart svg path").count())
    .toBeLessThan(withPaths - 80);
  await page
    .getByRole("checkbox", { name: "Recent backtest", exact: true })
    .uncheck();
  await expect(page.locator(".forecast-chart")).not.toContainText(
    "Backtest forecast",
  );
  await page.unroute("**/demo/retail/forecast.json");
  await page.unroute("**/demo/retail/review.json");
  await page.goto(`${base}/forecast/manufacturing`);
  await expect(page.locator(".plan-headline")).toContainText("average");
  await expect(page.getByLabel("Target total", { exact: true })).toHaveCount(0);
  await shot("after-manufacturing");
  assert.deepEqual(
    api,
    [],
    "Saved demo views must not call the backend or run jobs",
  );
  const dataset = await read("dataset");
  await page.route("**/datasets/retail", (r) => r.fulfill({ json: dataset }));
  await page.route("**/datasets/retail/series/**", (r) =>
    r.fulfill({ json: history }),
  );
  await page.route("**/jobs/visual-forecast", (r) =>
    r.fulfill({
      json: {
        job_id: "visual-forecast",
        job_type: "forecast",
        status: "succeeded",
        progress: 100,
        result: forecast,
      },
    }),
  );
  await page.route("**/jobs/visual-review", (r) =>
    r.fulfill({
      json: {
        job_id: "visual-review",
        job_type: "review",
        status: "succeeded",
        progress: 100,
        result: review,
      },
    }),
  );
  await page.route("**/model/info", (r) =>
    r.fulfill({
      json: {
        name: "fixture",
        parameters: 271845260,
        quantile_levels: [0.1, 0.5, 0.9],
        max_context: 2048,
        block_size: 64,
        license: "Fixture",
      },
    }),
  );
  await page.evaluate(() =>
    sessionStorage.setItem("zerocast-review:retail", "visual-review"),
  );
  await page.goto(`${base}/forecast/dataset/retail?job=visual-forecast`);
  await expect(page.getByTestId("review-coverage")).toHaveText(
    `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(reviewed.band_coverage * 100)}%`,
  );
  assert(
    api.some((url) => url.endsWith("/jobs/visual-review")),
    "Reuse only the recorded same-dataset review job",
  );
  await page.getByText("Change forecast inputs", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run forecast", exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: direct retail demo, honest plan/KPI values and unavailable review, default light/persisted dark, accessible tooltips, mobile layout, optional path/backtest toggles, non-additive averages. Before/after screenshots saved; optional renderer fixtures were not written to demo JSON.",
  );
} finally {
  await browser.close();
}
