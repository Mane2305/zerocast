import { chromium, expect as baseExpect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 20000 });
await mkdir("screenshots/i1-review", { recursive: true });
const read = async (id, file) =>
  JSON.parse(await readFile(`public/demo/${id}/${file}.json`, "utf8"));
const retailHistory = await read("retail", "history");
const cement = await read("manufacturing", "forecast");
const factorResult = await read("manufacturing", "factors");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});
const page = await context.newPage();
const errors = [],
  posts = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.method() === "POST" && /\/(jobs|datasets)/.test(r.url()))
    posts.push(r.url());
});
const base = "http://localhost:3000";
const shot = async (name) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `screenshots/i1-review/${name}.png`,
    fullPage: true,
  });
};
try {
  await page.goto(`${base}/forecast/retail`);
  const chart = page.locator(".forecast-chart");
  await expect(chart).toContainText(/2011/);
  await expect(chart).not.toContainText(/2009|2010/);
  await page.getByText("View forecast values", { exact: true }).click();
  for (const value of await page
    .locator(".forecast-values tbody td")
    .allTextContents())
    assert(!/\d\.\d/.test(value), "Count values must not show decimals");
  await shot("recent-history-counts");
  // Drag the actual left slider handle back to the beginning of supplied history.
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.locator("svg").boundingBox();
  const future = await read("retail", "forecast");
  const ratio =
    (retailHistory.dates.length - 90) /
    (retailHistory.dates.length + future.series[0].dates.length - 1);
  const left = box.x + 65,
    width = box.width - 85,
    y = box.y + box.height - 17;
  await page.mouse.move(left + width * ratio, y);
  await page.mouse.down();
  await page.mouse.move(left, y, { steps: 25 });
  await page.mouse.up();
  await expect(chart).toContainText(/2009/);
  await shot("full-history-slider");
  await page
    .getByLabel("View series", { exact: true })
    .selectOption("CANDLES & T-LIGHTS");
  await expect(page.locator(".forecast-context .lede")).toContainText(
    "CANDLES & T-LIGHTS",
  );
  await expect(page.locator(".forecast-values caption")).toContainText(
    "CANDLES & T-LIGHTS",
  );
  await expect(chart).not.toContainText(/2009|2010/);

  await page.goto(`${base}/forecast/manufacturing`);
  await expect(page.locator(".plan-headline")).toContainText("average");
  await expect(page.locator(".forecast-kpis")).toContainText(
    "Expected average per period",
  );
  await expect(page.getByLabel("Target total", { exact: true })).toHaveCount(0);
  const p50 = cement.series[0].total_distribution.percentiles[50];
  assert.equal(cement.series[0].total_distribution.aggregation, "mean");
  await expect(page.getByTestId("total-50")).toHaveText(
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(p50),
  );
  await expect(
    page.getByLabel("Capacity per step", { exact: true }),
  ).toBeEnabled();
  await shot("period-averages");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await shot("period-averages-mobile");
  await page.goto(`${base}/factors/demo`);
  await expect(
    page.getByRole("heading", { name: "Two questions. Separate evidence." }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(
    factorResult.factors.length,
  );
  assert(
    !(await page.locator("main").innerText())
      .toLowerCase()
      .includes("synthetic"),
  );
  for (const factor of factorResult.factors)
    await expect(page.locator("tbody")).toContainText(factor.factor);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await shot("cement-factors-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot("cement-factors");
  let release;
  await page.route("**/demo/manufacturing/factors.json", async (r) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await r.fulfill({ json: factorResult });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Opening the factor example…" }),
  ).toBeVisible();
  await shot("cement-factors-loading");
  while (!release) await page.waitForTimeout(20);
  release();
  await expect(
    page.getByRole("heading", { name: "Two questions. Separate evidence." }),
  ).toBeVisible();
  await page.unroute("**/demo/manufacturing/factors.json");
  await page.route("**/demo/manufacturing/factors.json", (r) =>
    r.fulfill({ status: 404 }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Factor example unavailable" }),
  ).toBeVisible();
  await shot("cement-factors-unavailable");
  await page.unroute("**/demo/manufacturing/factors.json");
  await page.getByRole("button", { name: "Retry example" }).click();
  await expect(
    page.getByRole("heading", { name: "Two questions. Separate evidence." }),
  ).toBeVisible();
  await page.route("**/demo/manufacturing/factors.json", (r) =>
    r.fulfill({ json: { ...factorResult, factors: [] } }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No factor results returned." }),
  ).toBeVisible();
  await shot("cement-factors-empty");
  await page.unroute("**/demo/manufacturing/factors.json");

  await page.route("**/model/info", (r) =>
    r.fulfill({
      json: {
        name: "fixture",
        parameters: 271845260,
        max_context: 2048,
        block_size: 64,
        license: "Fixture",
        quantile_levels: [0.1, 0.5, 0.9],
      },
    }),
  );
  await page.route("**/health", (r) =>
    r.fulfill({ json: { status: "ok", model_loaded: false } }),
  );
  await page.goto(`${base}/under-the-hood`);
  await expect(page.locator(".model-metadata")).toContainText("271,845,260");
  await shot("international-parameters");
  // A mismatched source aggregation must be rejected instead of mislabelled.
  await page.route("**/demo/manufacturing/forecast.json", (r) => {
    const mismatch = structuredClone(cement);
    mismatch.series[0].total_distribution.aggregation = "sum";
    return r.fulfill({ json: mismatch });
  });
  await page.goto(`${base}/forecast/manufacturing`);
  await expect(
    page.getByRole("heading", { name: "We couldn’t open this demo." }),
  ).toBeVisible();
  await shot("aggregation-mismatch");
  assert.deepEqual(errors, []);
  assert.deepEqual(posts, []);
  console.log(
    "PASS: last 90 history points + forecast, real slider restores full history, whole counts, unchanged backend averages, hidden target-total card, international parameters, cement factor results, 390px layouts, mismatch rejection.",
  );
} finally {
  await browser.close();
}
