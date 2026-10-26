"""Precompute demo results as static JSON in the contract shapes (B6).

For each demo it runs the health check and a forecast on the demo Parquet built by
data/scripts (B5), and writes, matching frontend/src/lib/load-demo.ts:

    <out>/<demo_id>/dataset.json    Dataset
    <out>/<demo_id>/history.json    SeriesHistory of the demo's primary series
    <out>/<demo_id>/histories.json  [SeriesHistory] for every forecast series, primary first
    <out>/<demo_id>/forecast.json   ForecastResult for every usable series, primary first,
                                    with 30 sample paths each (possible futures)
    <out>/<demo_id>/accuracy.json   AccuracyResult (backtest) for the same series
    <out>/<demo_id>/review.json     ReviewResult (year in review) for the same series
    <out>/<demo_id>/health.json     HealthReport (also inside dataset.json)
    <out>/<demo_id>/factors.json    FactorResult for the primary series (if it has factors)

    cd backend
    uv run python -m scripts.precompute_demos --out ../frontend/public/demo   # needs real weights
    uv run python -m scripts.precompute_demos --only manufacturing --out /tmp/demo
"""

import argparse
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import get_settings
from app.engine import YugEngine
from app.main import build_engine
from app.repository import DatasetRecord
from app.services import accuracy, factors, review
from app.services.datasets import dataset_response, history_from_frame
from app.services.forecast import forecast_paths, forecast_series, round_sig, series_values
from app.services.health_check import run_health_check

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
DEFAULT_OUT = ROOT / "frontend" / "public" / "demo"
SEED = 0
RETURN_PATHS = 30


@dataclass(frozen=True)
class DemoSpec:
    demo_id: str
    name: str
    source: Path
    holiday_country: str
    primary_series: str
    horizon: int
    factor_horizon: int = 28
    # False for an index or a price: horizon results describe the mean, not the total.
    additive: bool = True
    # Factor columns to check; None checks every factor column in the dataset.
    factors: tuple[str, ...] | None = None
    accuracy_origins: int = 8


DEMOS = (
    DemoSpec(
        demo_id="retail",
        name="UK online gift retailer, units sold by product family (UCI Online Retail II)",
        source=PROCESSED / "retail_online.parquet",
        holiday_country="GB",
        primary_series="BAGS",
        # The data ends on Fri 9 Dec 2011; 14 days stops before the Christmas shutdown,
        # which Yug cannot anticipate from two seasons of history.
        horizon=14,
    ),
    DemoSpec(
        demo_id="manufacturing",
        name="India cement production index (base 2011-12=100)",
        source=PROCESSED / "manufacturing_cement.parquet",
        holiday_country="IN",
        primary_series="cement",
        horizon=12,
        factor_horizon=6,
        additive=False,
        factors=("steel", "electricity", "coal"),
    ),
)


def build_demo(spec: DemoSpec, frame: pd.DataFrame, engine: YugEngine) -> dict[str, Any]:
    """Return {file name: payload} for one demo."""
    health = run_health_check(frame)
    statuses = {s["series_id"]: s["status"] for s in health.series}
    if statuses.get(spec.primary_series, "excluded") == "excluded":
        raise ValueError(f"{spec.demo_id}: primary series {spec.primary_series!r} is not usable")
    series_ids = [spec.primary_series] + [
        sid
        for sid, status in statuses.items()
        if status != "excluded" and sid != spec.primary_series
    ]

    record = DatasetRecord(
        dataset_id=spec.demo_id,
        name=spec.name,
        storage_key="",
        holiday_country=spec.holiday_country,
        created_at=datetime.now(UTC).replace(microsecond=0),
        meta={
            "frequency": health.frequency,
            "factor_columns": health.factor_columns,
            "date_range": health.date_range,
            "series": health.series,
            "health": health.report,
            "additive": spec.additive,
        },
    )
    histories, forecasts, reviews, backtests = [], [], [], []
    for sid in series_ids:
        values = series_values(health.frame, sid)
        forecast = forecast_series(
            engine, values, health.frequency, spec.horizon, SEED, spec.additive, RETURN_PATHS
        )
        # Demos must always show the capacity-risk grid and the last-year overlay.
        if not forecast["step_exceedance_grid"]["percentiles"] or forecast["last_year"] is None:
            raise ValueError(
                f"{spec.demo_id}/{sid}: needs at least one year of history for the last-year "
                "overlay"
            )
        histories.append(history_from_frame(health.frame, sid, health.factor_columns))
        forecasts.append({"series_id": sid, **forecast})
        reviews.append(review_series(spec, sid, values, health.frequency, engine))
        backtests.append(backtest_series(spec, values, health.frequency, engine))
    if not all(bt.origins for bt in backtests):
        raise ValueError(f"{spec.demo_id}: some series are too short to backtest")
    levels = engine.info()["quantile_levels"]
    files = {
        "dataset": dataset_response(record),
        "health": health.report,
        "accuracy": {
            "horizon": spec.horizon,
            "origins": max(bt.origins for bt in backtests),
            "series": [
                accuracy.series_result(sid, bt, levels, round_sig)
                for sid, bt in zip(series_ids, backtests, strict=True)
            ],
            "portfolio": accuracy.portfolio(backtests),
        },
        "review": {"series": reviews},
        "history": histories[0],
        "histories": histories,
        "forecast": {"quantile_levels": engine.info()["quantile_levels"], "series": forecasts},
    }
    columns = list(spec.factors) if spec.factors is not None else health.factor_columns
    missing = sorted(set(columns) - set(health.factor_columns))
    if missing:
        raise ValueError(f"{spec.demo_id}: factors not in the dataset: {missing}")
    if columns:
        files["factors"] = factor_demo(spec, health.frame, columns, health.frequency, engine)
    return files


