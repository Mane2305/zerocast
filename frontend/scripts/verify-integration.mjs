import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const expect = baseExpect.configure({ timeout: 20000 });
const base = "http://localhost:3000";
await mkdir("screenshots/i1", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [],
  apiRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (["8000", "4010"].includes(new URL(r.url()).port))
    apiRequests.push(r.url());
});
const shot = (name) =>
  page.screenshot({ path: `screenshots/i1/${name}.png`, fullPage: true });
const cleanDates = async () => {
  const text = await page.locator("main").innerText();
  assert(!/\d{4}-\d{2}-\d{2}/.test(text), "Raw timestamp in page");
  assert(!text.includes("00:00:00"), "Seconds in period label");
};
try {
  await page.goto(base);
  await page
    .locator("summary")
    .filter({ hasText: "API connection status" })
    .click();
  await expect(
    page.getByText("Not checked yet. No forecast has been run."),
  ).toBeVisible();
  // This first check is the actual configured backend, without interception.
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check connection", exact: true }),
  ).toBeEnabled();
  assert(apiRequests.includes("http://localhost:8000/health"));
  assert(!apiRequests.some((url) => new URL(url).port === "4010"));
  await shot("real-health");

  let response = { status: "ok", model_loaded: false },
    release;
  await page.route("http://localhost:8000/health", async (route) => {
    if (release)
      await new Promise((resolve) => {
        release.resolve = resolve;
      });
    await route.fulfill({ json: response });
  });
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(page.locator(".connection-result")).toContainText(
    "API reports the model is not loaded.",
  );
  await expect(page.locator(".connection-result")).not.toContainText(
    "API reports the model is loaded.",
  );
  await shot("model-not-loaded");
  response = { status: "ok", model_loaded: "false" };
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(
    page.getByText("Connection check failed", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".connection-result")).not.toContainText(
    "API reports the model is loaded.",
  );
  await shot("invalid-health");
  response = { status: "ok", model_loaded: true };
  release = {};
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(page.getByText("Waiting for the API response…")).toBeVisible();
  await shot("health-loading");
  while (!release.resolve) await page.waitForTimeout(20);
  release.resolve();
  release = undefined;
  await expect(page.locator(".connection-result")).toContainText(
    "API reports the model is loaded.",
  );

  for (const [id, period] of [
    ["retail-mock", "6 Feb 2026"],
    ["manufacturing-mock", "Jan 2026"],
  ]) {
    await page.goto(`${base}/forecast/${id}`);
    await expect(
      page.getByRole("heading", { name: "Your range of possibilities" }),
    ).toBeVisible();
    await expect(
      page.locator(".forecast-results > .health-note").first(),
    ).toContainText(period);
    await page.getByText("View forecast values", { exact: true }).click();
    await expect(page.locator(".forecast-values tbody th").first()).toHaveText(
      period,
    );
    await expect(page.locator(".forecast-chart svg")).toBeVisible();
    await expect(page.locator(".forecast-chart")).toContainText(/2026/);
    const chartLabels = await page.locator(".forecast-chart").textContent();
    assert(!/\d{4}-\d{2}-\d{2}/.test(chartLabels));
    if (
      await page.getByLabel("Capacity per step", { exact: true }).isEnabled()
    ) {
      await page.getByLabel("Capacity per step", { exact: true }).fill("100");
      await expect(page.locator(".capacity-list")).toContainText(period);
    }
    await cleanDates();
    await shot(id === "retail-mock" ? "daily-desktop" : "monthly-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await shot(`${id}-mobile`);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(`${base}/data-health/demo/${id}`);
    await expect(
      page.getByText("Detected frequency", { exact: true }),
    ).toBeVisible();
    await cleanDates();
    await page.goto(`${base}/portfolio/demo/${id}`);
    await expect(
      page.getByText("Forecast frequency", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("tbody")).toContainText(period);
    await cleanDates();
    await page.goto(`${base}/review/demo/${id}`);
    await expect(
      page.getByRole("heading", { name: "What surprised you?" }),
    ).toBeVisible();
    await cleanDates();
  }
  // Hourly timestamps must remain distinguishable in the chart and all tables.
  const dataset = JSON.parse(
    await readFile("public/demo/retail-mock/dataset.json", "utf8"),
  );
  dataset.frequency = "hourly";
  const forecast = JSON.parse(
    await readFile("public/demo/retail-mock/forecast.json", "utf8"),
  );
  forecast.series[0].step_exceedance_grid = {
    percentiles: Array.from({ length: 99 }, (_, i) =>
      forecast.series[0].dates.map(() => i + 1),
    ),
  };
  forecast.series[0].dates = forecast.series[0].dates.map(
    (_, i) => `2026-02-06T${String(i + 1).padStart(2, "0")}:00:00Z`,
  );
  await page.route("**/demo/retail-mock/dataset.json", (r) =>
    r.fulfill({ json: dataset }),
  );
  await page.route("**/demo/retail-mock/forecast.json", (r) =>
    r.fulfill({ json: forecast }),
  );
  await page.goto(`${base}/forecast/retail-mock`);
  await expect(
    page.getByRole("heading", { name: "Your range of possibilities" }),
  ).toBeVisible();
  await page.getByText("View forecast values", { exact: true }).click();
  await expect(page.locator(".forecast-values tbody th").first()).toHaveText(
    "6 Feb 2026, 01:00",
  );
  await page.getByLabel("Capacity per step", { exact: true }).fill("50");
  await expect(page.locator(".capacity-list")).toContainText(
    "6 Feb 2026, 01:00",
  );
  await expect(page.locator(".forecast-chart svg")).toBeVisible();
  await expect(page.locator(".forecast-chart")).toContainText(
    /6 Feb 2026, \d{2}:00/,
  );
  await cleanDates();
  await shot("hourly");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real API URL, strict health status, recovery/loading, daily/monthly/hourly labels, all result pages and 390px layouts. Real demo generation remains pending.",
  );
} finally {
  await browser.close();
}
