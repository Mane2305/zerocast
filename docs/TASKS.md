# Phase 1 tasks (local)

One GitHub issue per task. One branch + one PR per task. Owner: **CC** = Claude Code (backend),
**CX** = Codex (frontend), **YOU** = repo owner. Do tasks in order within each track; the two
tracks run in parallel because the frontend uses the mock server.

## Track 0 — setup (YOU)
- **S1** Create repo, push this starter pack, protect `main` (PRs only).
- **S2** Create issues from this file.

## Track B — backend (CC)
| ID | Task | Done when |
|---|---|---|
| B1 | Backend skeleton: FastAPI app, config, SQLite via SQLAlchemy, local Storage + Repository interfaces, `/health`, pytest + ruff, Makefile/`uv` or `pip` setup | `make test` passes; `/health` returns ok |
| B2 | YugEngine: load model once, single worker queue, input sanitising (YUG_NOTES), univariate forecast with **sample paths**, quantiles + total distribution + step exceedance grid, latency stats, `/model/info`. Tiny-model fixture for tests. Test: our per-step quantiles == `pipeline.predict` for same seed | Tests pass with the tiny model; manual run with real weights |
| B3 | Datasets: `POST /datasets` (Parquet/CSV, 50 MB limit), schema validation for the template, frequency detection, health check service (all checks in the contract), `GET /datasets/{id}`, `GET /datasets/{id}/series/{sid}` | Unit tests for each health check with small fixtures |
| B4 | Jobs: JobRunner interface + in-process implementation, `POST /jobs/forecast`, `GET /jobs/{id}` with progress; insights service (risk metrics, last-year alignment) | Contract tests against openapi.yaml pass |
| B5 | Demo builders in `data/scripts/`: Favorita sample (1 store × ~5 families, daily, with holidays and onpromotion) and India cement index (monthly, base 2011-12). Write `README` with sources + licence notes. Check licences before committing any data | Scripts produce template-format Parquet |
| B6 | `precompute_demos` script: runs forecast (and review/factors when ready) on demo datasets and writes JSON in the exact contract shapes to `frontend/public/demo/<demo_id>/` | JSON validates against the contract schemas |
| B7 | Year in review: `POST /jobs/review`, replay origins, surprise ranking, holiday matching (`holidays` package), annotations endpoints | Unit tests on synthetic data with an injected spike |
| B8 | Factor check: `POST /jobs/factors`, lens 1 (statsmodels OLS on de-trended/de-seasonalised data, lags 0..k), lens 2 (Yug backtest univariate vs + factor, horizon ≤ 64, paired bootstrap CI), verdict rules | Unit tests for verdict mapping |

## Track F — frontend (CX)
| ID | Task | Done when |
|---|---|---|
| F1 | Skeleton: Next.js + TS + Tailwind + shadcn/ui, app shell (top bar, breadcrumb, theme), design tokens, API client generated from `contracts/openapi.yaml`, mock server script (Prism) | `npm run dev` + `npm run mock` work; lint passes |
| F2 | Connect data page: 3 doors, template download, demo cards load static JSON from `public/demo` | Demo opens Forecast page instantly with mock/demo data |
| F3 | Upload flow: DuckDB-WASM + SheetJS, column mapping UI, aggregate to template, Parquet export, upload with progress, limits shown upfront, friendly errors | Works with a 100 MB CSV locally; bad files show clear errors |
| F4 | Data health page: problem tabs with counts, warning banners, series table | Matches `HealthReport` schema |
| F5 | Forecast page: parameters bar + Run, job polling, fan chart (history, last year, P30–P70, P10–P90, P50), scenario cards, plan card with service-level slider, target probability, capacity risk, export CSV, speed badge | All numbers computed from contract fields (total_distribution, step_exceedance_grid) |
| F6 | Portfolio risk page: sortable table (uncertainty, direction, trust horizon), row → forecast | — |
| F7 | Year in review page: surprises lists, calendar tags, "as expected" notes, annotate dialog | — |
| F8 | Factor check page: factor picker, two-lens results table with plain-English verdicts | — |
| F9 | Under the hood page: model info, latency, limits, licence + attribution, research links | — |

## Track I — integration (YOU + architect review)
- **I1** Point frontend at the real backend; run the full flow on both demos and one uploaded file.
- **I2** End-to-end checklist: every page, empty/loading/error states, slow-job progress, backend down.
- **I3** Measure latency on your laptop; update limits in PRODUCT.md if needed.
- **I4** Phase 1 sign-off → start Phase 2 (deploy).

## Priority if time runs short
P0: B1–B6, F1–F6, F9 → P1: B7, F7 → P1: B8, F8.
