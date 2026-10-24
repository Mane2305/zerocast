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

- Writes `<out>/<demo_id>/{dataset,history,histories,forecast,review,factors}.json` in the
  contract shapes (Dataset, SeriesHistory, [SeriesHistory], ForecastResult, ReviewResult,
  FactorResult).
- Demo ids are `retail` (UCI Online Retail II, 5 product families, primary series `BAGS`,
  horizon 14, so it stops before the Christmas shutdown) and
  `manufacturing` (cement, horizon 12, `additive=false` because it is an index; factor
  check on steel, electricity and coal). They are separate from the frontend's synthetic
  `*-mock` fixtures.
- `forecast.json` and `review.json` cover every usable series, primary first.
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

## Configuration

All settings come from environment variables (or a git-ignored `backend/.env` file).
Relative paths are resolved from the directory you start the server in (normally `backend/`).

| Variable | Default | Meaning |
|---|---|---|
| `ZC_ENV` | `local` | `local` or `prod` |
| `ZC_DB_URL` | `sqlite:///./storage/zerocast.db` | SQLAlchemy URL. Phase 2: Supabase Postgres URL |
| `ZC_STORAGE` | `local` | `local` (folder) or `supabase` (Phase 2, not implemented yet) |
| `ZC_STORAGE_DIR` | `./storage/files` | Folder for uploaded files when `ZC_STORAGE=local` |
| `ZC_DEVICE` | `cpu` | `cpu` or `cuda` for the model |
| `ZC_NUM_SAMPLES` | `100` | Sample paths per forecast |
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
