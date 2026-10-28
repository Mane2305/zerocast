import { chromium, expect as baseExpect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const expect = baseExpect.configure({ timeout: 20000 });
const base = "http://localhost:3000";
const files = {};
for (const id of ["retail", "manufacturing"]) {
  files[id] = {};
  for (const file of ["dataset", "history", "forecast", "review"])
    files[id][file] = JSON.parse(
      await readFile(`public/demo/${id}/${file}.json`, "utf8"),
    );
}
await mkdir("screenshots/i1-real", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const errors = [],
  apiRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (["8000", "4010"].includes(new URL(r.url()).port))
    apiRequests.push(r.url());
});
const shot = async (name) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `screenshots/i1-real/${name}.png`,
    fullPage: true,
  });
};
try {
  await page.goto(base);
  await expect(
    page.getByRole("link", { name: "Open retail demo" }),
  ).toHaveAttribute("href", "/forecast/retail");
  await expect(
    page.getByRole("link", { name: "Open manufacturing demo" }),
  ).toHaveAttribute("href", "/forecast/manufacturing");
  assert(!/synthetic/i.test(await page.locator("main").innerText()));
  await shot("home");
  for (const id of ["retail", "manufacturing"]) {
    await page.goto(base);
    await page.getByRole("link", { name: `Open ${id} demo` }).click();
    await expect(page).toHaveURL(`${base}/forecast/${id}`);
    await expect(
      page.getByText("REAL DATA · PRECOMPUTED", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your range of possibilities" }),
    ).toBeVisible();
    await expect(page.locator(".forecast-chart svg")).toBeVisible();
    await expect(page.locator(".forecast-chart")).toContainText(
      id === "retail" ? /2011/ : /2026/,
    );
    const data = files[id],
      series = data.forecast.series[0];
    const number = async (value) =>
      page.evaluate(
        ({ value, country, count }) =>
          new Intl.NumberFormat(country === "IN" ? "en-IN" : undefined, {
            maximumFractionDigits: count ? 0 : 2,
          }).format(value),
        {
          value,
          country: data.dataset.holiday_country,
          count: id === "retail",
        },
      );
    for (const p of [10, 50, 90])
      await expect(page.getByTestId(`total-${p}`)).toHaveText(
        await number(series.total_distribution.percentiles[p]),
      );
    await expect(page.getByTestId("plan-value")).toHaveText(
      await number(series.total_distribution.percentiles[80]),
    );
    await page.getByLabel("Capacity per step", { exact: true }).fill("100");
    await expect(page.locator(".capacity-list p")).toHaveCount(
      series.dates.length,
    );
    await page.getByText("View forecast values", { exact: true }).click();
    await expect(page.locator(".forecast-values tbody tr")).toHaveCount(
      series.dates.length,
    );
    const text = await page.locator("main").innerText();
    assert(!/synthetic|illustrative|not model predictions/i.test(text));
    assert(!/\d{4}-\d{2}-\d{2}|00:00:00/.test(text));
    await shot(`${id}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await shot(`${id}-mobile`);
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await shot(`${id}-mobile-dark`);
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const route of ["data-health", "portfolio", "review"]) {
      await page.goto(`${base}/${route}/demo/${id}`);
      await expect(
        page.getByRole("heading", { name: data.dataset.name, exact: true }),
      ).toBeVisible();
      if (route === "review") {
        await expect(
          page.getByRole("heading", { name: "What surprised you?" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: /Add note|Edit note/ }),
        ).toHaveCount(0);
      }
      assert(
        !/synthetic|illustrative/i.test(await page.locator("main").innerText()),
      );
      await shot(`${id}-${route}`);
    }
  }
  // Existing saved synthetic links retain their provenance after the switch.
  await page.goto(`${base}/forecast/retail-mock`);
  await expect(page.getByText("SYNTHETIC DEMO", { exact: true })).toBeVisible();
  let release;
  await page.route("**/demo/retail/forecast.json", async (r) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await r.fulfill({ json: files.retail.forecast });
  });
  await page.goto(`${base}/forecast/retail`);
  await expect(
    page.getByRole("heading", { name: "Opening your demo…" }),
  ).toBeVisible();
  await shot("loading");
  while (!release) await page.waitForTimeout(20);
  release();
  await expect(
    page.getByRole("heading", { name: "Your range of possibilities" }),
  ).toBeVisible();
  await page.unroute("**/demo/retail/forecast.json");
  await page.route("**/demo/retail/forecast.json", (r) =>
    r.fulfill({ status: 404 }),
  );
  await page.goto(`${base}/forecast/retail`);
  await expect(
    page.getByRole("heading", { name: "We couldn’t open this demo." }),
  ).toBeVisible();
  await shot("missing");
  await page.unroute("**/demo/retail/forecast.json");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Your range of possibilities" }),
  ).toBeVisible();
  assert.deepEqual(
    apiRequests,
    [],
    "Saved demos must not invoke the backend, jobs, or annotations",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real demo links, correct provenance, exact saved totals/plan, capacity, health/portfolio/read-only review, 390px themes, loading/missing/retry, legacy synthetic URL, no API calls.",
  );
} finally {
  await browser.close();
}
