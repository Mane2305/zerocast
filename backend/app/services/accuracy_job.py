"""Accuracy job handler: wires the backtest to the dataset and the engine."""

from collections.abc import Callable
from typing import Any

from app.engine import YugEngine
from app.jobs import Handler, JobFailed, Progress
from app.repository import Repository
from app.services import accuracy
from app.services.forecast import (
    forecast_paths,
    load_series,
    ready_engine,
    round_sig,
    series_values,
)
from app.storage import Storage


def make_accuracy_handler(
    repository: Repository, storage: Storage, engine: Callable[[], YugEngine | None]
) -> Handler:
    def handle(params: dict[str, Any], progress: Progress) -> dict[str, Any]:
        series_ids: list[str] = params["series_ids"]
        record, frame = load_series(repository, storage, params["dataset_id"], series_ids)
        yug = ready_engine(engine())
        frequency = record.meta["frequency"]
        horizon, origins = params["horizon"], params.get("origins") or 8
        levels = yug.info()["quantile_levels"]

        def forecaster(context, h, seed):
            quantiles, paths, _ = forecast_paths(yug, context, h, frequency, seed)
            return quantiles, paths

        backtests = []
        n = len(series_ids)
        for i, sid in enumerate(series_ids):
            progress(100.0 * i / n, f"Backtesting series {i + 1} of {n}")
            backtests.append(
                accuracy.backtest(
                    series_values(frame, sid), horizon, origins, frequency, forecaster
                )
            )
        too_short = [sid for sid, bt in zip(series_ids, backtests, strict=True) if not bt.origins]
        if too_short:
            raise JobFailed(
                "history_too_short",
                "Some series are too short to backtest at this horizon",
                {"series_ids": too_short},
            )
        return {
            "horizon": horizon,
            "origins": max(bt.origins for bt in backtests),
            "series": [
                accuracy.series_result(sid, bt, levels, round_sig)
                for sid, bt in zip(series_ids, backtests, strict=True)
            ],
            "portfolio": accuracy.portfolio(backtests),
        }

    return handle
