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
const validator = (name) =>
  ajv.compile({
    ...contract.components.schemas[name],
    components: contract.components,
  });
const validRequest = validator("ReviewRequest"),
  validNote = validator("AnnotationInput");
const event = (day, delta, extra = {}) => ({
  date: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
  actual: 100 + delta,
  expected_p50: 100,
  expected_p10: 90,
  expected_p90: 110,
  deviation_pct: delta,
  ...extra,
});
const expected = event(7, 2, {
  calendar_events: ["Illustrative festival"],
  recurring_as_expected: true,
});
const review = {
  series: [
    {
      series_id: "A",
      positive_surprises: [
        ...Array.from({ length: 6 }, (_, i) => event(i + 1, (i + 1) * 5)),
        expected,
      ],
      misses: [event(8, -30), event(9, -50), expected],
      actual_total: 9999,
      expected_total: 8888,
      band_coverage: 0.8,
    },
    { series_id: "B", positive_surprises: [], misses: [] },
  ],
};
const dataset = {
  additive: true,
  dataset_id: "review-fixture",
  name: "Demand · year in review",
  frequency: "daily",
  holiday_country: "IN",
  series_count: 3,
  factor_columns: [],
  health: { ready: true, checks: [] },
  series: [
    { series_id: "A", length: 365, status: "ready" },
    { series_id: "B", length: 365, status: "warning" },
    { series_id: "Excluded", length: 8, status: "excluded" },
  ],
};
for (const [name, value] of [
  ["ReviewResult", review],
  ["Dataset", dataset],
]) {
  const check = validator(name);
  assert(check(value), JSON.stringify(check.errors));
}
for (const id of ["retail-mock", "manufacturing-mock"]) {
  const value = JSON.parse(
    await readFile(`public/demo/${id}/review.json`, "utf8"),
  );
  const check = validator("ReviewResult");
  assert(check(value), JSON.stringify(check.errors));
}
await mkdir("screenshots/f7", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [],
  requests = [],
  submissions = [],
  writes = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
page.on("request", (r) => {
  if (new URL(r.url()).port === "4010")
    requests.push({ method: r.method(), url: r.url() });
});
const base = "http://localhost:3000";
const shot = async (name) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `screenshots/f7/${name}.png`,
    fullPage: true,
    caret: "initial",
    animations: "disabled",
  });
};
let phase = "running",
  bad = false,
  offline = false,
  notesOffline = false,
  saveFails = false,
  postFails = false,
  calls = 0;
