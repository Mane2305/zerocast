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
const fixture = {
  name: "deployment-checkpoint",
  parameters: 123456,
  max_context: 1024,
  block_size: 32,
  license: "Test fixture licence",
  quantile_levels: [0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99],
  revision: "a".repeat(64),
  device: "cpu",
  num_samples: 100,
  latency_ms: { p50: 125.5, p95: 9999, count: 12 },
};
const statusFixture = {
  status: "ok",
  model_loaded: true,
  device: "cpu",
  version: "fixture-version",
};
for (const [name, value] of [
  ["ModelInfo", fixture],
  ["Health", statusFixture],
]) {
  const validate = ajv.compile({
    ...contract.components.schemas[name],
    components: contract.components,
  });
  assert(validate(value), JSON.stringify(validate.errors));
}
await mkdir("screenshots/f9", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [],
  requests = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
page.on("request", (r) => {
  if (new URL(r.url()).port === "4010")
    requests.push({ url: r.url(), method: r.method() });
});
const base = "http://localhost:3000";
const shot = async (name) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `screenshots/f9/${name}.png`,
    fullPage: true,
    caret: "initial",
    animations: "disabled",
  });
};
let model = structuredClone(fixture),
  health = structuredClone(statusFixture),
  offline = false,
  healthOffline = false,
  bad = false,
  httpError = false,
  jsonError = false,
  release;
const refresh = () =>
  page.getByRole("button", { name: "Refresh deployment", exact: true }).click();
try {
  await page.goto(base);
  await page.getByRole("link", { name: "Under the hood", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This deployment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Loading model details…", { exact: true }),
  ).toHaveCount(0);
  await shot("prism");
  await page.route("**/model/info", (r) => {
    if (offline) return r.abort("connectionrefused");
    if (httpError)
      return r.fulfill({
        status: 503,
        json: { code: "unavailable", message: "Unavailable" },
      });
    if (jsonError)
      return r.fulfill({ contentType: "application/json", body: "not JSON" });
    return r.fulfill({
      json: bad ? { ...model, parameters: "invalid" } : model,
    });
  });
  await page.route("**/health", (r) =>
    healthOffline ? r.abort("connectionrefused") : r.fulfill({ json: health }),
  );
  await page.reload();
  await expect(page.getByTestId("model-latency")).toHaveText("125.5 ms");
  const expectedParameters = await page.evaluate(
    (value) =>
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      ),
    fixture.parameters,
  );
  await expect(page.locator(".model-metadata")).toContainText(
    expectedParameters,
  );
  await expect(page.locator(".model-metadata")).toContainText("1,024 points");
  await expect(
    page.getByText("API reports the model is loaded.", { exact: true }),
  ).toBeVisible();
  assert(
    !/P95|P99|9,999/.test(await page.locator("main").innerText()),
    "Outside-range labels/tail latency must not appear",
  );
  await shot("desktop");
  await expect(
    page.getByRole("link", { name: /Research discussion · issue #15/ }),
  ).toHaveAttribute("href", "https://github.com/birla-ai-labs/yug/issues/15");
  await expect(
    page.getByRole("link", { name: /CC BY-NC 4.0/ }),
  ).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nc/4.0/");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await shot("mobile-dark");
  await page
    .getByRole("link", { name: "Read the project research summary →" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Why sales-only comes first." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Historical research results" }),
  ).toContainText("0.103");
  await expect(
    page.getByRole("region", { name: "Historical research results" }),
  ).toContainText("0.238");
  assert(!/P95|P99/.test(await page.locator("main").innerText()));
  await shot("research-mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("link", { name: "← Under the hood" }).click();
  model = { ...fixture, latency_ms: { p50: 0, count: 0 } };
  await refresh();
  await expect(
    page.getByRole("heading", { name: "No measured model calls yet." }),
  ).toBeVisible();
  await expect(page.getByTestId("model-latency")).toHaveCount(0);
  await shot("no-calls");
  model = {
    name: fixture.name,
    parameters: fixture.parameters,
    max_context: fixture.max_context,
    block_size: fixture.block_size,
    license: fixture.license,
    quantile_levels: [],
  };
  health = { status: "degraded", model_loaded: false };
  await refresh();
  await expect(
    page.getByRole("heading", { name: "No latency measurements supplied." }),
  ).toBeVisible();
  await expect(
    page.getByText("API reports degraded status", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("API reports the model is not loaded.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".model-metadata")).toContainText("Not reported");
  await shot("optional-fields");
  model = { ...fixture, latency_ms: { p50: 0, count: 4 } };
  await refresh();
  await expect(page.getByTestId("model-latency")).toHaveText("0 ms");
  bad = true;
  await refresh();
  await expect(
    page.getByText(/model response does not match the API contract/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Phase 1 limits", exact: true }),
  ).toBeVisible();
  await shot("invalid");
  bad = false;
  httpError = true;
  await page.getByRole("button", { name: "Retry model details" }).click();
  await expect(
    page.getByText(/Model details unavailable \(HTTP 503\)/),
  ).toBeVisible();
  httpError = false;
  jsonError = true;
  await page.getByRole("button", { name: "Retry model details" }).click();
  await expect(
    page.getByText("The API returned unreadable JSON.", { exact: true }),
  ).toBeVisible();
  jsonError = false;
  offline = true;
  await page.getByRole("button", { name: "Retry model details" }).click();
  await expect(page.getByText(/Backend unreachable/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Separate terms for weights and code" }),
  ).toBeVisible();
  await shot("backend-unreachable");
  offline = false;
  await page.getByRole("button", { name: "Retry model details" }).click();
  await expect(page.getByTestId("model-latency")).toHaveText("0 ms");
  healthOffline = true;
  await refresh();
  await expect(
    page.getByRole("heading", { name: "Model status unavailable" }),
  ).toBeVisible();
  await expect(page.getByTestId("model-latency")).toHaveText("0 ms");
  await shot("status-unreachable");
  healthOffline = false;
  health = structuredClone(statusFixture);
  await page.getByRole("button", { name: "Retry status" }).click();
  await expect(
    page.getByText("API reports the model is loaded.", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/model/info");
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/model/info", async (r) => {
    await gate;
    await r.fulfill({ json: fixture });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Loading model details…" }),
  ).toBeVisible();
  await shot("loading");
  release();
  await expect(page.getByTestId("model-latency")).toHaveText("125.5 ms");
  assert.equal(
    requests.filter((r) => r.method !== "GET").length,
    0,
    "Under the hood must never submit jobs",
  );
  assert(
    requests.every((r) =>
      /\/(health|model\/info)$/.test(new URL(r.url).pathname),
    ),
    "Only metadata and health endpoints may be read",
  );
  assert.deepEqual(errors, []);
  console.log(
    "F9 passed: real Prism response, validated model/health fixtures, distinct reference and deployment data, latency empty/missing/zero states, independent failures/retry, no inference, attribution/research links and 390px themes.",
  );
} finally {
  await browser.close();
}
