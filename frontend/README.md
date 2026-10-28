# Decision Studio v2 — frontend completion pass

F12–F16 frontend work is included: Portfolio bubbles with supplied hierarchy grouping and matching WAPE, an Exceptions heatmap based on full accuracy backtests, real Driver evidence charts, and browser import of long/wide CSV/Excel/Parquet/JSON with multiple ID columns. Published Google Sheets CSV links use a bounded, credential-free browser fetch; private sheets and CORS-blocked exports need a downloaded file. The browser preserves unknown targets, retains hierarchy columns, and sends `id_columns`, `additive` and `unit` through the generated upload client. Preview IDs are derived for checking; hierarchy Parquet sends the original ID columns so the backend constructs the same keys without duplicate `series_id` columns.

Driver charts show only the API's reported best lag, not an invented full lag profile. A complete lag-by-lag chart needs an optional API array of lag/effect evidence. Calendar blanks mean no supplied observed backtest point, not normal demand; holiday marks use only supplied review events. Groups never sum marginal forecast quantiles or fabricate a joint distribution. The endpoint remains environment-configured; cold-start UI tolerates temporary 502/503/504 responses and polls real model readiness without claiming loaded status prematurely. Actual Modal/Vercel deployment and endpoint configuration belong to the owner.

Run `npm run test:remaining`, `npm run verify:remaining`, `npm run verify:v2`, and `npm run verify:accuracy`, then lint/typecheck/build. The completion suite checks real charts, hierarchy grouping, wide and JSON conversion, missing-value preservation, binary Parquet round-tripping, published CSV import, multipart metadata and real-health-shaped readiness transitions. All API uploads/jobs in browser checks are intercepted fixtures. No backend, contract, docs or genuine demo JSON was edited. See `screenshots/remaining/` for desktop/mobile evidence.

The Accuracy module works with both real saved demos and uploaded datasets. It shows supplied pooled WAPE, signed bias, range accuracy and change versus the naive baseline. Per-item charts show promised versus observed coverage and backtest forecast versus actual, with exact source values in expandable tables. Choose a table item or chart selector; filter/sort and export CSV, or export either chart to PNG. Missing benchmarks stay unavailable and missing actuals stay gaps.

For uploaded data, choose up to 20 eligible items, a horizon of 1–256 periods and 1–52 backtest origins, then click **Run accuracy**. No job starts on navigation. Progress, pause/resume status checks, failures and retries are explicit. The accepted job ID stays in the URL and per-dataset browser preferences. Forecasts reuse only that same dataset's accepted accuracy job, for a matching item and horizon. Screenshots: `screenshots/accuracy/`. Verify with `npm run verify:accuracy` and `npm run test:accuracy`; browser job tests use contract-shaped fixtures, not real model jobs.

The app opens directly at the saved retail forecast. The sidebar uses v2 business vocabulary, compact controls and KPI tiles. Forecasts include Low/Base/High cases, capacity probability bars, chart PNG/CSV exports, and a 390px layout with collapsible controls. Press `/` to find an item. Planning choices persist per dataset, with an in-memory fallback if storage is blocked.

Missing accuracy tiles are hidden. The dedicated Accuracy page is implemented in F11. Refreshed demo `accuracy.json` supplies the forecast's WAPE and range accuracy tiles and its last-backtest overlay; genuine supplied paths appear behind the ranges. Exception markers identify actuals outside the backtest's P10–P90 range. Null actuals remain gaps. No accuracy job starts automatically. The generated client follows the current v0.2 contract. This frontend commit includes the real JSON produced by backend task B12, unchanged; no model values were fabricated and no backend, contract or docs files were edited.

## Verify v2

Run `npm run dev`, then `npm run verify:v2` (Edge). It checks JSON-derived quantities, service limits, PNG bytes, capacity bars, item search, saved settings, desktop/mobile layout, dark mode, failures, and an explicit Run flow with browser-only API fixtures. Run `npm run lint`, `npm run typecheck`, and `npm run build`. Screenshots are in `screenshots/decision-studio/`: before/after Forecast, Portfolio and Data quality at 1440px and 390px, plus the new Data sources page and dark/error states. Main screenshots use the real saved demos; the separately labelled API workspace uses test fixtures.

## Vercel handoff — S4 belongs to the owner

Import the repo with root directory `frontend/` and the Next.js preset. `vercel.json` selects `npm ci` and `npm run build`. Leave `NEXT_PUBLIC_API_URL` unset for demo mode: no health polls or model jobs are sent, and upload is disabled while local file preparation/download remains available. Local `.env.local` stays untouched. Set the public API endpoint and redeploy when the backend is available. Never put private credentials in `NEXT_PUBLIC` variables.

To verify an API-free production build locally, build with `NEXT_PUBLIC_API_URL` explicitly empty, start it on a spare port, then run `npm run verify:v2` with `VERIFY_URL` set to that URL and `VERIFY_DEMO_MODE=1`. The check asserts zero API calls. No deployment, push, or merge was performed.

---

# Earlier implementation notes — F1–F9

