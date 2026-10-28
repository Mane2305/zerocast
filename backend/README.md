# ZeroCast backend

FastAPI service implementing `contracts/openapi.yaml`. Python 3.11, managed with
[uv](https://docs.astral.sh/uv/).

## Setup

```bash
cd backend
make install        # uv sync: creates .venv on Python 3.11 (uv downloads it if missing)
```

Windows: install `uv` (`pip install --user uv` or `winget install astral-sh.uv`) and `make`
(`winget install ezwinports.make`). Open a new terminal afterwards so both are on PATH.

## Commands

| Command | What it does |
|---|---|
| `make run` | Start the API on http://localhost:8000 with auto-reload |
| `make test` | Lint (ruff check + format check), then `pytest` |
| `make lint` | Lint only |
| `make format` | Auto-fix lint issues and format |

Check it is up: `curl http://localhost:8000/health` →
`{"status":"ok","model_loaded":false,"device":"cpu","version":"0.1.0"}`.
Interactive docs: http://localhost:8000/docs.

## Model engine (B2)

`app/engine/` is the only package that imports `yug` (pinned to PR #14, commit `4b1de57`).

- The model loads once at startup on a dedicated worker thread. The API is up meanwhile:
  `/health` says `degraded` / `model_loaded: false` until loading finishes, then `ok`.
  `/model/info` returns 503 (`model_loading`, `model_failed` or `model_disabled`) until then.
- Every model call runs on that one thread (upstream issue #9: the pipeline is not thread-safe).
- Inputs are sanitised per YUG_NOTES: NumPy only, `(1, T)` squeezed to 1-D, `±inf` → NaN, and
  our frequency names map to `h/D/W/M/Q/A/U` (never `Y` or `ms`).
- `YugEngine.forecast(context, horizon, frequency, seed=0)` returns per-step quantiles **and**
  the `(num_samples, horizon)` sample paths. `app/engine/summaries.py` turns paths into the
  horizon-total percentiles (0..100) and the per-step exceedance grid (1..99).
- The path rollout copies Yug's private `_predict_one` / `_rollout_cached`.
  `tests/test_engine.py` asserts our quantiles equal `pipeline.predict` for the same seed. If
  you bump the Yug pin and that test fails, the copy must be updated.
- Tests use a tiny random-weight model (`app/engine/testing.py`). No download needed.

Manual check with the real weights (first run downloads ~1.1 GB into the Hugging Face cache,
outside this repo):

```bash
uv run python -m scripts.smoke_model
```

Measured on the owner's laptop (CPU, 100 samples): horizon 28 ≈ 0.1 s, horizon 256 ≈ 1.5 s.

## Datasets (B3)

```bash
curl -F file=@sales.csv -F name="Store sales" -F holiday_country=IN http://localhost:8000/datasets
curl -F file=@index.csv -F name="Cement index" -F additive=false http://localhost:8000/datasets
curl http://localhost:8000/datasets/<dataset_id>
curl http://localhost:8000/datasets/<dataset_id>/series/<series_id>
```

- Accepts Parquet (detected by content) or UTF-8 CSV in the universal long template
  (`date`, `series_id`, `target`, optional numeric factor columns), max 50 MB.
- `additive` (form field, default `true`): set `false` for an index, a price or a rate. Then
  forecast `total_distribution` and the review's `expected_total`/`actual_total` describe the
  horizon MEAN, and say so with `aggregation: "mean"`. Datasets stored before the flag existed
  are treated as additive.
- The health check also reports `zero_values` (info): every 0 in `target`, e.g. closed days
  filled with 0. It cannot tell a filled 0 from a real zero, and it does not turn a series into
  a warning.
- Unusable files return 422 with an `Error` body; `code` is one of `invalid_columns`,
  `invalid_dates`, `empty_file`, `unreadable_file`, `file_too_large`, `invalid_holiday_country`,
  `validation_error`.
- The health check (`app/services/health_check.py`) runs on upload. Decisions it makes:
  - Frequency is the median spacing between consecutive dates (hourly → yearly, else `unknown`).
  - Missing dates on the detected grid are filled as blanks. Duplicate `(series_id, date)` rows
    keep the last row. `±inf` becomes blank. Negative values are kept.
  - Series with fewer than 30 non-blank values, or whose dates don't sit on a regular grid, are
    `excluded`. Constant series get a `warning`.
  - Only the first 10 factor columns are kept; the rest are reported under `too_many_factors`.
  - Every check is always listed; a check with count 0 has severity `info`.
- The cleaned, regular-grid frame is stored as `datasets/<id>/clean.parquet`. Later jobs read
  this file, not the original upload.
- Dates in responses are ISO 8601 without a timezone (`2024-01-01T00:00:00`), because business
  dates have none. Adding `Z` would shift days for users west of UTC.

## Input v2 (B13)

```bash
# long file with two ID columns and custom names
curl -F file=@sales.csv -F 'id_columns=["store","product"]' -F target_column=units      -F date_column=day -F unit=units http://localhost:8000/datasets
# wide file (date + one column per item), CSV, Parquet or JSON records
curl -F file=@wide.json http://localhost:8000/datasets
```

- `app/services/reshape.py` turns any accepted upload into the internal long template before
  the health check. Column names are matched case- and space-insensitively.
- `format=auto` (default) picks **long** when the target, `series_id` or `id_columns` are
  present, and **wide** when every non-date column is numeric; otherwise the long-format
  error lists the missing columns. `format=long|wide` forces it.
- Long: `id_columns` (JSON array, default `["series_id"]`) build `series_id` as `a|b`;
  `Dataset.hierarchy` lists them and each item gets `attributes` (`{"store": "S1", ...}`).
  The remaining columns are drivers (factors), as before. Wide: every non-date column is an
  item; no drivers.
- JSON uploads must be an array of records. Excel is converted in the browser.
- `unit` comes from the form field, or else from a `unit` column with a single value (the
  column is then dropped). Display only.
- `closed_periods_zero` (info, never downgrades a series) counts zeros that look like
  closures: on daily data, a weekday where at least 80% of a series' values are 0 (4+ weeks
  observed); on any frequency, a date where every observed series is 0 (2+ series). It is a
  subset of `zero_values`, which still counts every zero.

## Jobs and forecasts (B4)

```bash
curl -X POST http://localhost:8000/jobs/forecast -H "Content-Type: application/json" \
  -d '{"dataset_id": "<id>", "series_ids": ["A", "B"], "horizon": 28}'
curl http://localhost:8000/jobs/<job_id>     # poll until status is succeeded or failed
```

- `app/jobs.py`: the `JobRunner` interface (`submit`, `status`) and `InProcessJobRunner`.
  Jobs run one at a time on a background thread, and their state is stored in the DB. On
  startup, jobs left `queued`/`running` by a previous process are marked `failed`
  (`interrupted`).
- A well-formed request always gets 202. Problems found while running are reported on the job
  (`status: failed`, `error.code`): `not_found`, `series_not_found`, `series_excluded`,
  `model_disabled`, `model_failed`, `internal_error`. A malformed body (e.g. horizon > 256)
  gets 422.
- The forecast reads the cleaned history (missing dates are NaN, masked by Yug) and returns
  quantiles, `total_distribution` (percentiles 0..100 of the horizon total, or mean for a
  non-additive dataset, from sample paths; `aggregation` says which),
  `step_exceedance_grid` (per-step percentiles 1..99), `last_year` and `risk`. Numbers are
  rounded to 6 significant digits.
- `return_paths` (0-50, default 0) adds `sample_paths` (shape [n][horizon]) for the
  "possible futures" chart. It is capped at the engine's sample count (`ZC_NUM_SAMPLES`), and
  the paths are clipped at 0 the same way as the quantiles.
- If a series' history has no negative values, quantiles and sample paths are clipped at 0
  (sales and production cannot go below zero). Clipping is monotone, so quantiles and totals
  stay consistent. Forecast and year-in-review results both use this; the factor check's
  backtest does not (both arms are scored on the raw model output).
- `last_year` is the actual value one cycle earlier: 52 weeks for hourly/daily/weekly (keeps
  weekdays aligned), 12 months for monthly/quarterly/yearly. It is `null` when none of those
  dates exist in the history.
- Risk thresholds (`app/services/insights.py`), all product choices to confirm:
  - `uncertainty_score` is sum(P90 − P10) / sum|P50| over the horizon, so near-zero steps
    (closed days) cannot dominate it.
  - Labels: `predictable` below 0.3 (about ±15%), `volatile` from 0.6 (about ±30%),
    `moderate` in between.
  - `risk_direction` is `upside`/`downside` when one side of the band is on average 1.5× wider
    than the other.
  - `trust_horizon` is the number of leading steps h for which the same ratio of sums over
    steps 1..h stays ≤ 0.5 (about ±25%).
- Note for consumers: Yug draws one random number per 64-step block, so within a block the
  sample paths move together. Totals still come from paths (`total_distribution`), as required.

## Year in review and annotations (B7)

```bash
curl -X POST http://localhost:8000/jobs/review -H "Content-Type: application/json" \
  -d '{"dataset_id": "<id>", "series_ids": ["A"]}'
curl -X POST http://localhost:8000/datasets/<id>/annotations -H "Content-Type: application/json" \
  -d '{"series_id": "A", "date": "2024-08-24", "text": "Wholesale order"}'
curl http://localhost:8000/datasets/<id>/annotations
```

- Replay (`app/services/review.py`): the last `lookback_periods` are split into blocks of
  `step`. Each block is forecast from data strictly before it (no leakage) and compared with
  the actuals. Origins with fewer than 30 observed points of context are skipped, and at most
  120 origins are used.
- Defaults by frequency (lookback / step): hourly 672 / 24, daily 364 / 7, weekly 52 / 1,
  monthly 12 / 1, quarterly 4 / 1, yearly 3 / 1.
- Ranking (product choices):
  - Candidates are band breaches (outside P10–P90). For hourly/daily/weekly data, periods
    containing a holiday also count, so a festival that came in as expected is reported with
    `recurring_as_expected: true`. Monthly and longer periods almost always contain some
    holiday, so there only breaches are listed (still tagged with their holidays).
  - `positive_surprises` are periods with actual > P50 and `misses` those with actual < P50,
    each ranked by |deviation_pct| and capped at `top_n` (default 5).
- Holidays come from the `holidays` package for the dataset's `holiday_country`; an unknown
  country just gives no tags.
- `expected_total` is the sum of the **mean** of the sample paths over the replayed periods
  (means add up; quantiles don't). `actual_total` sums the actuals; periods with a blank
  actual are left out of both. `band_coverage` is the share of periods inside P10–P90 (~0.8
  expected).
- Annotations: `POST` adds or replaces the note for (series, date). Dates are normalised to
  `YYYY-MM-DDT00:00:00`, so they match the review's dates. An unknown series gives 422, an
  unknown dataset 404.
- `precompute_demos` now also writes `review.json` (ReviewResult) per demo.

## Factor check (B8)

```bash
curl -X POST http://localhost:8000/jobs/factors -H "Content-Type: application/json"   -d '{"dataset_id": "<id>", "series_id": "A", "factors": ["promo"], "horizon": 28}'
```

Two separate lenses per factor (`app/services/factors.py`):

- **Lens 1, related to your sales?**
  - Target and factor are each de-trended and de-seasonalised: OLS residuals on a linear trend
    plus seasonal dummies (period 24/7/52/12/4 for hourly/daily/weekly/monthly/quarterly).
  - Then an OLS of target on factor at lags 0..`max_lag`, with HAC (Newey-West) standard
    errors, because the residuals are autocorrelated.
  - The best lag's p-value is Bonferroni-adjusted for the number of lags tried.
    `is_related` means p < 0.05.
  - `effect` is the standardised coefficient. The wording is "related to", never "causes".
- **Lens 2, helps Yug forecast?**
  - Up to 8 non-overlapping backtest origins at the end of the series. Each origin is forecast
    sales-only and sales + factor with the same seed, so the comparison is paired.
  - Scored by weighted quantile loss (WQL).
  - A paired bootstrap over origins (1000 resamples) gives a 95% CI for `change_pct`.
    `helps` means the whole CI is below 0.
  - With fewer than 3 origins, `helps` is always false and there's no CI.
- **Verdict:** related & helps → `use_it`; related only → `real_driver_yug_cannot_use`;
  helps only → `helps_yug_unclear_link`; neither → `probably_drop`.
- **Covariate path:** `YugEngine.forecast_with_covariates` is used only here, and only for
  horizon ≤ 64. Pass the stack as a list, `[stack]`: a bare `(channels, time)` array is read by
  `predict` as separate univariate series (tested).
- `precompute_demos` also writes `factors.json` for demos that have factor columns.

## Accuracy (B11)

```bash
curl -X POST http://localhost:8000/jobs/accuracy -H "Content-Type: application/json"   -d '{"dataset_id": "<id>", "series_ids": ["A", "B"], "horizon": 14, "origins": 8}'
```

- `app/services/accuracy.py` (pure logic) and `accuracy_job.py` (wiring). Origins are spaced
  one horizon apart and end at the last observed period, so `origins × horizon` periods at the
  end of the history are backtested without overlap. Each origin sees only earlier data;
  origins with fewer than 30 points of context are skipped (`origins` in the result is the
  number actually used, for the longest series). If a series has no usable origin the job
  fails with `history_too_short`.
- Per series: `wape` = sum|actual − P50| / sum|actual| × 100, `bias_pct` = sum(P50 − actual) /
  sum|actual| × 100 (+ = over-forecast), `coverage_p10_p90` (share 0-1), `quantile_coverage`
  (share of actuals at or below each quantile: the calibration chart), and `backtest`
  (dates, actual, P10/P50/P90) for the overlay. Missing actuals are `null` in the overlay and
  skipped in the scores.
- Naive baseline = seasonal naive (repeat the last season before each origin: 7 for daily,
  52 weekly, 12 monthly, 4 quarterly, 24 hourly). `naive_wape` is scored on the periods where
  it exists and `improvement_vs_naive_pct` compares the model on those same periods; both are
  `null` when the history before the origins is shorter than one season.
- `portfolio` pools all series, so WAPE and bias are weighted by volume; its range accuracy is
  the volume-weighted mean of the series' coverage.
- Uses the same clipped-at-0 forecasts as the forecast job.

## Demo data (B5)

`make demo-data` builds the demo datasets into `data/processed/` from raw files in `data/raw/`.
See `data/scripts/README.md` for sources, download steps and licence notes. `make lint`
also covers `data/scripts/`.

## Precomputed demos (B6)

```bash
make demo-data                                             # B5: build the Parquet inputs
uv run python -m scripts.precompute_demos --out ../frontend/public/demo   # real weights
uv run python -m scripts.precompute_demos --only manufacturing --out <some dir>
```

- Writes `<out>/<demo_id>/{dataset,health,history,histories,forecast,accuracy,review,factors}.json`
  in the contract shapes (Dataset, HealthReport, SeriesHistory, [SeriesHistory],
  ForecastResult, AccuracyResult, ReviewResult, FactorResult).
- Forecasts carry 30 `sample_paths` per series (possible futures). `accuracy.json` backtests
  every series at the demo horizon from 8 origins (B11 rules).
- Demo ids are `retail` (UCI Online Retail II, 5 product families, primary series `BAGS`,
  horizon 14, so it stops before the Christmas shutdown) and
  `manufacturing` (cement, horizon 12, `additive=false` because it is an index; factor
  check on steel, electricity and coal). They are separate from the frontend's synthetic
  `*-mock` fixtures.
- `forecast.json`, `accuracy.json` and `review.json` cover every usable series, primary first.
  `histories.json` is an array of SeriesHistory in the same order; `history.json` is the
  primary series alone (kept for the current loader). `factors.json` is for the primary series.
- Forecasts use seed 0, so reruns are identical apart from `latency_ms`.
- Every demo forecast includes `step_exceedance_grid` and a non-null `last_year`; the script
  fails if a demo has less than one seasonal cycle of history.
- Also writes `review.json` and, when the dataset has factor columns, `factors.json`.
- **Before writing into `frontend/public/demo`:** that folder belongs to the frontend
  (CLAUDE.md rule 1), and both datasets' licences are unconfirmed (see
  `data/scripts/README.md`). Get the owner's go-ahead first. The owner approved writing
  `retail/` and `manufacturing/` there on 2026-10-24.

## Fast inference (B15)

Measured locally (retail file, 5 items, 2 years daily), before → after:

| What | Before | After |
|---|---|---|
| Model call, 1 item, 14 days (p50) | 230-320 ms | 58 ms |
| Forecast job, 1 item, end to end | ~1.7 s | 0.15-0.2 s |
| Forecast the user asks for right after upload | full run | ready or already running |
| Same request again (any job except review) | full run | instant (job reused) |

- **Threads**: `ZC_TORCH_THREADS` (default: half the CPUs, max 8). PyTorch's default (all
  logical CPUs) was up to 8x slower; containers see the host's CPU count, so Modal sets 4.
- **Warm-up**: one dummy forecast after loading (`ZC_WARMUP`), so the first user call is not
  ~0.7 s slower. It uses its own random generator; seeded results are unchanged (tested).
- **Prewarm after upload**: `ZC_PREWARM` (default on) forecasts the first
  `ZC_PREWARM_MAX_ITEMS` (20) usable items at `ZC_PREWARM_HORIZON` (28, the Forecast page
  default) in the background. It goes through the normal job queue, so a user job submitted
  meanwhile waits for it (about 0.1-0.3 s per item).
- **Job reuse**: each job stores `cache_key` = hash(job type, params). Posting an identical
  request returns the existing queued, running or succeeded job (failed jobs are retried).
  Review jobs are never reused: they include annotations, which can change.
- **Per-item cache** (`series_forecasts` table, migration 0002): every item forecast is stored
  by (dataset, item, horizon, seed) with 50 sample paths, so any later request containing that
  item (any subset, any `return_paths` ≤ 50) skips the model. Datasets never change after upload
  and forecasts are seeded, so stored results stay valid.
- **Weights offline**: `HF_HUB_OFFLINE=1` skips Hugging Face network checks (weight load
  6.1 s → 2.8 s locally). Use it once the weights are cached.
- **Modal** (`modal_app.py`): an `Api` class with a **memory snapshot**. Imports, weights and
  the warm-up forecast run once in `@modal.enter(snap=True)`; later cold starts restore that
  memory. Threads, DB connection and the FastAPI app start after the restore. The container
  stops after 5 idle minutes (`ZC_SCALEDOWN_SECONDS` at deploy time, default 300). Optional
  keep-warm schedule: deploy with `ZC_KEEP_WARM=1` for one container on weekdays
  10:00-18:00 IST (`keep_warm` / `allow_scale_to_zero` cron functions, ~$1/day, ~$22/month).
  Off by default. Change the hours in `modal_app.py`.
- Measure a deployment: `uv run python -m scripts.measure_latency --url <endpoint>`.

Not done: batching several items into one model call (would need care to keep the sample
paths identical to today's), bf16/int8 weights (could change forecasts; needs a backtest
check first), GPU (not worth it for a 272M model at 58 ms per call).

## Deploy (B14): Neon + Modal

Database migrations (Alembic, `backend/migrations/`):
- The app runs `alembic upgrade head` on startup (`app/db.py: init_db`), for SQLite and
  Postgres alike. A database created before migrations existed is stamped first, so existing
  local `storage/zerocast.db` files keep their data. `make migrate` does the same by hand.
- New schema change: edit `app/db.py`, then
  `uv run alembic revision --autogenerate -m "..."` and review the generated file.
  `tests/test_db.py` fails if the migrations and the models drift apart.
- `ZC_DB_URL` accepts Neon's URL as is (`postgresql://...?sslmode=require`); it is switched to
  the psycopg 3 driver, with `pool_pre_ping` and no prepared statements (Neon's pooler).

Modal (`modal_app.py`): FastAPI as a Modal ASGI endpoint, Python 3.11 image built with
`uv sync --frozen --no-dev` (so yug stays pinned to the uv.lock commit), CPU 2 / 4096 MB,
`min_containers=0`, **`max_containers=1`** (single model worker), 5 min scale-down window,
1 h timeout. Volumes: `zerocast-weights` (HF cache, `HF_HOME=/data/hf`) and
`zerocast-uploads` (Parquet files, `ZC_STORAGE_DIR=/data/uploads`). Neon holds metadata only.

One-time setup (owner):
1. **Neon**: create a project → copy the **pooled** connection string.
2. **Modal**: `cd backend && uv run --group deploy modal token new` (browser login), then
   create the secret (Modal dashboard → Secrets → Custom, or CLI):
   ```bash
   uv run --group deploy modal secret create zerocast \
     ZC_DB_URL='postgresql://...-pooler...neon.tech/neondb?sslmode=require' \
     ZC_CORS_ORIGINS='["https://<your-app>.vercel.app"]'
   # optional: HF_TOKEN=hf_...  (higher Hugging Face rate limits)
   ```
3. `make deploy-weights` (downloads ~1.1 GB once into the Volume), then `make deploy`.
   Modal prints the endpoint, e.g. `https://<workspace>--zerocast-api.modal.run`.
4. Check: `curl https://<endpoint>/health` (first call cold-starts: ~20-40 s plus model
   load; `model_loaded` turns true when ready).
5. **Vercel**: set `NEXT_PUBLIC_API_URL` = the endpoint → redeploy.

Cost (Modal Starter: $1 credit at sign-up, $30/month once a card is added): the container
costs ~$0.13/h while up (2 cores + 4 GiB) and $0 when scaled to zero, so a 15 min demo is
~$0.04. `uv run --group deploy modal app stop zerocast` stops it immediately (redeploy to
start again). Do not set `ZC_KEEP_WARM=1` on the $1 credit.

Limits: jobs run in-process in the single container. Polling keeps it alive; if a job runs
with no requests for longer than the scale-down window it can be cut off and is reported as
`failed` (`interrupted`) on the next start. CORS allows only `ZC_CORS_ORIGINS` (Vercel preview
URLs need adding explicitly). Per-IP rate limiting is not implemented yet.

## Deploy: Hugging Face Spaces (free, no card)

A Docker Space on the free "CPU basic" hardware (2 vCPU, 16 GB RAM), with Neon as the database.
`Dockerfile` builds a Python 3.11 image with `uv sync --frozen --no-dev` (yug pinned by
uv.lock), downloads the weights into the image at build time (`HF_HUB_OFFLINE=1` at runtime) and
runs uvicorn on port 7860. One container, so the single model worker rule holds.

One-time setup (owner):
1. Hugging Face account → Settings → Access Tokens → new token with **write** access, then
   `cd backend && uv run hf auth login` and paste it.
2. `make hf-space` (or `uv run python -m scripts.deploy_hf_space --space <user>/<name>`):
   creates the public Space `Mane2305/zerocast-api`, sets the variable `ZC_CORS_ORIGINS`
   (`--cors '["https://<app>.vercel.app"]'`, default localhost:3000) and uploads Dockerfile,
   uv files, `app/`, `migrations/` and the Space card `deploy/hf_space/README.md`.
3. Space → Settings → **Variables and secrets** → New secret `ZC_DB_URL` = Neon's pooled URL.
   The Space restarts with it (without it the app uses SQLite inside the container).
4. Build logs: `https://huggingface.co/spaces/Mane2305/zerocast-api?logs=build` (first build
   ~10 min). Endpoint: `https://mane2305-zerocast-api.hf.space/health`.
5. Redeploy after code changes: `make hf-space` again.

Limits: the Space must be public for the browser to call it (a private Space needs an HF token
on every request), so the backend source is visible; secrets stay hidden. Uploaded files are on
the container disk and are **lost on restart**: datasets uploaded before a restart still appear
in Neon but their data is gone. Free Spaces sleep after 48 h without visits; the next visit
restarts the container (~1 min plus model load). 2 vCPU, so forecasts are slower than locally.

## Configuration

All settings come from environment variables (or a git-ignored `backend/.env` file).
Relative paths are resolved from the directory you start the server in (normally `backend/`).

| Variable | Default | Meaning |
|---|---|---|
| `ZC_ENV` | `local` | `local` or `prod` |
| `ZC_DB_URL` | `sqlite:///./storage/zerocast.db` | SQLAlchemy URL. Deployed: Neon's pooled Postgres URL (B14) |
| `ZC_STORAGE` | `local` | `local` (folder) or `supabase` (Phase 2, not implemented yet) |
| `ZC_STORAGE_DIR` | `./storage/files` | Folder for uploaded files when `ZC_STORAGE=local` |
| `ZC_DEVICE` | `cpu` | `cpu` or `cuda` for the model |
| `ZC_NUM_SAMPLES` | `100` | Sample paths per forecast |
| `ZC_TORCH_THREADS` | half the CPUs, max 8 | Model CPU threads (B15) |
| `ZC_WARMUP` | `true` | Dummy forecast after loading |
| `ZC_PREWARM` | `true` | Forecast the first items right after upload |
| `ZC_PREWARM_HORIZON` | `28` | Horizon of that forecast |
| `ZC_PREWARM_MAX_ITEMS` | `20` | Items in that forecast |
| `HF_HUB_OFFLINE` | unset | `1` = load weights from the cache without network checks |
| `HF_HOME` | HF default | Hugging Face cache (weights); `/data/hf` on Modal |
| `ZC_LOAD_MODEL` | `true` | `false` starts the API without the model (forecast endpoints return 503) |
| `ZC_MODEL_ID` | `birlaailabs/yug` | Hugging Face repo id, or a local folder with `config.json` + `model.safetensors` |
| `ZC_MODEL_REVISION` | — | Optional Hugging Face revision (commit/tag) for the weights; reported as `weights_revision` in `/model/info` (`revision` is the pinned yug code commit) |
| `ZC_CORS_ORIGINS` | `["http://localhost:3000","http://127.0.0.1:3000"]` | JSON list of browser origins allowed to call the API |

`storage/` is git-ignored. Never commit it.

## Layout

```
app/
  main.py        app factory, lifespan wiring, /health
  config.py      Settings (ZC_* env vars)
  db.py          SQLAlchemy engine + tables (datasets, jobs, annotations)
  repository.py  Repository: datasets, jobs, annotations → plain dataclasses
  storage.py     Storage interface (put/get) + LocalStorage
  schemas.py     Pydantic response models mirroring the contract
  engine/        YugEngine, path summaries, tiny test model: the only package importing yug
  api/           routers (datasets, model, jobs)
  jobs.py        JobRunner interface + in-process runner
  services/      health check, dataset ingestion, insights, forecast/review/factor jobs
scripts/         manual scripts (smoke_model, precompute_demos)
tests/
  contract.py    assert_matches_schema(): validates payloads against openapi.yaml
```

## Known limitations

- Tables are created with `create_all` at startup. There are no migrations yet, so if the
  schema changes during Phase 1, delete `storage/zerocast.db`.
- `/model/info` returns 503 while the model is loading. The contract only lists 200 for it.
- A forecast job for 100 series × 256 steps returns about 20 MB of JSON, mostly the step
  exceedance grid. That's fine locally; revisit before Phase 2.
- Job state lives in the DB, but the queue is in memory: a restart fails pending jobs.
