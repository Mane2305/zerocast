"""Precompute demo results as static JSON in the contract shapes (B6).

For each demo it runs the health check and a forecast on the demo Parquet built by
data/scripts (B5), and writes, matching frontend/src/lib/load-demo.ts:

    <out>/<demo_id>/dataset.json    Dataset
    <out>/<demo_id>/history.json    SeriesHistory of the demo's primary series
    <out>/<demo_id>/forecast.json   ForecastResult for the primary series

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
from app.services.datasets import dataset_response, history_from_frame
from app.services.forecast import forecast_series, series_values
from app.services.health_check import run_health_check

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
DEFAULT_OUT = ROOT / "frontend" / "public" / "demo"
SEED = 0


@dataclass(frozen=True)
class DemoSpec:
    demo_id: str
    name: str
    source: Path
    holiday_country: str
    primary_series: str
    horizon: int


DEMOS = (
    DemoSpec(
        demo_id="retail",
        name="Favorita store sales (store 44, Quito)",
        source=PROCESSED / "retail_favorita.parquet",
        holiday_country="EC",
        primary_series="GROCERY I",
        horizon=28,
    ),
    DemoSpec(
        demo_id="manufacturing",
        name="India cement production index (base 2011-12=100)",
        source=PROCESSED / "manufacturing_cement.parquet",
        holiday_country="IN",
        primary_series="cement",
        horizon=12,
    ),
)


def build_demo(spec: DemoSpec, frame: pd.DataFrame, engine: YugEngine) -> dict[str, Any]:
    """Return {"dataset": ..., "history": ..., "forecast": ...} for one demo."""
    health = run_health_check(frame)
    statuses = {s["series_id"]: s["status"] for s in health.series}
    if statuses.get(spec.primary_series, "excluded") == "excluded":
        raise ValueError(f"{spec.demo_id}: primary series {spec.primary_series!r} is not usable")

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
        },
    )
    history = history_from_frame(health.frame, spec.primary_series, health.factor_columns)
    values = series_values(health.frame, spec.primary_series)
    forecast = forecast_series(engine, values, health.frequency, spec.horizon, SEED)
    return {
        "dataset": dataset_response(record),
        "history": history,
        "forecast": {
            "quantile_levels": engine.info()["quantile_levels"],
            "series": [{"series_id": spec.primary_series, **forecast}],
        },
    }


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