Next.js App Router, TypeScript, Tailwind v4, shadcn/ui-compatible Button and tokens, TanStack Query, and a typed openapi-fetch client. All API types are generated from the shared contract; do not edit `src/lib/api/schema.d.ts` manually.

## Run locally

From `frontend/`, with Node 24 and npm:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run api:generate
npm run dev
```

Open http://localhost:3000 with the real backend running on port 8000. Both `.env.example` and the local configuration now set `NEXT_PUBLIC_API_URL=http://localhost:8000`. Restart Next.js after changing this variable; production bundles need rebuilding. For isolated mock development, explicitly change the URL to `http://localhost:4010`, restart the app and run `npm run mock` in a second terminal. Mock responses are synthetic and do not prove a model is running.

## Verify

```powershell
npm run lint
npm run typecheck
npm run build
npm run demos:validate
npm run verify:ui
npm run test:import
npm run verify:upload
npm run verify:health
npm run test:forecast
npm run verify:forecast
npm run test:portfolio
npm run verify:portfolio
npm run test:review
npm run verify:review
npm run test:factors
npm run verify:factors
npm run test:model-info
npm run verify:model-info
```

The UI verification requires both servers and installed Microsoft Edge. It checks both static demo links, values against their saved files, refresh, CSV downloads, invalid URLs, delayed/missing/malformed/offline/empty demo responses, retry, the actual Prism health response, backend unreachable, theme persistence, and page overflow at 390px. It asserts that opening demos makes no backend requests. Failure states are simulated in the browser only. Current screenshots are in `screenshots/f2/`; the earlier F1 screenshots remain for reference.

Production builds use Next.js's supported Webpack option because the Turbopack production CSS worker failed on this Windows environment. Development uses Turbopack.

## Scope and handoff

F1 supplies the shell, breadcrumb, themes, numbered empty state, route loading/error/not-found boundaries, and an explicit API connection check.

F2 adds three connection options, upfront limits, downloadable CSV template and a 36-row example, and static retail/manufacturing demos. Open either demo to see saved per-period P10/P50/P90 values at `/forecast/<demo_id>`. The preview is intentionally limited to saved examples; interactive forecast tools belong to F5. File upload and column mapping belong to F3; database connections are marked coming soon.

The frontend branches are stacked: F2 is based on `fe/F1-skeleton`, and F3 is based on `fe/F2-connect-data`. Because the backend engineer shares this checkout, frontend commits are created using a separate Git index on their frontend branches without switching the active backend branch. Frontend files may appear untracked when viewing the backend branch; they are committed on the frontend branch.

## F3: upload flow

Open `/upload` or choose **Bring a file → Choose your file**. Select a CSV, XLS/XLSX workbook, or Parquet file; click **Run file check**; confirm date, series, target, and optional factor columns; click **Run conversion**; review/download the prepared Parquet; then click **Upload prepared file**. A successful response displays the API's dataset ID and readiness status. Detailed health review remains F4.

DuckDB-WASM runs in a dedicated worker and reads browser file handles. SheetJS converts the selected Excel worksheet in a separate worker. Raw files are never sent to an API. The browser loads the worker/WASM assets from this app; `predev` and `prebuild` copy them from the locked npm package into ignored `public/vendor/duckdb/`. Do not commit the generated binaries. No third-party CDN requests are needed while processing a file.

Mapping and validation rules:

- CSV's first row is treated as column headers. Date/series/target names are suggested; factors are explicitly selected, up to ten. Unselected columns are dropped. IDs are read as text, preserving leading zeros; Excel IDs should also be stored as text.
- Dates must use ISO date or local ISO date-time strings without timezone offsets. Excel date cells are converted to the same format. Numeric columns allow blanks but reject invalid text, NaN, and infinity. Error messages include affected row counts.
- Duplicate date/series rows are rejected by default. Explicit daily, Monday-based weekly, or monthly aggregation supports sum or average of target; factors are averaged. Any unknown input keeps that group's column unknown. This is source-data aggregation, not forecast-quantile aggregation.
- Conversion preserves negative values and does not fill missing dates; those belong to the backend health report. If every series has fewer than 30 known target points, conversion stops. Partially short datasets show a warning.
- Limits: raw input ≤ 1,000,000,000 bytes; prepared upload ≤ 50,000,000 bytes. Browser memory can impose lower practical limits, particularly for Excel. The processor reports memory failures and supports cancellation/restart.
- The generated OpenAPI client sends `POST /datasets` multipart fields (`file`, optional `name`, optional `holiday_country`). An XMLHttpRequest transport provides actual byte-transfer progress. 100% means transferred, not accepted: the UI waits for the API response. Network/422/malformed responses keep the prepared file available. Cancellation/timeouts may occur after server storage, so check before retrying.

`npm run verify:upload` runs browser checks against Prism, generates an ignored synthetic 100 MB CSV, verifies conversion/aggregation and upload, and captures screenshots in `screenshots/f3/`. It also checks Excel sheet switching, Parquet roundtrip, preservation of blanks and IDs, duplicate rejection and explicit aggregation, invalid dates/numbers/IDs, short/empty/unsupported files, backend failure, server rejection, malformed responses, cancellation/retry, and a 390px layout. The test fixtures stay in ignored `test-fixtures/`. Run `node scripts/verify-upload.mjs` to omit the large-file case.

