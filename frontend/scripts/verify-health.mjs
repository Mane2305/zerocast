import { chooseOption } from "./lib/choose-option.mjs";
import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import YAML from "yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const expect = baseExpect.configure({ timeout: 20000 });
const contract = YAML.parse(
  await readFile("../contracts/openapi.yaml", "utf8"),
);
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile({
  ...contract.components.schemas.Dataset,
  components: contract.components,
});
const ids = [
  "missing_dates",
  "duplicates",
  "negative_values",
  "non_finite",
  "too_short",
  "constant_series",
  "irregular_spacing",
  "too_many_factors",
];
const labels = [
  "Missing dates",
  "Duplicates",
  "Negative values",
  "Non-finite values",
  "Too short",
  "Constant series",
  "Irregular spacing",
  "Too many factors",
];
const dataset = {
  additive: true,
  dataset_id: "health-fixture",
  name: "Store demand · quality review",
  frequency: "daily",
  series_count: 3,
  factor_columns: [],
  holiday_country: "IN",
  date_range: { start: "2026-01-01T00:00:00Z", end: "2026-04-10T00:00:00Z" },
  series: [
    {
      series_id: "001",
      length: 100,
      status: "ready",
      missing_count: 0,
      start: "2026-01-01T00:00:00Z",
      end: "2026-04-10T00:00:00Z",
      issues: [],
    },
    {
      series_id: "Store-B",
      length: 60,
      status: "warning",
      missing_count: 6,
      issues: ["missing_dates", "negative_values"],
    },
    {
      series_id: "=SUM(1,1)",
      length: 12,
      status: "excluded",
      issues: ["too_short", "non_finite"],
    },
  ],
  health: {
    ready: true,
    checks: ids.map((id, i) => ({
      id,
      label: labels[i],
      severity: i === 3 || i === 4 ? "error" : "warning",
      count: i === 0 ? 6 : 1,
      ...(i === 0 ? { percent: 3.49, action_taken: "Filled as blanks" } : {}),
      affected_series: [i === 3 || i === 4 ? "=SUM(1,1)" : "Store-B"],
    })),
  },
};
assert(validate(dataset), JSON.stringify(validate.errors));
await mkdir("screenshots/f4", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
const shot = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  // Let resized layouts and theme color transitions finish painting.
  await page.waitForTimeout(300);
  return page.screenshot({
    path: `screenshots/f4/${name}.png`,
    fullPage: true,
    caret: "initial",
    animations: "disabled",
  });
};
const base = "http://localhost:3000";
const api = "**/datasets/*";
async function mock(data, status = 200) {
  await page.unroute(api);
  await page.route(api, (route) => route.fulfill({ status, json: data }));
  await page.goto(`${base}/data-health/health-fixture`);
}
try {
  await page.goto(`${base}/data-health`);
  await expect(
    page.getByRole("heading", { name: "A clear view of your data." }),
  ).toBeVisible();
  await shot("empty");
  await page.getByRole("link", { name: "Retail sales demo health" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to forecast", exact: true }),
  ).toBeVisible();
  await shot("demo");
  // The generated mock server remains the default development API.
  await page.goto(`${base}/data-health/prism-example`);
  await expect(
    page.getByRole("region", { name: "Forecast readiness" }),
  ).toBeVisible();
  await shot("prism");
  await mock(dataset);
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  await expect(
    page.getByText("Missing dates: 6 (3.49%)", { exact: true }),
  ).toBeVisible();
  await shot("desktop");
  for (let i = 0; i < ids.length; i++) {
    await page.getByRole("tab", { name: new RegExp(`^${labels[i]}`) }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody th")).toHaveText(
      dataset.health.checks[i].affected_series[0],
    );
  }
  await page.getByRole("tab", { name: /^Missing dates/ }).click();
  await shot("filtered");
  await page.getByRole("tab", { name: /^All series/ }).click();
  await page.getByRole("tab", { name: /^All series/ }).press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: /^Missing dates/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /^Missing dates/ }).press("Home");
  await page.getByRole("button", { name: /^History points/ }).click();
  await expect(page.locator("tbody th").first()).toHaveText("=SUM(1,1)");
  await chooseOption(page, "Status", "warning");
  await expect(page.locator("tbody th")).toHaveText("Store-B");
  await page.getByLabel("Search series").fill("absent");
  await expect(page.getByText(/No series match this view/)).toBeVisible();
  await page.getByLabel("Search series").fill("");
  await chooseOption(page, "Status", "all");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export visible rows" }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  assert(csv.includes("'=SUM(1,1)"));
  assert(csv.includes('"001"'));
  assert(csv.includes("Store-B"));
  await page
    .getByRole("button", { name: "Dismiss Missing dates notice" })
    .click();
  await expect(
    page.getByText("Missing dates: 6 (3.49%)", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Show dismissed notices/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile page overflow",
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await shot("mobile-dark");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  const optional = {
    ...dataset,
    series: undefined,
    date_range: undefined,
    health: {
      ready: false,
      checks: [
        { id: "too_short", label: "Too short", severity: "error", count: 3 },
      ],
    },
  };
  assert(validate(optional), JSON.stringify(validate.errors));
  await mock(optional);
  await expect(
    page.getByRole("heading", { name: "Not ready to forecast" }),
  ).toBeVisible();
  await expect(
    page.getByText("Series summaries were not supplied by the source."),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Too short/ }).click();
  await expect(
    page.getByText(/This check does not identify affected series/),
  ).toBeVisible();
  await shot("optional-fields");
  await mock({
    ...dataset,
    series_count: 0,
    series: [],
    health: { ready: false, checks: [] },
  });
  await expect(page.getByText(/No series match this view/)).toBeVisible();
  await shot("no-series");
  await mock(
    { code: "not_found", message: "This dataset no longer exists." },
    404,
  );
  await expect(
    page.getByRole("heading", { name: "Dataset not found" }),
  ).toBeVisible();
  await shot("not-found");
  await mock({
    ...dataset,
    health: { ready: true, checks: [{ id: "invented" }] },
  });
  await expect(
    page.getByRole("heading", { name: "Invalid health report" }),
  ).toBeVisible();
  await shot("invalid");
  await page.unroute(api);
  await page.route(api, (route) => route.abort("connectionrefused"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Backend unreachable" }),
  ).toBeVisible();
  await shot("backend-unreachable");
  await page.unroute(api);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(api, async (route) => {
    await gate;
    await route.fulfill({ json: dataset });
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Loading your health report…" }),
  ).toBeVisible();
  await shot("loading");
  release();
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "F4 passed: Prism, contract fixtures, all eight filters, sorting/search/export, optional fields, errors/retry, loading and 390px themes.",
  );
} finally {
  await browser.close();
}
