import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.VERIFY_URL || "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      "zerocast-planning:retail",
      JSON.stringify({ selected: "MUGS & CUPS", level: 70 }),
    );
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrat|server rendered|didn't match/i.test(message.text())
    )
      errors.push(message.text());
  });
  // Exercise a layout-warmed cache, direct loads, and reloads with saved preferences.
  await page.goto(base + "/portfolio/demo/retail");
  await expect(page.locator(".portfolio-table")).toBeVisible();
  await page.getByRole("link", { name: "Forecast", exact: true }).click();
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.reload();
    await expect(page.locator(".forecast-chart svg")).toBeVisible();
    await expect(page.locator(".forecast-context .lede")).toContainText(
      "MUGS & CUPS",
    );
  }
  await page.goto(base + "/forecast/manufacturing");
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  await page.reload();
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  expect(errors).toEqual([]);
  await mkdir("screenshots/hydration", { recursive: true });
  await page.goto(base + "/forecast/retail");
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  await page.screenshot({
    path: "screenshots/hydration/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  await page.screenshot({
    path: "screenshots/hydration/mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS: shared-cache navigation, repeated direct hydration, saved preferences, retail/manufacturing and mobile; no hydration errors.",
  );
} finally {
  await browser.close();
}
