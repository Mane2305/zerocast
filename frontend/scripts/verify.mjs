import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = "http://localhost:3000";
const routes = [
  "/",
  "/data",
  "/upload",
  "/forecast/retail",
  "/portfolio/demo/retail",
  "/accuracy/demo/retail",
  "/review/demo/retail",
  "/factors/demo",
  "/data-health/demo/retail",
  "/under-the-hood",
  "/under-the-hood/research",
];
const widths = [320, 360, 768, 1280, 1920, 2560];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  const overflow = [];
  for (const route of routes) {
    await page.goto(`${base}${route}`);
    await page.locator("main").waitFor();
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      await page.waitForTimeout(150);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await page.waitForTimeout(50);
        const dimensions = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        if (dimensions.scroll > dimensions.client)
          overflow.push(
            `${colorScheme} ${width}px ${route}: ${dimensions.scroll}px document width`,
          );
      }
    }
  }
  assert.deepEqual(overflow, [], "Routes should not overflow the viewport");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/data`);
  await page.context().setOffline(true);
  await page.locator(".offline-banner").waitFor({ state: "visible" });
  await page.context().setOffline(false);
  await page.locator(".offline-banner").waitFor({ state: "hidden" });

  const wasDark = await page.locator("html").evaluate((el) =>
    el.classList.contains("dark"),
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.waitForFunction(
    (initial) => document.documentElement.classList.contains("dark") !== initial,
    wasDark,
  );
  const chosenTheme = await page.locator("html").getAttribute("class");
  await page.reload();
  await page.waitForFunction(
    (expected) => document.documentElement.className === expected,
    chosenTheme,
  );

  assert.deepEqual(errors, [], "Routes should not raise browser errors");
  console.log(
    `Verified ${routes.length * widths.length * 2} route, theme, and viewport combinations; offline recovery; and theme persistence.`,
  );
} finally {
  await browser.close();
}
