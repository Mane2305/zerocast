"""Forecast job: univariate forecast + path summaries + risk metrics for each series."""

from collections.abc import Callable
from typing import Any

import numpy as np
import pandas as pd

from app.engine import YugEngine
from app.engine.summaries import step_exceedance_grid, total_distribution
from app.jobs import Handler, JobFailed, Progress
from app.repository import Repository
from app.services import insights
from app.services.datasets import is_additive, load_frame
from app.services.health_check import format_date, future_dates
from app.storage import Storage

SIGNIFICANT_DIGITS = 6


def round_sig(values: Any, digits: int = SIGNIFICANT_DIGITS) -> Any:
    """Round to significant digits so JSON stays compact without hurting tiny-scale series."""
    a = np.asarray(values, dtype=np.float64)
    with np.errstate(divide="ignore", invalid="ignore"):
        magnitude = np.where(a == 0, 0, np.floor(np.log10(np.abs(a))))
    factor = 10.0 ** (digits - 1 - magnitude)
    return (np.round(a * factor) / factor).tolist()


def ready_engine(engine: YugEngine | None) -> YugEngine:
    if engine is None:
        raise JobFailed("model_disabled", "Model loading is disabled (ZC_LOAD_MODEL=false)")
    try:
        engine.wait_until_loaded()
    except Exception as exc:
        raise JobFailed("model_failed", f"Model failed to load: {exc}") from exc
    return engine


def load_series(repository: Repository, storage: Storage, dataset_id: str, series_ids: list[str]):
    """Return (record, frame) after checking every series exists and is forecastable."""
    record = repository.get_dataset(dataset_id)
    if record is None:
        raise JobFailed("not_found", f"Dataset {dataset_id!r} not found")
    status = {s["series_id"]: s["status"] for s in record.meta["series"]}
    unknown = [sid for sid in series_ids if sid not in status]
    if unknown:
        raise JobFailed(
            "series_not_found", "Some series are not in the dataset", {"series_ids": unknown}
        )
    excluded = [sid for sid in series_ids if status[sid] == "excluded"]
    if excluded:
        raise JobFailed(
            "series_excluded",
            "Some series were excluded by the health check and cannot be forecast",
            {"series_ids": excluded},
        )
    return record, load_frame(record, storage)


def series_values(frame: pd.DataFrame, series_id: str, column: str = "target") -> pd.Series:
    rows = frame[frame["series_id"] == series_id].sort_values("date")
    return pd.Series(rows[column].to_numpy(dtype=np.float64), index=pd.DatetimeIndex(rows["date"]))


def forecast_paths(
    engine: YugEngine, context: np.ndarray, horizon: int, frequency: str, seed: int
) -> tuple[np.ndarray, np.ndarray, float]:
    """(quantiles, paths, latency_ms). Clipped at 0 when the history has no negative values:
    sales and production cannot go below zero. Clipping is monotone, so the quantiles of the
    clipped paths are the clipped quantiles and totals stay consistent with them."""
    out = engine.forecast(context, horizon, frequency, seed=seed)
    quantiles, paths = out.quantiles, out.paths
    observed = context[np.isfinite(context)]
    if observed.size and observed.min() >= 0:
        quantiles, paths = np.maximum(quantiles, 0), np.maximum(paths, 0)
    return quantiles, paths, out.latency_ms


def forecast_series(
    engine: YugEngine,
    history: pd.Series,
    frequency: str,
    horizon: int,
    seed: int,
    additive: bool = True,
    return_paths: int = 0,
) -> dict[str, Any]:
    """`return_paths` > 0 also returns that many sample paths (capped at the sample count)."""
    aggregation = "sum" if additive else "mean"
    quantiles, paths, latency_ms = forecast_paths(
        engine, history.to_numpy(), horizon, frequency, seed
    )
    levels = engine.info()["quantile_levels"]
    future = future_dates(history.index[-1], frequency, horizon)
    return {
        "dates": [format_date(d) for d in future],
        "quantiles": round_sig(quantiles),
        "last_year": insights.last_year_values(history, future, frequency),
        "total_distribution": {
            "percentiles": round_sig(total_distribution(paths, aggregation)),
            "aggregation": aggregation,
        },
        "step_exceedance_grid": {"percentiles": round_sig(step_exceedance_grid(paths))},
        "sample_paths": round_sig(paths[:return_paths]) if return_paths > 0 else None,
        "risk": insights.risk_metrics(quantiles, levels),
        "latency_ms": round(latency_ms, 2),
    }


def make_forecast_handler(
    repository: Repository, storage: Storage, engine: Callable[[], YugEngine | None]
) -> Handler:
    def handle(params: dict[str, Any], progress: Progress) -> dict[str, Any]:
        series_ids: list[str] = params["series_ids"]
        record, frame = load_series(repository, storage, params["dataset_id"], series_ids)
        yug = ready_engine(engine())
        frequency = record.meta["frequency"]
        results = []
        n = len(series_ids)
        for i, sid in enumerate(series_ids):
            progress(100.0 * i / n, f"Forecasting series {i + 1} of {n}")
            history = series_values(frame, sid)
            result = forecast_series(
                yug,
                history,
                frequency,
                params["horizon"],
                params["seed"],
                is_additive(record),
                params.get("return_paths", 0),
            )
            results.append({"series_id": sid, **result})
        return {"quantile_levels": yug.info()["quantile_levels"], "series": results}

    return handle