The measured 100 MB run used 100,003,868 bytes / 781,280 synthetic rows, explicitly summed into 40 periods, and completed local processing plus Prism upload in 8.9 seconds on this machine. This is a highly compressible fixture, not a general performance guarantee or a real-backend validation. Machine-readable results are in `screenshots/f3/100mb-result.json`.

Implementation references: [DuckDB file ingestion](https://duckdb.org/docs/2.0/clients/wasm/data_ingestion), [DuckDB instantiation](https://duckdb.org/docs/2.0/clients/wasm/instantiation), [official SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), and [SheetJS date representation](https://docs.sheetjs.com/docs/csf/features/dates/). SheetJS is installed from its official 0.20.3 distribution; its public npm registry package is older.

Demo data is explicitly synthetic: it is not Favorita data, India cement statistics, or model output. No real precomputed B6 assets were available. `npm run demos:generate` regenerates these deterministic mock fixtures; `npm run demos:validate` validates the files against the API contract. The generated client remains unchanged. See `public/demo/README.md` for the B6 handoff and provenance. Mock generation is an offline development script; no totals are calculated in the page.

Design tokens live in `src/app/globals.css`; shadcn aliases and configuration are in `components.json`. API operations are typed from `contracts/openapi.yaml` through `npm run api:generate`.

Known dependency limitation: npm audit reports eight transitive development-tool advisories (seven high, one moderate) in Prism's Postman/Faker/lodash/uuid dependency chain. `npm audit fix` does not resolve them without a Prism downgrade. Do not expose the mock server publicly or feed it untrusted specifications. Revisit the upstream dependency updates separately.

## Screenshots

### F9

Open **Under the hood** at `/under-the-hood`. The published model reference is separate from the deployment report: 271.8M parameters, 2,048 context points, 64-point blocks and native P10–P90 are reference facts from the official model card. Live identity, parameters, context/block size, revision, device, sample count, licence and Phase 1 quantile levels come only from generated-client GET `/model/info`. GET `/health` independently reports API status and whether the model is loaded. Missing optional values stay unavailable; published facts never replace missing deployment data.

The page reads metadata on entry and on **Refresh deployment**; it never submits a job or runs a benchmark. Median model-call latency uses `latency_ms.p50`, with its supplied call count. Count zero has an empty state and numbered next steps; absent measurements differ from a measured zero. Tail latency and forecast labels outside P10–P90 are not displayed. Timings are described as API-reported rolling model-call measurements, not upload/queue/job duration, and mock data is explicitly possible. Status and metadata have separate loading/error/backend-unreachable/retry paths. Static licence, limits and research content stay available during API failure.

Attribution identifies the intended foundation model and its authors. Weights link to the official model card and CC BY-NC 4.0 terms; upstream code is separately Apache-2.0. These are source terms, not a claim that the metadata API verifies a licence or unmodified weights. Reference facts and licence links were checked against the [official model card](https://huggingface.co/birlaailabs/yug), [upstream repository](https://github.com/birla-ai-labs/yug#license) and [CC deed](https://creativecommons.org/licenses/by-nc/4.0/).

`/under-the-hood/research` summarises `docs/RESEARCH.md` and `docs/YUG_NOTES.md`, including the recorded WQL values, experiment revisions, method and caveats. It labels the results as historical project experiments, not current deployment benchmarks, and does not imply that scripts were rerun here. The repo owner supplied the research discussion URL, [issue #15](https://github.com/birla-ai-labs/yug/issues/15); it is linked alongside the verified related rollout-state issue #9. The summary does not claim to quote the issue or describe its current status.

F9 is stacked on F8 as `fe/F9-under-the-hood`. `test:model-info` checks required/optional metadata, malformed stats, Phase 1 quantile filtering and latency missing/empty/zero cases. `verify:model-info` reads a real Prism response, validates fixtures against ModelInfo/Health, then checks distinct reference/API values, long revisions, browser locale, empty and missing telemetry, unloaded/degraded status, malformed/HTTP/JSON/network errors, independent recovery, loading, licence/research links, no job submissions and 390px light/dark layouts. Real backend integration remains I1.

- [Prism API report](screenshots/f9/prism.png)
- [Desktop model details](screenshots/f9/desktop.png)
- [390px mobile](screenshots/f9/mobile.png)
- [390px dark](screenshots/f9/mobile-dark.png)
- [Research summary at 390px](screenshots/f9/research-mobile.png)
- [No measured calls](screenshots/f9/no-calls.png)
- [Missing telemetry and degraded status](screenshots/f9/optional-fields.png)
- [Invalid model report](screenshots/f9/invalid.png)
- [Backend unreachable](screenshots/f9/backend-unreachable.png)
- [Independent status failure](screenshots/f9/status-unreachable.png)
- [Loading](screenshots/f9/loading.png)

### F8

Open **Factor check** for a saved synthetic example, or **Set up a factor check** on an uploaded dataset's Data health page. Select one non-excluded series and 1–10 factor columns supplied in dataset metadata. The backtest horizon is limited to 1–64 steps; maximum lag is a non-negative whole number (default 3). Nothing is submitted until **Run factor check**. No-factor datasets have an explicit state explaining how to bring historical factors. Sales-only remains the default forecast path.

The generated client posts exactly `dataset_id`, `series_id`, `factors`, `horizon`, and `max_lag` to `/jobs/factors`. Job polling runs once per second, stops on success/failure/error, supports pause/resume and retains `?job=` for reload without resubmission. Returned series and factor names must match the submitted selection. Submission errors warn that the request may already have reached the server.

The results table keeps association (`related`) and forecast usefulness (`helps_yug`) separate. Booleans and the four source verdict codes are authoritative; no thresholds or conclusions are recomputed from p-values, error change or interval endpoints. False differs from missing, and optional values stay unreported. Small statistical values use significant-digit formatting so they do not silently round to zero. Diagnostics expose lag, standardised effect, p-value, sales-only/with-factor WQL, signed error change and interval endpoints. Negative change means better performance. The contract does not specify the interval scale or confidence level, so raw endpoint values are shown without invented units or a confidence percentage. Association is never presented as causal evidence, and no future-promotion scenario is offered.

Search, source-verdict filtering, factor-name sorting and visible-row CSV are included. CSV retains raw values, missing/false distinctions and safe spreadsheet text escaping. The standalone `factors-mock` example uses exact Dataset/FactorResult shapes and is explicitly synthetic; it does not add invented factors to the factor-free retail/manufacturing bundles. Regenerate with `npm run demos:factors`.

F8 is stacked on F7 as `fe/F8-factor-check`. `test:factors` checks verdict copy, missing/false/zero evidence, invalid statistics/intervals, duplicate factor rejection and CSV. `verify:factors` validates demo fixtures and submitted bodies against OpenAPI, then exercises the Data health entry link, offline example, all verdicts, small/missing metrics, ten-factor selection cap, 64-step horizon, zero lag, explicit Run, polling/pause/resume/reload, table controls/export, no-factor/no-result states, backend failures/retry, invalid results, submission failure and 390px light/dark layouts. API mutations in browser tests are intercepted fixtures; real-backend integration remains I1.

- [Choose a factor check](screenshots/f8/empty.png)
- [Synthetic example](screenshots/f8/demo.png)
- [Job progress](screenshots/f8/progress.png)
- [Desktop results and diagnostics](screenshots/f8/desktop.png)
- [Missing evidence](screenshots/f8/optional-fields.png)
- [390px mobile](screenshots/f8/mobile.png)
- [390px dark](screenshots/f8/mobile-dark.png)
- [Failed backtest](screenshots/f8/failed.png)
- [Invalid result](screenshots/f8/invalid.png)
- [Backend unreachable](screenshots/f8/backend-unreachable.png)
- [No factor results](screenshots/f8/no-results.png)
- [No factor columns](screenshots/f8/no-factors.png)
- [Submission failure](screenshots/f8/submission-error.png)

### F7

Open **Year in review** for saved demos, or **Set up a year in review** on an uploaded dataset's Data health page. Select 1–20 non-excluded series; optionally enter positive whole-number lookback periods and origin spacing; then click **Run review**. Blank options are omitted so the backend chooses its documented defaults. The exact `ReviewRequest` includes `top_n: 5`. The holiday country comes from dataset metadata because ReviewRequest has no country override.

Review jobs use the generated client, poll once per second, stop on success/failure/error, support pause/resume, and retain `?job=` for reload without resubmission. Failed or uncertain submissions remain visible. Returned series are checked against the submitted selection. No historical replay is performed in the browser or before Run.

Results use the source's actual/P50/P10/P90, deviation percentage, totals, coverage and calendar tags. Positive surprises and misses rank returned events by absolute actual-minus-P50 difference in dataset units and show at most five each. `recurring_as_expected` events are separated and deduplicated by date. Totals are never made by summing ranked events or per-step quantiles. Optional metrics are explicitly unavailable. Calendar tags are context, not a causal explanation; the frontend performs no holiday lookup and invents no revenue impact.

Uploaded reviews load the latest dataset annotations independently of job snapshots. **Add note / Edit note** opens a native modal with keyboard focus handling, Escape/Cancel, a 500-character limit, disabled saving states and retained drafts on failure. POST sends only `series_id`, the event's supplied `date`, and `text`. Confirmed notes replace the same series/date in the cache and survive reload through GET annotations. Notes cannot be edited until existing notes load successfully. Synthetic demos are read-only and never call annotation APIs. CSV exports the displayed ranked categories for all result series, using the latest saved notes and safe spreadsheet text escaping.

`npm run demos:review` generates the clearly labelled synthetic `review.json` illustrations from existing synthetic history. They include invented expected values, coverage and illustrative event tags; no model replay or real holiday matching was run. Both files validate against ReviewResult. Real B7/B6 review assets can replace them later with accurate provenance.

F7 is stacked on F6 as `fe/F7-year-review`. `test:review` checks ranking, limits, expected-event deduplication, optional values, invalid reports and note export. `verify:review` validates demo fixtures and submitted bodies against OpenAPI, then checks offline demos, Run-only jobs, polling/pause/reload, exact supplied totals, notes create/edit/save-failure/persistence, modal focus, export, independent notes failure, job failures, invalid results, retry and 390px themes. API mutations in these checks are browser-intercepted fixtures; real-backend integration remains I1.

- [Choose a review](screenshots/f7/empty.png)
- [Synthetic demo](screenshots/f7/demo.png)
- [Job progress](screenshots/f7/progress.png)
- [Desktop results](screenshots/f7/desktop.png)
- [Annotation dialog](screenshots/f7/annotation-dialog.png)
- [Failed note save](screenshots/f7/annotation-error.png)
- [Empty series](screenshots/f7/empty-series.png)
- [390px mobile](screenshots/f7/mobile.png)
- [390px dark](screenshots/f7/mobile-dark.png)
- [Notes unavailable](screenshots/f7/notes-unreachable.png)
- [Failed replay](screenshots/f7/failed.png)
- [Invalid result](screenshots/f7/invalid.png)
- [Backend unreachable](screenshots/f7/backend-unreachable.png)
- [Submission failure](screenshots/f7/submission-error.png)

### F6

Open **Portfolio risk** in the navigation to choose a saved demo, or **View portfolio risk** from a completed forecast. Uploaded results retain the dataset and `?job=` context. Portfolio reads only the dataset and existing forecast job; it never creates a job. A running/failed job has its own state with a link back to Forecast. Missing job IDs show a setup state. The table covers only returned forecast series, not every dataset series.

Each row uses the supplied `risk` object. The score is full `(P90-P10)/|P50|` band width, displayed as a percentage, not a ± margin. Optional labels remain “not reported”; classification thresholds and direction are never recomputed. Trust horizon is the supplied step count translated using dataset frequency, with explicit zero and unknown-frequency states. Invalid scores, labels and horizons are rejected by shared result validation. No totals or portfolio distribution are calculated.

Sort by series, numeric uncertainty, direction or numeric trust horizon; filter by ID, supplied label and direction; export the visible rows. CSV keeps the raw API score and trust steps, includes frequency, and protects formula-like IDs. Native series links support keyboard navigation, and clicking any other row cell also opens that series in the same forecast job. `series=` is URL-encoded and survives reload. Saved demos remain offline; their synthetic status is explicit.

F6 is stacked on `fe/F5-forecast` as `fe/F6-portfolio-risk`. `test:portfolio` checks numeric sorting, cadence/zero handling, safe export and invalid metrics. `verify:portfolio` validates fixtures against the API contract and checks an offline demo, all sort/filter controls, filtered CSV, empty/loading/error/backend-down states, running/failed jobs, retry, encoded series links and row navigation, reload, no job submissions and 390px light/dark layouts. Fixtures intentionally supply risk scores different from what the chart quantiles imply, to ensure values are not recomputed. The contract has no job-list endpoint or dataset ID inside a job; links retain the originating dataset/job context. Real-backend integration remains I1.

- [Before choosing a forecast](screenshots/f6/empty.png)
- [Saved demo](screenshots/f6/demo.png)
- [Desktop portfolio](screenshots/f6/desktop.png)
- [Filtered table](screenshots/f6/filtered.png)
- [390px mobile](screenshots/f6/mobile.png)
- [390px dark](screenshots/f6/mobile-dark.png)
- [Running job](screenshots/f6/running.png)
- [Failed job](screenshots/f6/failed.png)
- [Invalid metrics](screenshots/f6/invalid.png)
- [Backend unreachable](screenshots/f6/backend-unreachable.png)
- [No series](screenshots/f6/no-series.png)
- [Loading](screenshots/f6/loading.png)

### F5

From an uploaded dataset's Data health page, choose **Set up a forecast**. Select 1–100 non-excluded series, set a whole-number horizon of 1–256 steps, then click **Run forecast**. Inputs use the dataset API; submission sends exactly `dataset_id`, `series_ids`, `horizon`, and the contract default `seed: 0`. No model job is submitted before Run. The frontend polls the returned job ID once per second until success/failure; polling errors require Retry, and Pause/Resume never cancels the server job. The URL retains `?job=` for reload without resubmission. Submission failures warn that a job may already exist. History failure is recoverable independently of the forecast result.

Saved demos now include the same chart and planning tools. They remain synthetic, static and offline, with no latency/model claims. Their existing detailed values table remains available. The demo fixtures currently omit last-year and step exceedance grids, so the UI identifies those as unavailable.

ECharts renders history, P50, P30–P70/P10–P90 bands, and source-aligned last-year values when supplied. Negative bands are supported; isolated observations have markers and blanks remain gaps. Chart history is limited to the most recent 2,048 points and has zoom/pan. An exact values table and CSV provide a keyboard-accessible alternative. Chart code loads lazily. References: [modular ECharts imports](https://echarts.apache.org/handbook/en/basics/import/) and [stacked areas](https://echarts.apache.org/handbook/en/how-to/chart-types/line/stacked-line/).

Scenario totals come directly from `total_distribution.percentiles[10|50|90]`; the 50–90% plan slider indexes that same total distribution. Target probability uses percentile brackets for reaching **at least** the entered total. Capacity probability uses each column of the optional 99-row `step_exceedance_grid` for **strictly exceeding** capacity. Bounds preserve repeated values and the unsupplied 0–1%/99–100% capacity tails; no extrapolation or sum of quantiles is used. The UI explains that these are approximate model probabilities. Metadata does not specify a currency; dataset units are the default, with explicit INR formatting available. No currency conversion occurs.

`test:forecast` checks threshold ties, tails, malformed/crossed percentiles and safe exact-value CSV export. `verify:forecast` validates fixtures and submitted requests against OpenAPI, then checks an offline demo, Run-only submission, multi-series selection/exclusions, limits, polling/pause/resume, reload without resubmission, distribution values, probability tails, INR, CSV, failed jobs, unreachable backend/retry, invalid results, history failure, submission failure and 390px themes. The fixture deliberately makes horizon totals differ from sums of per-step quantiles. Existing `verify:ui` also passes. The frontend branch is `fe/F5-forecast`, stacked on F4; real-backend integration remains I1.

- [Demo forecast](screenshots/f5/demo.png)
- [Before first run](screenshots/f5/empty.png)
- [Job progress](screenshots/f5/progress.png)
- [Desktop result](screenshots/f5/desktop.png)
- [390px result](screenshots/f5/mobile.png)
- [390px dark](screenshots/f5/mobile-dark.png)
- [Failed job](screenshots/f5/failed.png)
- [Backend unreachable](screenshots/f5/backend-unreachable.png)
- [Invalid result](screenshots/f5/invalid.png)
- [Submission failure](screenshots/f5/submission-error.png)

### F4

Open `/data-health` from the navigation, choose a synthetic demo, or follow **Review data health** after uploading. Uploaded datasets load `GET /datasets/{dataset_id}` using the generated client. Demo routes read only their saved dataset JSON. Refresh and direct URL reloads work without relying on upload state.

The readiness card uses `health.ready` exactly. Tabs use each supplied check's `count` and filter by `affected_series`; occurrence counts are not treated as series counts. Banners show the supplied percent and action without inventing a denominator or remediation. Optional missing series lists, affected IDs, dates, counts, and issues are explicitly unavailable. Frequency is dataset-level because the contract has no per-series frequency field. All eight check types are supported. Search, status filter, sortable ID/history columns, keyboard tabs, dismiss/restore notices, and visible-row CSV export are included. Export neutralizes spreadsheet formula prefixes in user-provided cells.

F4 is stacked on `fe/F3-upload-flow` as `fe/F4-data-health`. New forecast runs remain F5. Only frontend files change.

`npm run verify:health` requires the app and Prism. It checks a real generated Prism response, validates richer fixtures against OpenAPI, then exercises all eight tabs, filtering/sorting, export, optional fields, no-series and no-check states, 404, malformed reports, network failure/retry, loading, and 390px light/dark layouts. Screenshots use synthetic test fixtures, not real customer data.

- [Empty](screenshots/f4/empty.png)
- [Saved demo](screenshots/f4/demo.png)
- [Desktop report](screenshots/f4/desktop.png)
- [Filtered series](screenshots/f4/filtered.png)
- [Optional fields / blocked](screenshots/f4/optional-fields.png)
- [No series](screenshots/f4/no-series.png)
- [Loading](screenshots/f4/loading.png)
- [Backend unreachable](screenshots/f4/backend-unreachable.png)
- [Not found](screenshots/f4/not-found.png)
- [Invalid report](screenshots/f4/invalid.png)
- [390px mobile](screenshots/f4/mobile.png)
- [390px dark](screenshots/f4/mobile-dark.png)

### F3

- [Upload empty](screenshots/f3/empty-desktop.png)
- [Checking locally](screenshots/f3/checking.png)
- [Column mapping](screenshots/f3/mapping-desktop.png)
- [Prepared Parquet](screenshots/f3/prepared-desktop.png)
- [Duplicate error](screenshots/f3/duplicate-error.png)
- [Excel worksheet](screenshots/f3/excel-prepared.png)
- [Backend unreachable](screenshots/f3/backend-unreachable.png)
- [Upload progress](screenshots/f3/upload-progress.png)
- [API acceptance](screenshots/f3/accepted.png)
- [390px mobile](screenshots/f3/mobile-prepared.png)
- [390px dark theme](screenshots/f3/mobile-dark.png)
- [100 MB completion](screenshots/f3/100mb-complete.png)

### F2

- [Connect data desktop](screenshots/f2/desktop-connect.png)
- [Retail preview](screenshots/f2/desktop-retail.png)
- [Manufacturing preview](screenshots/f2/desktop-manufacturing.png)
- [Forecast empty](screenshots/f2/forecast-empty.png)
- [Loading](screenshots/f2/demo-loading.png)
- [Missing demo](screenshots/f2/demo-missing.png)
- [Malformed demo](screenshots/f2/demo-malformed.png)
- [Demo network failure](screenshots/f2/demo-offline.png)
- [Empty demo](screenshots/f2/demo-empty.png)
- [Backend unreachable](screenshots/f2/backend-unreachable.png)
- [Dark theme](screenshots/f2/desktop-dark.png)
- [390px Connect data](screenshots/f2/mobile-connect.png)
- [390px Forecast](screenshots/f2/mobile-forecast.png)
- [390px dark theme](screenshots/f2/mobile-dark.png)

## I1: real-backend configuration and date labels

The app now targets `http://localhost:8000`. The connection check validates the complete Health response, requires a boolean `model_loaded`, and reports loaded only when that flag is true. Invalid or unreachable responses never retain a successful status on screen. The URL beside the result identifies its source. During this handoff, a real request to port 8000 was refused; no real model or upload flow has been verified.

Period labels share one formatter across forecast summaries, exact-value tables, capacity rows, chart axes/tooltips, portfolio date ranges, health reports, reviews, and annotation dialogs. Daily/weekly/unknown dates use `6 Feb 2026`, monthly uses `Feb 2026`, hourly uses `6 Feb 2026, 14:00`, quarterly uses `Q1 2026`, and yearly uses `2026`. Source calendar dates and clock times are preserved without timezone conversion. Import examples, machine-readable CSV/JSON downloads, and API annotation keys retain ISO dates for roundtripping.

`npm run test:dates` checks frequency labels, midnight, timezone preservation, and invalid/missing dates. With the app running, `npm run verify:integration` first checks the actual configured endpoint, then uses browser-only health fixtures for false, true, malformed, and loading/recovery states. It checks daily/monthly demos, health/portfolio/review pages, an hourly fixture, and 390px layouts. Fixtures are not evidence that the real model loaded.

The homepage now opens the supplied `retail` and `manufacturing` bundles, with real-data and precomputed-model labels throughout forecasts, health, portfolio and read-only reviews. Retail uses UCI Online Retail II (UK gift retail), not Favorita. Manufacturing uses the India cement production index. Old `*-mock` URLs remain explicitly synthetic for saved links and verification fixtures. Forecast values, horizon totals and capacity distributions are read unchanged from the supplied JSON. No model, job, or annotation request is made when opening these static results.

The supplied JSON still has a known contract-format defect: series timestamps omit an RFC3339 timezone (for example, `2011-04-01T00:00:00`). The frontend preserves those source calendar periods and formats them by frequency; it does not assume an offset or alter the data. `npm run demos:validate -- retail manufacturing` reports this defect. The backend owner should fix serialization and regenerate the bundles. Browser-rendering checks passing does not mean strict contract validation passes. Original source/licence notes remain in the backend's data-builder handoff; this local review commit does not publish the data.

Run `npm run verify:real-demos` with the app running. It checks real homepage links, provenance on every saved-result page, exact supplied total percentiles and planning values, capacity rows, read-only review, no backend calls, loading/missing/retry, legacy mock URLs, and 390px light/dark layouts. Screenshots are in `screenshots/i1-real/`: [homepage](screenshots/i1-real/home.png), [retail](screenshots/i1-real/retail-desktop.png), [manufacturing](screenshots/i1-real/manufacturing-desktop.png), [mobile](screenshots/i1-real/retail-mobile.png), [loading](screenshots/i1-real/loading.png), and [missing data](screenshots/i1-real/missing.png).

Factor check (F8) and Under the hood (F9) are already implemented, so their navigation links remain enabled. Full I1 sign-off still requires the running backend, corrected demo timestamps, and an uploaded file.

Screenshots of the changed states:

- [Actual backend connection check](screenshots/i1/real-health.png)
- [Model not loaded](screenshots/i1/model-not-loaded.png)
- [Invalid health response](screenshots/i1/invalid-health.png)
- [Loading health response](screenshots/i1/health-loading.png)
- [Daily forecast](screenshots/i1/daily-desktop.png)
- [Monthly forecast](screenshots/i1/monthly-desktop.png)
- [Hourly forecast fixture](screenshots/i1/hourly.png)
- [390px daily forecast](screenshots/i1/retail-mock-mobile.png)
- [390px monthly forecast](screenshots/i1/manufacturing-mock-mobile.png)

## I1 review fixes: zoom, numbers, means, and cement factors

Charts now start with the latest 90 observed points plus the complete forecast. The slider retains all supplied history, including points older than the former 2,048-point display limit. Retail's refreshed bundle supplies five forecast series and `histories.json`; selecting a series uses its own saved history and updates the overview. A missing optional history stays unavailable rather than borrowing another series' data.

Known count units render without decimal places across summaries, forecast cards/tables/chart axes/tooltips, and review actual/expected values. Formatting uses the browser locale except for India datasets or explicit INR display. Index values retain decimals; model parameter counts always use international grouping (`271,845,260`). Display rounding never changes source values or CSV precision. The current Dataset contract has no unit/currency field, so unknown uploaded units retain their existing precision rather than being guessed from names.

The API client was regenerated after the contract owner supplied required `Dataset.additive`, `total_distribution.aggregation` (`sum` or `mean`), optional review aggregation, and the zero-values health check. `additive: false` uses backend-supplied mean percentiles unchanged: scenario and planning cards say **Average per period**, the target-total card is hidden, and per-step capacity risk remains available. No division by horizon or sum of quantiles is performed. Dataset/result aggregation mismatches are rejected. Review aggregates also use mean labels when the API reports `aggregation: mean`. Legacy synthetic fixtures were migrated to the new required fields; their saved illustration values remain unchanged.

The factor demo now reads `manufacturing/dataset.json` and `manufacturing/factors.json`, with real cement provenance and no backend job. The original synthetic factor files remain test fixtures. No model backtest runs when the saved demo opens.

Checks: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:numbers`, `npm run test:forecast`, `npm run test:portfolio`, `npm run test:review`, `npm run demos:validate`, and `npm run verify:review-fixes`. The browser check drags the actual zoom handle to restore the oldest history, checks integer counts and unchanged mean values, rejects aggregation mismatches, tests the real cement factors and their loading/empty/missing/retry states, and checks 390px layouts. The previously documented source timestamp-format defect remains outside these UI fixes.

- [Recent history and whole counts](screenshots/i1-review/recent-history-counts.png)
- [Full history via slider](screenshots/i1-review/full-history-slider.png)
- [Average-per-period cards](screenshots/i1-review/period-averages.png)
- [390px averages](screenshots/i1-review/period-averages-mobile.png)
- [Real cement factors](screenshots/i1-review/cement-factors.png)
- [390px cement factors](screenshots/i1-review/cement-factors-mobile.png)
- [Factor loading](screenshots/i1-review/cement-factors-loading.png)
- [Factor unavailable](screenshots/i1-review/cement-factors-unavailable.png)
- [Factor empty](screenshots/i1-review/cement-factors-empty.png)
- [International parameter count](screenshots/i1-review/international-parameters.png)
- [Aggregation mismatch](screenshots/i1-review/aggregation-mismatch.png)

## F5 visual upgrade: planning and evidence first

**Try a demo** now opens `/forecast/retail` directly. Forecast results lead with the selected plan percentile in large type and a five-part KPI strip: supplied expected total/mean, P10–P90 range, observed review coverage against 80%, source uncertainty, and recorded model time with no training. The service slider remains 50–90%. Model service level and observed coverage are explicitly separate; absent review data stays unavailable. Cement continues to use backend means unchanged. Completed live forecast results appear above collapsible input controls.

The demo workspace now has one canonical values table, a compact source header, and keyboard/touch-accessible info tooltips instead of repeated explanations. Light is the default even on a dark OS; an explicit dark selection still persists. Stronger borders and text contrast distinguish cards and charts. The chart retains the last-90-points view and the full-history slider.

The owner approved genuine sample paths and full dated backtests but explicitly retained **frontend-only scope**. Their API fields and demo arrays are not supplied yet. Optional renderers and toggles are ready, but the actual demo screenshots show unavailable controls. No paths are reconstructed from quantiles, no backtest is inferred from ranked surprises, and no sample arrays or replay points were written to product JSON. See [the producer handoff](API_VISUALS_HANDOFF.md) for proposed shapes. When valid arrays arrive, the chart uses their actual path count and shows the recent calendar month of supplied backtest forecast/actual points; surprise markers come only from the review's ranked events. Missing or malformed optional arrays never produce decorative data.

Live forecast workspaces may reuse a review-job ID recorded while this session submitted a review for the same dataset. This performs only existing GET requests and never starts another review or forecast. Unmatched, unavailable, or unfinished review data does not populate coverage. Demo review data comes only from that demo's `review.json` and the selected series ID.

Verification: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:forecast-story`, `npm run test:forecast`, `npm run test:numbers`, and `npm run verify:visual-upgrade`. The browser check covers supplied values, actual observed coverage, missing review data, light/dark persistence, 390px overflow, keyboard tooltips, non-additive output, and same-dataset live review reuse. Clearly isolated browser-only fixtures exercise the optional path/backtest toggles; those fixtures are not saved to demo files or used for the before/after images.

Before/after captures use the same retail series, 80% service level, and desktop viewport (1440 × 1000). Before images were captured before changing the UI and are protected from accidental overwrite.

- [Before viewport](screenshots/visual-upgrade/before-viewport.png) · [After viewport](screenshots/visual-upgrade/after-viewport.png)
- [Before full page](screenshots/visual-upgrade/before.png) · [After full page](screenshots/visual-upgrade/after.png)
- [Before 390px](screenshots/visual-upgrade/before-mobile.png) · [After 390px](screenshots/visual-upgrade/after-mobile.png)
- [Dark mobile](screenshots/visual-upgrade/after-mobile-dark.png)
- [Missing review](screenshots/visual-upgrade/review-unavailable.png)
- [Non-additive manufacturing](screenshots/visual-upgrade/after-manufacturing.png)
