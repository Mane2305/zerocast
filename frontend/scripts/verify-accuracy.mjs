import { chooseOption } from "./lib/choose-option.mjs";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const base = process.env.VERIFY_URL || "http://localhost:3000";
const folder = "screenshots/accuracy";
await mkdir(folder, { recursive: true });
const accuracy = JSON.parse(
  await readFile("public/demo/retail/accuracy.json", "utf8"),
);
const dataset = JSON.parse(
  await readFile("public/demo/retail/dataset.json", "utf8"),
);
const forecast = JSON.parse(
  await readFile("public/demo/retail/forecast.json", "utf8"),
);
const history = JSON.parse(
  await readFile("public/demo/retail/history.json", "utf8"),
);
const percent = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v) + "%";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });
  const page = await context.newPage();
  const errors = [];
  const posts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.goto(base + "/accuracy");
  await expect(page).toHaveURL(/\/accuracy\/demo\/retail/);
  await expect(page.locator(".accuracy-chart svg")).toHaveCount(2);
  await expect(page.locator("[data-testid=accuracy-wape]")).toHaveText(
    percent(accuracy.portfolio.wape),
  );
  await expect(page.locator("[data-testid=accuracy-coverage]")).toHaveText(
    percent(accuracy.portfolio.coverage_p10_p90 * 100),
  );
  await expect(page.locator("[data-testid=accuracy-bias]")).toHaveText(
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 1,
      signDisplay: "always",
    }).format(accuracy.portfolio.bias_pct) + "%",
  );
  await expect(page.locator(".accuracy-items tbody tr")).toHaveCount(
    accuracy.series.length,
  );
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Accuracy", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .locator(".accuracy-items")
    .getByRole("button", { name: accuracy.series[1].series_id, exact: true })
    .click();
  await expect(page.getByLabel("Accuracy chart item")).toHaveValue(
    accuracy.series[1].series_id,
  );
  await page.getByLabel("Filter accuracy items").fill("no-such-item");
  await expect(page.getByText("No items match this filter.")).toBeVisible();
  await page.getByLabel("Filter accuracy items").fill("");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export visible CSV" }).click();
  const csv = await download;
  const chunks = [];
  for await (const chunk of await csv.createReadStream()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).toContain('"' + accuracy.series[0].bias_pct + '"');
  const pngDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export calibration chart PNG" })
    .click();
  const png = await pngDownload;
  const image = [];
  for await (const chunk of await png.createReadStream()) image.push(chunk);
  expect(Buffer.concat(image).subarray(0, 8).toString("hex")).toBe(
    "89504e470d0a1a0a",
  );
  await chooseOption(page, "Chart item", accuracy.series[0].series_id);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: `${folder}/mobile-dark.png`, fullPage: true });
  await page.goto(base + "/accuracy/demo/manufacturing");
  await expect(page.locator(".accuracy-chart svg")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
  for (const kind of ["error", "empty", "no-baseline", "invalid"]) {
    const test = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const report = structuredClone(accuracy);
    if (kind === "empty") report.series = [];
    if (kind === "no-baseline") {
      report.portfolio.naive_wape = null;
      report.portfolio.improvement_vs_naive_pct = null;
    }
    if (kind === "invalid") report.series[0].backtest.p90.pop();
    await test.route("**/demo/retail/accuracy.json", (route) =>
      kind === "error"
        ? route.fulfill({ status: 503, body: "Unavailable" })
        : route.fulfill({ json: report }),
    );
    await test.goto(base + "/accuracy/demo/retail");
    if (kind === "error" || kind === "invalid")
      await expect(test.locator("main [role=alert]")).toContainText(
        "Accuracy unavailable",
      );
    if (kind === "empty")
      await expect(test.getByText("No item scores returned.")).toBeVisible();
    if (kind === "no-baseline")
      await expect(
        test.locator("[data-testid=accuracy-improvement]"),
      ).toHaveText("Unavailable");
    await test.screenshot({ path: `${folder}/${kind}.png`, fullPage: true });
    await test.close();
  }
  if (process.env.VERIFY_DEMO_MODE !== "1") {
    const live = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const test = await live.newPage();
    let submitted = 0,
      complete = false;
    const data = { ...dataset, dataset_id: "accuracy-fixture" };
    await test.route("**/datasets/accuracy-fixture", (route) =>
      route.fulfill({ json: data }),
    );
    await test.route("**/jobs/accuracy", (route) => {
      const body = route.request().postDataJSON();
      expect(body.dataset_id).toBe("accuracy-fixture");
      expect(body.horizon).toBe(14);
      expect(body.origins).toBe(8);
      expect(body.series_ids).toHaveLength(5);
      submitted++;
      return route.fulfill({
        status: 202,
        json: {
          job_id: "accuracy-job",
          job_type: "accuracy",
          status: "queued",
        },
      });
    });
    await test.route("**/jobs/accuracy-job", (route) =>
      route.fulfill({
        json: {
          job_id: "accuracy-job",
          job_type: "accuracy",
          status: complete ? "succeeded" : "running",
          progress: complete ? 100 : 25,
          result: complete ? accuracy : null,
        },
      }),
    );
    await test.goto(base + "/accuracy/dataset/accuracy-fixture");
    await expect(
      test.getByRole("button", { name: "Run accuracy", exact: true }),
    ).toBeDisabled();
    expect(submitted).toBe(0);
    await test.screenshot({ path: `${folder}/before-run.png`, fullPage: true });
    await test.getByRole("button", { name: "Items to score" }).click();
    await test
      .locator(".zc-popover")
      .getByRole("button", { name: /^Select all/ })
      .click();
    await test.keyboard.press("Escape");
    await test.getByLabel("Forecast horizon", { exact: true }).fill("0");
    await expect(
      test.getByRole("button", { name: "Run accuracy", exact: true }),
    ).toBeDisabled();
    await test.getByLabel("Forecast horizon", { exact: true }).fill("14");
    await test
      .getByRole("button", { name: "Run accuracy", exact: true })
      .click();
    await expect(test.getByLabel("Accuracy progress")).toHaveAttribute(
      "value",
      "25",
    );
    await test.screenshot({ path: `${folder}/running.png`, fullPage: true });
    complete = true;
    await expect(test.locator(".accuracy-chart svg")).toHaveCount(2, {
      timeout: 15000,
    });
    expect(submitted).toBe(1);
    await test.reload();
    await expect(test.locator(".accuracy-chart svg")).toHaveCount(2);
    expect(submitted).toBe(1);
    await test.screenshot({ path: `${folder}/api-result.png`, fullPage: true });
    await test.route("**/jobs/forecast-fixture", (route) =>
      route.fulfill({
        json: {
          job_id: "forecast-fixture",
          job_type: "forecast",
          status: "succeeded",
          progress: 100,
          result: forecast,
        },
      }),
    );
    await test.route("**/datasets/accuracy-fixture/series/*", (route) =>
      route.fulfill({ json: history }),
    );
    await test.goto(
      base + "/forecast/dataset/accuracy-fixture?job=forecast-fixture",
    );
    await expect(test.locator("[data-testid=forecast-error]")).toBeVisible();
    await expect(
      test.getByLabel("Last backtest", { exact: true }),
    ).toBeVisible();
    expect(submitted).toBe(1);
    await live.close();
    const offline = await browser.newPage();
    await offline.route("**/datasets/offline-accuracy", (route) =>
      route.abort(),
    );
    await offline.goto(base + "/accuracy/dataset/offline-accuracy");
    await expect(offline.locator("main [role=alert]")).toContainText(
      "Backend unreachable",
    );
    await offline.screenshot({
      path: `${folder}/backend-unreachable.png`,
      fullPage: true,
    });
    await offline.close();
    for (const mode of ["failed", "mismatch", "wrong-type"]) {
      const guard = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      const report = structuredClone(accuracy);
      if (mode === "mismatch") report.series[0].series_id = "not-in-dataset";
      await guard.route("**/datasets/accuracy-fixture", (route) =>
        route.fulfill({ json: data }),
      );
      await guard.route("**/jobs/guard-job", (route) =>
        route.fulfill({
          json: {
            job_id: "guard-job",
            job_type: mode === "wrong-type" ? "forecast" : "accuracy",
            status: mode === "failed" ? "failed" : "succeeded",
            progress: 100,
            error:
              mode === "failed"
                ? { code: "model_failure", message: "Fixture backtest failed" }
                : null,
            result: mode === "failed" ? null : report,
          },
        }),
      );
      await guard.goto(
        base + "/accuracy/dataset/accuracy-fixture?job=guard-job",
      );
      await expect(guard.locator("main [role=alert]")).toContainText(
        mode === "failed"
          ? "Fixture backtest failed"
          : mode === "mismatch"
            ? "does not match"
            : "invalid accuracy job",
      );
      await expect(guard.locator("[data-testid=accuracy-wape]")).toHaveCount(0);
      await guard.screenshot({
        path: `${folder}/job-${mode}.png`,
        fullPage: true,
      });
      await guard.close();
    }
  }
  console.log(
    "PASS: real accuracy KPIs, per-item charts, CSV/PNG, mobile/dark, missing/invalid data, explicit Run and resumed jobs.",
  );
} finally {
  await browser.close();
}