let annotations = [
  {
    annotation_id: "note-1",
    series_id: "A",
    date: "2026-01-06T00:00:00.000Z",
    text: "Existing note",
  },
];
try {
  await page.goto(`${base}/review`);
  await expect(
    page.getByRole("heading", { name: "Learn from last year’s surprises." }),
  ).toBeVisible();
  await shot("empty");
  for (const name of [
    "Retail sales review demo",
    "Manufacturing review demo",
  ]) {
    await page.goto(`${base}/review`);
    await page.getByRole("link", { name }).click();
    await expect(
      page.getByRole("heading", { name: "What surprised you?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recurring events, as expected" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Add note/ })).toHaveCount(0);
  }
  await shot("demo");
  assert.equal(requests.length, 0, "Saved reviews must stay offline");
  await page.route("**/datasets/review-fixture", (r) =>
    r.fulfill({ json: dataset }),
  );
  await page.route("**/jobs/review", (r) => {
    const body = r.request().postDataJSON();
    assert(validRequest(body), JSON.stringify(validRequest.errors));
    submissions.push(body);
    return postFails
      ? r.fulfill({
          status: 503,
          json: { code: "unavailable", message: "Unavailable" },
        })
      : r.fulfill({
          status: 202,
          json: { job_id: "review-job", job_type: "review", status: "queued" },
        });
  });
  await page.route("**/jobs/review-job", (r) => {
    calls++;
    if (offline) return r.abort("connectionrefused");
    const value = structuredClone(review);
    if (bad) value.series[0].positive_surprises[0].actual = null;
    return r.fulfill({
      json: {
        job_id: "review-job",
        job_type: "review",
        status: phase,
        progress: phase === "succeeded" ? 100 : 35,
        message:
          phase === "running" ? "Replaying historical origins" : undefined,
        error:
          phase === "failed"
            ? { code: "failed", message: "Replay failed on the server." }
            : null,
        result: phase === "succeeded" ? value : null,
      },
    });
  });
  await page.route("**/datasets/review-fixture/annotations", (r) => {
    if (r.request().method() === "GET")
      return notesOffline
        ? r.abort("connectionrefused")
        : r.fulfill({ json: annotations });
    const body = r.request().postDataJSON();
    assert(validNote(body), JSON.stringify(validNote.errors));
    writes.push(body);
    if (saveFails)
      return r.fulfill({
        status: 500,
        json: { code: "save_failed", message: "Storage unavailable" },
      });
    const saved = { ...body, annotation_id: `note-${Date.parse(body.date)}` };
    annotations = [
      ...annotations.filter(
        (a) =>
          a.series_id !== body.series_id ||
          Date.parse(a.date) !== Date.parse(body.date),
      ),
      saved,
    ];
    return r.fulfill({ status: 201, json: saved });
  });
  await page.goto(`${base}/review/dataset/review-fixture`);
  await expect(
    page.getByRole("heading", { name: "Look back with perspective." }),
  ).toBeVisible();
  assert.equal(submissions.length, 0);
  await expect(
    page.getByRole("button", { name: "Run review", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /Excluded/ })).toBeDisabled();
  await page.getByRole("checkbox", { name: "A ready", exact: true }).check();
  await page.getByRole("checkbox", { name: "B warning", exact: true }).check();
  await page.getByLabel("Lookback periods", { exact: true }).fill("-1");
  await expect(
    page.getByRole("button", { name: "Run review", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Lookback periods", { exact: true }).fill("90");
  await page.getByLabel("Origin spacing", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Run review", exact: true }).click();
  await expect(
    page.getByText(/running · Replaying historical origins/),
  ).toBeVisible();
  await shot("progress");
  assert.deepEqual(submissions[0], {
    dataset_id: "review-fixture",
    series_ids: ["A", "B"],
    top_n: 5,
    lookback_periods: 90,
    step: 7,
  });
  await page.getByRole("button", { name: "Pause review polling" }).click();
  await expect(page.getByText(/^Polling paused/)).toBeVisible();
  const pausedCalls = calls;
  await page.waitForTimeout(1200);
  assert.equal(calls, pausedCalls);
  phase = "succeeded";
  await page.getByRole("button", { name: "Resume review polling" }).click();
  await expect(
    page.getByRole("heading", { name: "What surprised you?" }),
  ).toBeVisible();
  const positives = page.getByRole("region", {
      name: "Biggest positive surprises",
      exact: true,
    }),
    expectedRegion = page.getByRole("region", {
      name: "Recurring events, as expected",
      exact: true,
    });
  await expect(positives.locator("article")).toHaveCount(5);
  await expect(positives.locator("article h4").first()).toContainText(
    "2026-01-06",
  );
  await expect(expectedRegion.locator("article")).toHaveCount(1);
  await expect(positives).not.toContainText("Illustrative festival");
  await expect(page.getByText("9,999", { exact: true })).toBeVisible();
  await expect(page.getByText("8,888", { exact: true })).toBeVisible();
  await expect(page.getByText("Existing note", { exact: true })).toBeVisible();
  await shot("desktop");
  const edit = page.getByRole("button", { name: /Edit note for 2026-01-06/ });
  await edit.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("What happened?", { exact: true })).toHaveValue(
    "Existing note",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  await page
    .getByLabel("What happened?", { exact: true })
    .fill("A stock correction explained the spike.");
  await shot("annotation-dialog");
  saveFails = true;
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your note is still here.",
  );
  await expect(page.getByLabel("What happened?", { exact: true })).toHaveValue(
    "A stock correction explained the spike.",
  );
  await shot("annotation-error");
  saveFails = false;
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Note saved.", { exact: true })).toBeVisible();
  assert.deepEqual(writes.at(-1), {
    series_id: "A",
    date: "2026-01-06T00:00:00Z",
    text: "A stock correction explained the spike.",
  });
  await page.getByRole("button", { name: /Add note for 2026-01-05/ }).click();
  await expect(
    page.getByRole("button", { name: "Save note", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("What happened?", { exact: true })
    .fill("No known event; investigating.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("No known event; investigating.", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all review events" }).click();
  const csv = await readFile(await (await downloadPromise).path(), "utf8");
  assert(csv.includes("A stock correction explained the spike."));
  assert(csv.includes('"expected"'));
  assert.equal(csv.trim().split(/\r?\n/).length, 9);
  await page
    .getByRole("combobox", { name: "Review series", exact: true })
    .selectOption("B");
  await expect(
    page.getByText("No positive surprises returned.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Not supplied", { exact: true })).toHaveCount(3);
  await shot("empty-series");
  await page
    .getByRole("combobox", { name: "Review series", exact: true })
    .selectOption("A");
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
  await page.reload();
  await expect(
    page.getByText("A stock correction explained the spike.", { exact: true }),
  ).toBeVisible();
  assert.equal(submissions.length, 1, "Reload must not submit a review");
  notesOffline = true;
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry notes" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /(?:Add|Edit) note/ }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "What surprised you?" }),
  ).toBeVisible();
  await shot("notes-unreachable");
  notesOffline = false;
  await page.getByRole("button", { name: "Retry notes" }).click();
  await expect(
    page.getByText("A stock correction explained the spike.", { exact: true }),
  ).toBeVisible();
  phase = "failed";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review failed", exact: true }),
  ).toBeVisible();
  await shot("failed");
  phase = "succeeded";
  bad = true;
  await page.reload();
  await expect(
    page.getByText(/completed job has an invalid review/),
  ).toBeVisible();
  await shot("invalid");
  bad = false;
  offline = true;
  await page.reload();
  await expect(page.getByText(/Backend unreachable/)).toBeVisible();
  await shot("backend-unreachable");
  offline = false;
  await page.getByRole("button", { name: "Retry review status" }).click();
  await expect(
    page.getByRole("heading", { name: "What surprised you?" }),
  ).toBeVisible();
  await page.goto(`${base}/review/dataset/review-fixture`);
  postFails = true;
  await page.getByRole("checkbox", { name: "A ready", exact: true }).check();
  await page.getByRole("button", { name: "Run review", exact: true }).click();
  await expect(page.getByText(/Review request rejected/)).toBeVisible();
  await shot("submission-error");
  assert.deepEqual(errors, []);
  console.log(
    "F7 passed: contract demos and payloads, Run-only replay, polling/pause/reload, top-five ranking, expected-event separation, totals, annotation create/update/error/persistence, exports, independent notes failure, job failures and 390px themes.",
  );
} finally {
  await browser.close();
}
