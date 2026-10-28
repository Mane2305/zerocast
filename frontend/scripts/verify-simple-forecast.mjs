import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const before = process.argv.includes("--before");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const folder = "screenshots/simple-forecast";
await mkdir(folder, { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    (process.env.VERIFY_URL || "http://localhost:3000") + "/forecast/retail",
  );
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  if (!before) {
    await expect(page.locator(".forecast-chart")).toContainText("Past demand");
    await expect(page.locator(".forecast-chart")).toContainText(
      "Forecast range",
    );
    await expect(page.locator(".forecast-chart")).not.toContainText("P30–P70");
    await expect(page.locator(".forecast-chart")).not.toContainText(
      "Backtest forecast",
    );
    await expect(
      page.getByLabel("Last year", { exact: true }),
    ).not.toBeVisible();
  }
  for (const [device, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `${folder}/${before ? "before" : "after"}-${device}.png`,
      fullPage: true,
    });
  }
  if (!before) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByText("Compare", { exact: true }).click();
    await page.getByLabel("Last year", { exact: true }).check();
    await expect(page.locator(".forecast-chart")).toContainText("Last year");
    await page.getByLabel("Last backtest", { exact: true }).check();
    await expect(page.locator(".forecast-chart")).toContainText(
      "Backtest forecast",
    );
    await page.getByLabel(/\d+ possible futures/, { exact: true }).check();
    await expect(page.locator(".forecast-chart")).toContainText(
      "Possible futures",
    );
    await page.screenshot({
      path: `${folder}/comparisons.png`,
      fullPage: true,
    });
    await page.goto(
      (process.env.VERIFY_URL || "http://localhost:3000") +
        "/forecast/manufacturing",
    );
    await expect(page.locator(".forecast-chart svg")).toBeVisible();
    await expect(page.locator(".forecast-chart")).toContainText(
      "Forecast range",
    );
  }
  expect(errors).toEqual([]);
  console.log(
    `PASS: ${before ? "before screenshots" : "simple chart, optional comparisons, retail/manufacturing and responsive layouts"}`,
  );
} finally {
  await browser.close();
}
