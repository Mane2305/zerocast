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
