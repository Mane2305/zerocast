"""Factor-check job handler: wires the two lenses to the dataset and the engine."""

from collections.abc import Callable
from typing import Any

from app.engine import YugEngine
from app.jobs import Handler, JobFailed, Progress
from app.repository import Repository
from app.services import factors
from app.services.forecast import load_series, ready_engine, series_values
from app.storage import Storage


def make_factor_handler(
    repository: Repository, storage: Storage, engine: Callable[[], YugEngine | None]
) -> Handler:
    def handle(params: dict[str, Any], progress: Progress) -> dict[str, Any]:
        sid = params["series_id"]
        record, frame = load_series(repository, storage, params["dataset_id"], [sid])
        available = record.meta["factor_columns"]
        unknown = [f for f in params["factors"] if f not in available]
        if unknown:
            raise JobFailed(
                "factor_not_found",
                "Some factors are not columns of this dataset",
                {"factors": unknown, "available": available},
            )
        yug = ready_engine(engine())
        frequency = record.meta["frequency"]
        horizon = params["horizon"]

        def univariate(context, h, seed):
            return yug.forecast(context, h, frequency, seed=seed).quantiles

        def with_factor(context, factor, h, seed):
            return yug.forecast_with_covariates(context, factor, h, frequency, seed=seed)

        target = series_values(frame, sid).to_numpy()
        columns = {f: series_values(frame, sid, column=f).to_numpy() for f in params["factors"]}
        result = factors.factor_check(
            target,
            columns,
            frequency,
            horizon,
            params["max_lag"],
            univariate,
            with_factor,
            progress,
        )
        return {"series_id": sid, **result}

    return handle
