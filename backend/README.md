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

## Datasets (B3)

```bash
curl -F file=@sales.csv -F name="Store sales" -F holiday_country=IN http://localhost:8000/datasets
curl http://localhost:8000/datasets/<dataset_id>
curl http://localhost:8000/datasets/<dataset_id>/series/<series_id>
```

- Accepts Parquet (detected by content) or UTF-8 CSV in the universal long template
  (`date`, `series_id`, `target`, optional numeric factor columns), max 50 MB.
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
  engine/        Yug engine (task B2): the only module allowed to import yug
tests/
  contract.py    assert_matches_schema(): validates payloads against openapi.yaml
```

## Known limitations

- Tables are created with `create_all` at startup. There are no migrations yet, so if the
  schema changes during Phase 1, delete `storage/zerocast.db`.
- `/health` always reports `model_loaded: false` until the Yug engine lands (B2).
