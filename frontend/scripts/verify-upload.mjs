import { chooseOption } from "./lib/choose-option.mjs";
import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const expect = baseExpect.configure({ timeout: 90_000 });
await mkdir("test-fixtures", { recursive: true });
await mkdir("screenshots/f3", { recursive: true });
const dates = Array.from({ length: 40 }, (_, i) =>
  new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
);
const csv =
  "date,series_id,target,promo\n" +
  dates.map((d, i) => `${d},001,${i === 0 ? "" : i + 10},2`).join("\n");
await writeFile("test-fixtures/valid.csv", csv);
await writeFile(
  "test-fixtures/duplicate.csv",
  csv + "\n2026-01-01,001,3,4\n2026-01-02,001,3,4",
);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.aoa_to_sheet([
    ["date", "series_id", "target"],
    ...dates.map((d, i) => [new Date(`${d}T00:00:00Z`), "001", i + 10]),
  ]),
  "Sales",
);
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.aoa_to_sheet([
    ["date", "series_id", "target"],
    ...dates.map((d, i) => [d, "plant_02", i + 30]),
  ]),
  "Plant",
);
XLSX.writeFile(workbook, "test-fixtures/workbook.xlsx");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
await page.addInitScript(() => {
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (body instanceof Blob)
      body.text().then((text) => {
        window.__uploadChecks = {
          parquet: text.includes("PAR1"),
          country: text.includes('name="holiday_country"'),
          name: text.includes("Upload smoke test"),
        };
      });
    return send.call(this, body);
  };
});
const errors = [];
const uploads = [];
page.on("pageerror", (error) => {
  errors.push(error.message);
  console.error(error.message);
});
page.on("console", (message) => {
  if (message.type() === "error") console.error(message.text());
});
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/datasets"
  )
    uploads.push(request);
});
const shot = (name) =>
  page.screenshot({
    path: `screenshots/f3/${name}.png`,
    fullPage: true,
    caret: "initial",
  });
