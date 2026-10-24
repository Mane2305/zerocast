"""Review job handler: wires the replay logic to the dataset, engine and annotations."""

from collections import defaultdict
from collections.abc import Callable
from typing import Any

from app.engine import YugEngine
from app.jobs import Handler, Progress
from app.repository import Repository
from app.services import review
from app.services.forecast import load_series, ready_engine, series_values
from app.storage import Storage


def make_review_handler(
    repository: Repository, storage: Storage, engine: Callable[[], YugEngine | None]
) -> Handler:
    def handle(params: dict[str, Any], progress: Progress) -> dict[str, Any]:
        series_ids: list[str] = params["series_ids"]
        record, frame = load_series(repository, storage, params["dataset_id"], series_ids)
        yug = ready_engine(engine())
        frequency = record.meta["frequency"]
        default_lookback, default_step = review.default_window(frequency)
        lookback = params.get("lookback_periods") or default_lookback
        step = params.get("step") or default_step
        top_n = params.get("top_n") or 5

        notes: dict[str, dict[str, str]] = defaultdict(dict)
        for note in repository.list_annotations(record.dataset_id):
            notes[note.series_id][note.date] = note.text

        def forecaster(context, horizon, seed):
            out = yug.forecast(context, horizon, frequency, seed=seed)
            return out.quantiles, out.paths

        results = []
        n = len(series_ids)
        for i, sid in enumerate(series_ids):
            progress(100.0 * i / n, f"Replaying series {i + 1} of {n}")
            periods = review.replay(series_values(frame, sid), lookback, step, forecaster)
            events = review.calendar_events(
                [p.date for p in periods], frequency, record.holiday_country
            )
            results.append(review.summarize(sid, periods, events, notes[sid], top_n, frequency))
        return {"series": results}

    return handle
