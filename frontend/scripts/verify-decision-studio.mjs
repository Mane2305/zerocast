import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const base = process.env.VERIFY_URL || "http://localhost:3000";
const demoMode = process.env.VERIFY_DEMO_MODE === "1";
const folder = "screenshots/decision-studio";
await mkdir(folder, { recursive: true });
const retail = JSON.parse(
  await readFile("public/demo/retail/forecast.json", "utf8"),
);
const accuracy = JSON.parse(
  await readFile("public/demo/retail/accuracy.json", "utf8").catch(
    () => "null",
  ),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
    locale: "en-US",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const apiCalls = [];
  page.on("request", (request) => {
    if (/localhost:8000|\/jobs\//.test(request.url()))
      apiCalls.push(request.url());
  });
  await page.goto(base);
  await expect(page).toHaveURL(/\/forecast\/retail/);
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(
    page.getByRole("heading", { name: "Forecast", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".studio-demo-banner")).toContainText(
    "UCI Online Retail II",
  );
  await expect(page.locator(".plan-headline")).toContainText(
    "80% service level",
  );
  await expect(page.locator("[data-testid=total-50]")).toHaveText(
    Math.round(
      retail.series[0].total_distribution.percentiles[50],
    ).toLocaleString("en-US"),
  );
  await expect(page.locator("#service-level")).toHaveAttribute("min", "50");
  await expect(page.locator("#service-level")).toHaveAttribute("max", "90");
  await expect(
    page.getByText("Forecast error (WAPE)", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".workflow,.steps")).toHaveCount(0);
  await expect(page.locator(".forecast-kpis")).not.toContainText("Unavailable");
  if (accuracy) {
    await expect(page.locator("[data-testid=forecast-error]")).toHaveText(
      `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(accuracy.series[0].wape)}%`,
    );
    await expect(
      page.getByLabel("Last backtest", { exact: true }),
    ).toBeChecked();
    await page.getByLabel("Last backtest", { exact: true }).uncheck();
    await expect(page.locator(".forecast-chart svg")).not.toContainText(
      "Backtest forecast",
    );
    await page.getByLabel("Last backtest", { exact: true }).check();
  }
  const chartBox = await page.locator(".forecast-chart").boundingBox();
  expect(chartBox.height).toBeGreaterThanOrEqual(380);
  expect(chartBox.y).toBeLessThan(500);
  expect(
    await page.locator("h1").evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("20px");
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export forecast chart PNG" }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toBe("zerocast-forecast.png");
  const stream = await png.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).subarray(0, 8).toString("hex")).toBe(
    "89504e470d0a1a0a",
  );
  await page.getByLabel("Capacity per period", { exact: true }).fill("2000");
  await expect(page.locator(".capacity-chart svg")).toBeVisible();
  await page.getByLabel("Capacity per period", { exact: true }).fill("");
  await page.locator("h1").click();
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search items", { exact: true })).toBeFocused();
  const alternate = retail.series[1].series_id;
  await page.getByLabel("Search items", { exact: true }).fill(alternate);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Item", { exact: true })).toHaveValue(alternate);
  await page.locator("#service-level").fill("75");
  await page.reload();
  await expect(page.locator("#service-level")).toHaveValue("75");
  await page.locator("#service-level").fill("80");
  await page
    .getByLabel("Item", { exact: true })
    .selectOption(retail.series[0].series_id);
  for (const [name, url, selector] of [
    ["forecast", "/forecast/retail", ".forecast-chart svg"],
    ["portfolio", "/portfolio/demo/retail", ".portfolio-table tbody tr"],
    ["data", "/data", ".source-grid"],
    ["data-quality", "/data-health/demo/retail", ".health-stats"],
  ]) {
    await page.goto(base + url);
    await expect(page.locator(selector).first()).toBeVisible();
    for (const [device, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${folder}/after-${name}-${device}.png`,
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Accuracy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Accuracy", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".accuracy-chart svg")).toHaveCount(2);
  await page.goto(base + "/forecast/manufacturing");
  await expect(page.locator(".plan-headline")).toContainText(
    "average per period",
  );
  await expect(page.getByLabel("Target total", { exact: true })).toHaveCount(0);
  await expect(page.locator(".scenario-row")).toContainText(
    "Average per period",
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  await page.screenshot({
    path: `${folder}/after-dark-mobile.png`,
    fullPage: true,
  });
  if (demoMode) {
    await expect(page.locator(".api-status")).toHaveAttribute(
      "title",
      /Demo mode/,
    );
    expect(apiCalls).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
  const failing = await browser.newContext();
  const failure = await failing.newPage();
  await failure.route("**/demo/retail/forecast.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await failure.goto(base + "/forecast/retail");
  await expect(failure.locator("main [role=alert]")).toContainText(
    "couldn’t open this demo",
  );
  await failure.screenshot({ path: `${folder}/error.png`, fullPage: true });
  await failure.unroute("**/demo/retail/forecast.json");
  await failure.route("**/demo/retail/accuracy.json", (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await failure.reload();
  await expect(failure.locator(".forecast-chart svg")).toBeVisible();
  await expect(failure.locator("[data-testid=forecast-error]")).toHaveCount(0);
  await expect(
    failure.getByLabel("Last backtest", { exact: true }),
  ).toHaveCount(0);
  await failing.close();
  if (!demoMode) {
    const live = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const workspace = await live.newPage();
    const dataset = JSON.parse(
      await readFile("public/demo/retail/dataset.json", "utf8"),
    );
    dataset.dataset_id = "v2-test";
    let submitted = 0;
    await workspace.route("**/health", (route) =>
      route.fulfill({ json: { status: "ok", model_loaded: false } }),
    );
    await workspace.route("**/datasets/v2-test", (route) =>
      route.fulfill({ json: dataset }),
    );
    await workspace.route("**/datasets/v2-test/series/*", (route) =>
      route.fulfill({ json: JSON.parse(requireHistory) }),
    );
    const requireHistory = await readFile(
      "public/demo/retail/history.json",
      "utf8",
    );
    await workspace.route("**/jobs/forecast", (route) => {
      const body = route.request().postDataJSON();
      expect(body.return_paths).toBe(30);
      expect(body.horizon).toBe(14);
      submitted++;
      return route.fulfill({
        status: 202,
        json: { job_id: "v2-forecast", job_type: "forecast", status: "queued" },
      });
    });
    await workspace.route("**/jobs/v2-forecast", (route) =>
      route.fulfill({
        json: {
          job_id: "v2-forecast",
          job_type: "forecast",
          status: "succeeded",
          progress: 100,
          result: retail,
        },
      }),
    );
    await workspace.goto(base + "/forecast/dataset/v2-test");
    await expect(
      workspace.locator(".forecast-series-picker input").first(),
    ).toBeVisible();
    expect(submitted).toBe(0);
    for (const input of await workspace
      .locator(".forecast-series-picker input")
      .all())
      await input.check();
    await workspace
      .getByLabel("Forecast horizon (periods)", { exact: true })
      .fill("14");
    await workspace
      .getByRole("button", { name: "Run forecast", exact: true })
      .click();
    await expect(workspace.locator(".forecast-chart svg")).toBeVisible();
    expect(submitted).toBe(1);
    await expect(workspace.locator(".api-status")).toHaveAttribute(
      "title",
      "API connected · model not ready",
    );
    await expect(
      workspace.locator("[data-testid=review-coverage]"),
    ).toHaveCount(0);
    await workspace.screenshot({
      path: `${folder}/api-workspace.png`,
      fullPage: true,
    });
    await live.close();
  }
  console.log(
    `PASS: decision studio, data-derived plans, capacity chart, PNG, saved settings, mobile, dark mode, error state${demoMode ? ", zero API requests in demo mode" : ""}.`,
  );
} finally {
  await browser.close();
}
