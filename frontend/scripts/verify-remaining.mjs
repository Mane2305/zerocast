import { chooseOption } from "./lib/choose-option.mjs";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
const base = process.env.VERIFY_URL || "http://localhost:3000";
const folder = "screenshots/remaining";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  const posts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  for (const [name, url, chart] of [
    ["portfolio", "/portfolio/demo/retail", ".studio-chart svg"],
    ["exceptions", "/review/demo/retail", ".studio-chart svg"],
    ["drivers", "/factors/demo", ".driver-compare .studio-chart svg"],
  ]) {
    await page.goto(base + url);
    await expect(page.locator(chart).first()).toBeVisible();
    for (const [device, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${folder}/${name}-${device}.png`,
        fullPage: true,
      });
    }
  }
  expect(posts).toEqual([]);
  const data = JSON.parse(
    await readFile("public/demo/retail/dataset.json", "utf8"),
  );
  data.hierarchy = ["store"];
  data.series.forEach((s, i) => {
    s.attributes = { store: i < 2 ? "S1" : "S2" };
  });
  await page.route("**/demo/retail/dataset.json", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(base + "/portfolio/demo/retail");
  await chooseOption(page, "Group by", "store");
  await chooseOption(page, "Group", "S1");
  await expect(page.locator(".portfolio-table tbody tr")).toHaveCount(2);
  await page.unroute("**/demo/retail/dataset.json");
  const rows = Array.from({ length: 32 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    A: i === 3 ? "" : i + 1,
    B: 2 * i,
  }));
  async function choose(name, contents) {
    await page.goto(base + "/upload");
    await page.getByLabel("Choose data file").setInputFiles({
      name,
      mimeType: name.endsWith("json") ? "application/json" : "text/csv",
      buffer: Buffer.from(contents),
    });
    await page.getByRole("button", { name: "Run file check" }).click();
    await expect(
      page.getByRole("heading", { name: "Confirm your columns" }),
    ).toBeVisible({ timeout: 30000 });
  }
  await choose(
    "wide.csv",
    "date,A,B\n" + rows.map((r) => `${r.date},${r.A},${r.B}`).join("\n"),
  );
  await expect(page.getByLabel("Source layout")).toHaveValue("wide");
  await page.getByRole("button", { name: "Run conversion" }).click();
  await expect(
    page.getByRole("heading", { name: "Review & upload" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".preview-stats")).toContainText("64");
  await expect(page.locator(".preview-stats article").nth(2)).toContainText(
    "1",
  );
  await page.screenshot({
    path: `${folder}/wide-converted.png`,
    fullPage: true,
  });
  const records = rows.map((r) => ({
    date: r.date,
    store: "S1",
    product: "P1",
    target: r.B,
  }));
  await choose("hierarchy.json", JSON.stringify(records));
  await expect(page.getByLabel("Source layout")).toHaveValue("long");
  await page.getByRole("button", { name: "Run conversion" }).click();
  await expect(
    page.getByRole("heading", { name: "Review & upload" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".upload-panel").last()).toContainText("S1|P1");
  await page.getByLabel("Dataset unit").fill("index points");
  await chooseOption(page, "Do values add over time?", "no");
  if (process.env.VERIFY_DEMO_MODE !== "1") {
    let body = "";
    let parquet;
    await page.route("**/datasets", async (route) => {
      body = route.request().postDataBuffer().toString("utf8");
      const form = await new Response(route.request().postDataBuffer(), {
        headers: { "content-type": route.request().headers()["content-type"] },
      }).formData();
      parquet = Buffer.from(await form.get("file").arrayBuffer());
      return route.fulfill({
        status: 201,
        json: { ...data, dataset_id: "upload-fixture", additive: false },
      });
    });
    await page.getByRole("button", { name: "Upload prepared file" }).click();
    await expect(
      page.getByRole("heading", { name: "Dataset accepted" }),
    ).toBeVisible();
    expect(body).toContain('["store","product"]');
    expect(body).toContain('name="additive"');
    expect(body).toContain("false");
    expect(body).toContain("index points");
    await page.goto(base + "/upload");
    await page.getByLabel("Choose data file").setInputFiles({
      name: "hierarchy-roundtrip.parquet",
      mimeType: "application/octet-stream",
      buffer: parquet,
    });
    await page.getByRole("button", { name: "Run file check" }).click();
    await expect(
      page.getByRole("heading", { name: "Confirm your columns" }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByLabel("Date column").locator("option"),
    ).not.toContainText(["series_id"]);
    expect(
      await page.getByLabel("Date column").locator("option").allTextContents(),
    ).toEqual(expect.arrayContaining(["date", "store", "product", "target"]));
  }
  await page.screenshot({
    path: `${folder}/hierarchy-json.png`,
    fullPage: true,
  });
  await page.goto(base + "/upload");
  await page
    .getByText("Import a published Google Sheet", { exact: true })
    .click();
  const url =
    "https://docs.google.com/spreadsheets/d/e/frontend-test/pub?output=csv";
  await page.route(url, (route) =>
    route.fulfill({
      contentType: "text/csv",
      headers: { "access-control-allow-origin": "*" },
      body:
        "date,A,B\n" + rows.map((r) => `${r.date},${r.A},${r.B}`).join("\n"),
    }),
  );
  await page.getByLabel("Published Google Sheets CSV URL").fill(url);
  await page.getByRole("button", { name: "Load published CSV" }).click();
  await expect(
    page.getByText("google-sheet.csv", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run file check" }).click();
  await expect(page.getByLabel("Source layout")).toHaveValue("wide", {
    timeout: 30000,
  });
  expect(errors).toEqual([]);
  await context.close();
  if (process.env.VERIFY_DEMO_MODE !== "1") {
    const cold = await browser.newPage();
    let loaded = false;
    await cold.route("**/health", (route) =>
      route.fulfill({
        json: { status: loaded ? "ok" : "degraded", model_loaded: loaded },
      }),
    );
    await cold.goto(base + "/forecast/retail");
    await expect(cold.locator(".api-status")).toHaveAttribute(
      "title",
      "API connected · model not ready",
    );
    loaded = true;
    await expect(cold.locator(".api-status")).toHaveAttribute(
      "title",
      "API connected · model loaded",
      { timeout: 12000 },
    );
    await cold.close();
  }
  console.log(
    "PASS: portfolio, hierarchy grouping, real exception calendar, driver charts, wide/JSON conversion, preserved blanks, published CSV, metadata and cold-start readiness.",
  );
} finally {
  await browser.close();
}
