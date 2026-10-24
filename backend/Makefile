UV ?= uv
LINT_PATHS = . ../data/scripts

.PHONY: install test lint format run demo-data

install:
	$(UV) sync

test: lint
	$(UV) run pytest

lint:
	$(UV) run ruff check --config pyproject.toml $(LINT_PATHS)
	$(UV) run ruff format --check --config pyproject.toml $(LINT_PATHS)

format:
	$(UV) run ruff check --fix --config pyproject.toml $(LINT_PATHS)
	$(UV) run ruff format --config pyproject.toml $(LINT_PATHS)

run:
	$(UV) run uvicorn app.main:app --reload --port 8000

# Needs the raw files in ../data/raw (see ../data/scripts/README.md).
demo-data:
	$(UV) run python ../data/scripts/build_cement.py
	$(UV) run python ../data/scripts/build_online_retail.py
