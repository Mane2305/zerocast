import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
if (existsSync("screenshots/visual-upgrade/before.png"))
  throw new Error(
    "Before screenshots already exist. Do not overwrite the baseline with the upgraded UI.",
  );
await mkdir("screenshots/visual-upgrade", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    locale: "en-US",
  });
  await page.goto("http://localhost:3000/forecast/retail");
  await expect(page.locator(".forecast-chart")).toContainText(/2011/);
  await page.screenshot({
    path: "screenshots/visual-upgrade/before.png",
    fullPage: true,
  });
  await page.screenshot({
    path: "screenshots/visual-upgrade/before-viewport.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "screenshots/visual-upgrade/before-mobile.png",
    fullPage: true,
  });
  console.log("Captured unchanged forecast page before visual upgrade.");
} finally {
  await browser.close();
}
