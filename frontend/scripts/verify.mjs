import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [];
const backendRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (new URL(request.url()).port === "4010")
    backendRequests.push(request.url());
});
const shot = (name) =>
  page.screenshot({ path: `screenshots/f2/${name}.png`, fullPage: true });
const home = async () => {
  await page.goto(base);
  await expect(
    page.getByRole("heading", {
      name: "Good decisions start with your history.",
    }),
  ).toBeVisible();
};
try {
  await home();
  await shot("desktop-connect");
  for (const [label, file] of [
    ["Download template", "zerocast-template.csv"],
    ["Download example", "zerocast-example.csv"],
  ]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("link", { name: label, exact: true }).click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), file);
    const content = await readFile(await download.path(), "utf8");
    assert(content.startsWith("date,series_id,target"));
    if (file.includes("example"))
      assert.equal(content.trim().split(/\r?\n/).length, 37);
  }
  for (const id of ["retail", "manufacturing"]) {
    await home();
    await page.getByRole("link", { name: `Open ${id} demo` }).click();
    await expect(page).toHaveURL(`${base}/forecast/${id}`);
    await expect(
      page.getByRole("heading", { name: "Your range of possibilities" }),
    ).toBeVisible();
    const fixture = JSON.parse(
      await readFile(`public/demo/${id}/forecast.json`, "utf8"),
    );
    assert.equal(
      await page.locator(".forecast-values tbody tr").count(),
      fixture.series[0].dates.length,
    );
    const expected = new Intl.NumberFormat(
      id === "manufacturing" ? "en-IN" : "en-US",
      { maximumFractionDigits: id === "retail" ? 0 : 2 },
    ).format(fixture.series[0].quantiles[4][0]);
    await expect(
      page.locator(".forecast-values tbody tr").first().locator("td").nth(2),
    ).toHaveText(expected);
    await expect(page.locator('nav a[aria-current="page"]')).toHaveText(
      "Forecast",
    );
    await shot(`desktop-${id}`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your range of possibilities" }),
    ).toBeVisible();
  }
  assert.equal(backendRequests.length, 0, "Demos must not request the backend");
  await page.goto(`${base}/forecast`);
  await expect(
    page.getByRole("heading", { name: "Choose a starting point." }),
  ).toBeVisible();
  await shot("forecast-empty");
  await page.goto(`${base}/forecast/unknown`);
  await expect(
    page.getByRole("heading", { name: "Let’s get you back." }),
  ).toBeVisible();
  const filePattern = "**/demo/retail-mock/forecast.json";
  await page.route(filePattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto(`${base}/forecast/retail-mock`);
  await expect(
    page.getByRole("heading", { name: "Opening your demo…" }),
  ).toBeVisible();
  await shot("demo-loading");
  await expect(
    page.getByRole("heading", { name: "Your range of possibilities" }),
  ).toBeVisible();
  await page.unroute(filePattern);
  for (const mode of ["missing", "malformed", "offline", "empty"]) {
    await page.route(filePattern, (route) => {
      if (mode === "missing") return route.fulfill({ status: 404 });
      if (mode === "offline") return route.abort("connectionrefused");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          mode === "empty"
            ? { quantile_levels: [0.1, 0.5, 0.9], series: [] }
            : { series: [{ dates: [] }] },
        ),
      });
    });
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name:
          mode === "empty"
            ? "This demo has no forecast yet."
            : "We couldn’t open this demo.",
      }),
    ).toBeVisible();
    await shot(`demo-${mode}`);
    await page.unroute(filePattern);
    if (mode !== "empty") {
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(
        page.getByRole("heading", { name: "Your range of possibilities" }),
      ).toBeVisible();
    }
  }
  await home();
  await page.getByText("API connection status", { exact: false }).click();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(page.getByText("API reachable", { exact: true })).toBeVisible();
  await page.route("**/health", (route) => route.abort("connectionrefused"));
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(
    page.getByText("Backend unreachable", { exact: true }),
  ).toBeVisible();
  await shot("backend-unreachable");
  await page.getByRole("link", { name: "Open retail demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Your range of possibilities" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("mobile-forecast");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Forecast must fit 390px",
  );
  await home();
  await shot("mobile-connect");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Connect must fit 390px",
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await shot("mobile-dark");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await shot("desktop-dark");
  assert.deepEqual(errors, []);
  console.log(
    "Verified both demos without backend calls, downloads, refresh, unknown route, loading, missing/malformed/offline/empty results, retry, backend down, themes and 390px layouts.",
  );
} finally {
  await browser.close();
}