def model_forecaster(engine: YugEngine, frequency: str):
    def forecaster(context, horizon, seed):
        quantiles, paths, _ = forecast_paths(engine, context, horizon, frequency, seed)
        return quantiles, paths

    return forecaster


def backtest_series(
    spec: DemoSpec, values: pd.Series, frequency: str, engine: YugEngine
) -> accuracy.Backtest:
    forecaster = model_forecaster(engine, frequency)
    return accuracy.backtest(
        values, spec.horizon, spec.accuracy_origins, frequency, forecaster, seed=SEED
    )


def review_series(
    spec: DemoSpec, series_id: str, values: pd.Series, frequency: str, engine: YugEngine
) -> dict:
    lookback, step = review.default_window(frequency)
    forecaster = model_forecaster(engine, frequency)
    periods = review.replay(values, lookback, step, forecaster, seed=SEED)
    events = review.calendar_events([p.date for p in periods], frequency, spec.holiday_country)
    return review.summarize(series_id, periods, events, {}, 5, frequency, spec.additive)


def factor_demo(
    spec: DemoSpec, frame: pd.DataFrame, columns: list[str], frequency: str, engine: YugEngine
) -> dict:
    target = series_values(frame, spec.primary_series).to_numpy()
    values = {c: series_values(frame, spec.primary_series, column=c).to_numpy() for c in columns}

    def univariate(ctx, h, seed):
        return engine.forecast(ctx, h, frequency, seed=seed).quantiles

    def with_factor(ctx, fac, h, seed):
        return engine.forecast_with_covariates(ctx, fac, h, frequency, seed=seed)

    result = factors.factor_check(
        target, values, frequency, spec.factor_horizon, 3, univariate, with_factor
    )
    return {"series_id": spec.primary_series, **result}


def write_demo(out_dir: Path, demo_id: str, files: dict[str, Any]) -> list[Path]:
    target = out_dir / demo_id
    target.mkdir(parents=True, exist_ok=True)
    written = []
    for name, payload in files.items():
        path = target / f"{name}.json"
        path.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False), "utf-8")
        written.append(path)
    return written


def precompute(specs, engine: YugEngine, out_dir: Path) -> list[Path]:
    written: list[Path] = []
    for spec in specs:
        if not spec.source.exists():
            raise FileNotFoundError(f"{spec.source} not found; run `make demo-data` first")
        frame = pd.read_parquet(spec.source)
        written += write_demo(out_dir, spec.demo_id, build_demo(spec, frame, engine))
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--only", nargs="+", choices=[d.demo_id for d in DEMOS])
    args = parser.parse_args()

    specs = [d for d in DEMOS if not args.only or d.demo_id in args.only]
    settings = get_settings()
    engine = build_engine(settings.model_copy(update={"load_model": True}))
    try:
        engine.wait_until_loaded()
        for path in precompute(specs, engine, args.out):
            print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")
    finally:
        engine.shutdown()


if __name__ == "__main__":
    main()
