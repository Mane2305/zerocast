import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
const folder = "screenshots/decision-studio";
if (existsSync(`${folder}/before-forecast-desktop.png`))
  throw new Error("Baseline already captured");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  for (const [name, url, ready] of [
    ["forecast", "/forecast/retail", ".forecast-chart svg"],
    ["portfolio", "/portfolio/demo/retail", ".portfolio-table tbody tr"],
    ["data", "/data-health/demo/retail", ".health-stats"],
  ]) {
    await page.goto(`http://localhost:3000${url}`);
    await expect(page.locator(ready).first()).toBeVisible();
    for (const [device, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);
      await page.screenshot({
        path: `${folder}/before-${name}-${device}.png`,
        fullPage: true,
      });
    }
  }
} finally {
  await browser.close();
}