const check = async (path) => {
  await page.getByLabel("Choose data file").setInputFiles(path);
  await page
    .getByRole("button", { name: "Run file check", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirm your columns" }),
  ).toBeVisible();
};
const convert = async () => {
  await page
    .getByRole("button", { name: "Run conversion", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review & upload" }),
  ).toBeVisible();
};
try {
  await page.goto("http://localhost:3000/upload");
  await shot("empty-desktop");
  await page
    .getByLabel("Choose data file")
    .setInputFiles("test-fixtures/valid.csv");
  assert.equal(uploads.length, 0);
  await page
    .getByRole("button", { name: "Run file check", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await shot("checking");
  await expect(
    page.getByRole("heading", { name: "Confirm your columns" }),
  ).toBeVisible();
  await expect(page.getByLabel("Date column", { exact: true })).toHaveValue(
    "date",
  );
  await expect(page.getByLabel("Item ID column", { exact: true })).toHaveValue(
    "series_id",
  );
  await page
    .getByRole("group", { name: "driver columns" })
    .getByRole("checkbox", { name: "promo", exact: true })
    .check();
  await shot("mapping-desktop");
  await convert();
  const review = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Review & upload" }) });
  await expect(review.locator("tbody tr").first()).toContainText("001");
  await expect(review.locator("tbody tr").first()).toContainText("blank");
  await expect(review.locator("tbody tr").first()).toContainText("2026-01-01");
  assert.equal(uploads.length, 0, "Raw file/conversion must not upload data");
  await shot("prepared-desktop");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download Parquet", exact: true })
    .click();
  const download = await downloadEvent;
  await download.saveAs("test-fixtures/prepared.parquet");
  const parquet = await readFile("test-fixtures/prepared.parquet");
  assert.equal(parquet.subarray(0, 4).toString(), "PAR1");
  assert.equal(parquet.subarray(-4).toString(), "PAR1");
  await page
    .getByLabel("Dataset name", { exact: true })
    .fill("Upload smoke test");
  await chooseOption(page, "Holiday calendar (optional)", "IN");
  await page.getByRole("button", { name: "Upload prepared file" }).click();
  await expect(
    page.getByRole("heading", { name: "Dataset accepted" }),
  ).toBeVisible();
  assert.equal(uploads.length, 1);
  assert(uploads[0].url().endsWith("/datasets"));
  assert.deepEqual(await page.evaluate(() => window.__uploadChecks), {
    parquet: true,
    country: true,
    name: true,
  });
  await shot("accepted");
  if (process.argv.includes("--smoke")) {
    console.log("CSV → Parquet → actual Prism upload passed.");
  } else {
    await check("test-fixtures/prepared.parquet");
    await convert();
    await expect(review.locator("tbody tr").first()).toContainText("001");
    await expect(review.locator("tbody tr").first()).toContainText("blank");
    await check("test-fixtures/duplicate.csv");
    await page
      .getByRole("button", { name: "Run conversion", exact: true })
      .click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "2 extra rows share a date and series",
    );
    await shot("duplicate-error");
    await chooseOption(page, "Rows sharing a period and item", "sum");
    await page
      .getByRole("group", { name: "driver columns" })
      .getByRole("checkbox", { name: "promo", exact: true })
      .check();
    await convert();
    await expect(review.locator("tbody tr").first()).toContainText("blank");
    await expect(
      review.locator("tbody tr").nth(1).locator("td").nth(2),
    ).toHaveText("14");
    await expect(
      review.locator("tbody tr").nth(1).locator("td").nth(3),
    ).toHaveText("3");
    for (const [name, content, message] of [
      [
        "bad-date.csv",
        csv.replace("2026-01-02", "2026-02-30"),
        "invalid dates",
      ],
      [
        "bad-number.csv",
        csv.replace("001,11,2", "001,NaN,2"),
        "not finite numbers",
      ],
      ["blank-id.csv", csv.replace("001,11,2", ",11,2"), "blank series ID"],
      ["short.csv", "date,series_id,target\n2026-01-01,001,3", "fewer than 30"],
    ]) {
      await writeFile(`test-fixtures/${name}`, content);
      await check(`test-fixtures/${name}`);
      await page
        .getByRole("button", { name: "Run conversion", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        message,
      );
    }
    await page.getByLabel("Choose data file").setInputFiles({
      name: "bad.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Choose a CSV",
    );
    await page.getByLabel("Choose data file").setInputFiles({
      name: "empty.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(0),
    });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "file is empty",
    );
    await writeFile(
      "test-fixtures/hourly.csv",
      "date,series_id,target\n" +
        dates
          .flatMap((d) => [`${d}T00:00:00.123,001,1`, `${d}T12:00:00,001,2`])
          .join("\n"),
    );
    await check("test-fixtures/hourly.csv");
    await chooseOption(page, "Time period", "day");
    await chooseOption(page, "Rows sharing a period and item", "sum");
    await convert();
    await expect(
      review.locator("tbody tr").first().locator("td").nth(2),
    ).toHaveText("3");
    await check("test-fixtures/workbook.xlsx");
    await convert();
    await expect(review.locator("tbody tr").first()).toContainText(
      "2026-01-01",
    );
    await chooseOption(page, "Worksheet", "Plant");
    await expect(
      page.getByRole("button", { name: "Run conversion", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Run sheet check" }).click();
    await expect(
      page.getByRole("heading", { name: "Confirm your columns" }),
    ).toBeVisible();
    await convert();
    await expect(review).toContainText("plant_02");
    await shot("excel-prepared");
    await page.route("**/datasets", (route) =>
      route.abort("connectionrefused"),
    );
    await page.getByRole("button", { name: "Upload prepared file" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Backend unreachable",
    );
    await expect(
      page.getByRole("link", { name: "Download Parquet", exact: true }),
    ).toBeVisible();
    await shot("backend-unreachable");
    await page.unroute("**/datasets");
    await page.route("**/datasets", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "invalid_columns",
          message: "The server rejected this dataset. Check its columns.",
        }),
      }),
    );
    await page.getByRole("button", { name: "Upload prepared file" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "server rejected this dataset",
    );
    await page.unroute("**/datasets");
    await page.route("**/datasets", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "not valid JSON",
      }),
    );
    await page.getByRole("button", { name: "Upload prepared file" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "unreadable response",
    );
    await page.unroute("**/datasets");
    await page.route("**/datasets", (route) => route.fulfill({ status: 204 }));
    await page.getByRole("button", { name: "Upload prepared file" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "unexpected response",
    );
    await page.unroute("**/datasets");
    await page.route("**/datasets", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue().catch(() => undefined);
    });
    await page.getByRole("button", { name: "Upload prepared file" }).click();
    await expect(page.getByLabel(/Uploading|Transferred/)).toBeVisible();
    await shot("upload-progress");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText(/Upload cancelled/)).toBeVisible();
    await page.unroute("**/datasets");
    await page.getByRole("button", { name: "Upload prepared file" }).click();
    await expect(
      page.getByRole("heading", { name: "Dataset accepted" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("mobile-prepared");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await shot("mobile-dark");
    if (process.argv.includes("--large")) {
      await page.setViewportSize({ width: 1440, height: 1050 });
      const block = dates
        .map((d) => `${d},001,1,${"x".repeat(110)}\n`)
        .join("");
      const repeats = Math.ceil(100_000_000 / Buffer.byteLength(block));
      await writeFile(
        "test-fixtures/100mb.csv",
        "date,series_id,target,notes\n" + block.repeat(repeats),
      );
      const bytes = (await stat("test-fixtures/100mb.csv")).size;
      assert(bytes >= 100_000_000);
      const start = Date.now();
      await check("test-fixtures/100mb.csv");
      await chooseOption(page, "Rows sharing a period and item", "sum");
      await convert();
      await expect(
        review.locator("tbody tr").first().locator("td").nth(2),
      ).toHaveText(String(repeats));
      await page.getByRole("button", { name: "Upload prepared file" }).click();
      await expect(
        page.getByRole("heading", { name: "Dataset accepted" }),
      ).toBeVisible();
      await shot("100mb-complete");
      const result = {
        inputBytes: bytes,
        inputRows: repeats * 40,
        outputRows: 40,
        elapsedMs: Date.now() - start,
        result:
          "Local inspection, aggregation, Parquet conversion and Prism upload passed",
      };
      await writeFile(
        "screenshots/f3/100mb-result.json",
        JSON.stringify(result, null, 2),
      );
      console.log(result);
    }
    console.log(
      "CSV, Excel sheets, Parquet roundtrip, aggregation, invalid data, API errors, cancel/retry, and mobile checks passed.",
    );
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error((await page.locator("body").innerText()).slice(-6000));
  throw error;
} finally {
  await browser.close();
}
