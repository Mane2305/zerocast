import json

import numpy as np
import pandas as pd
import pytest

from scripts import precompute_demos
from tests.contract import assert_matches_schema


def monthly_frame(months=60) -> pd.DataFrame:
    dates = pd.date_range("2018-01-01", periods=months, freq="MS")
    t = np.arange(months)
    return pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d"),
            "series_id": "cement",
            "target": 100 + 0.5 * t + 8 * np.sin(2 * np.pi * t / 12),
            "steel": 90 + 0.4 * t,
        }
    )


@pytest.fixture
def spec(tmp_path):
    source = tmp_path / "cement.parquet"
    monthly_frame().to_parquet(source, index=False)
    return precompute_demos.DemoSpec(
        demo_id="manufacturing",
        name="Cement",
        source=source,
        holiday_country="IN",
        primary_series="cement",
        horizon=12,
    )


def test_writes_contract_shaped_files(tmp_path, spec, tiny_engine):
    out = tmp_path / "demo"

    written = precompute_demos.precompute([spec], tiny_engine, out)

    assert sorted(p.name for p in written) == [
        "dataset.json",
        "forecast.json",
        "history.json",
        "review.json",
    ]
    dataset = json.loads((out / "manufacturing" / "dataset.json").read_text())
    history = json.loads((out / "manufacturing" / "history.json").read_text())
    forecast = json.loads((out / "manufacturing" / "forecast.json").read_text())

    assert_matches_schema("Dataset", dataset)
    assert_matches_schema("SeriesHistory", history)
    assert_matches_schema("ForecastResult", forecast)
    review = json.loads((out / "manufacturing" / "review.json").read_text())
    assert_matches_schema("ReviewResult", review)
    for series in forecast["series"]:
        assert_matches_schema("SeriesForecast", series)


def test_matches_frontend_loader_rules(tmp_path, spec, tiny_engine):
    """The checks frontend/src/lib/load-demo.ts applies before showing a demo."""
    out = tmp_path / "demo"
    precompute_demos.precompute([spec], tiny_engine, out)
    folder = out / spec.demo_id
    dataset, history, forecast = (
        json.loads((folder / f"{n}.json").read_text()) for n in ("dataset", "history", "forecast")
    )

    assert dataset["dataset_id"] == spec.demo_id
    assert len(history["target"]) == len(history["dates"])
    assert {0.1, 0.5, 0.9} <= set(forecast["quantile_levels"])
    series_ids = {s["series_id"] for s in dataset["series"]}
    for series in forecast["series"]:
        assert series["series_id"] == history["series_id"] and series["series_id"] in series_ids
        assert len(series["quantiles"]) == len(forecast["quantile_levels"])
        assert all(len(row) == len(series["dates"]) for row in series["quantiles"])
        assert len(series["total_distribution"]["percentiles"]) == 101
    assert forecast["series"][0]["dates"][0] == "2023-01-01T00:00:00"


def test_is_deterministic(tmp_path, spec, tiny_engine):
    precompute_demos.precompute([spec], tiny_engine, tmp_path / "a")
    precompute_demos.precompute([spec], tiny_engine, tmp_path / "b")

    a = json.loads((tmp_path / "a" / "manufacturing" / "forecast.json").read_text())
    b = json.loads((tmp_path / "b" / "manufacturing" / "forecast.json").read_text())
    for result in (a, b):  # wall-clock latency is the only thing allowed to change
        for series in result["series"]:
            series.pop("latency_ms")
    assert a == b


def test_missing_source_explains_next_step(tmp_path, spec, tiny_engine):
    missing = precompute_demos.DemoSpec(**{**spec.__dict__, "source": tmp_path / "nope.parquet"})
    with pytest.raises(FileNotFoundError, match="make demo-data"):
        precompute_demos.precompute([missing], tiny_engine, tmp_path / "out")


def test_unusable_primary_series_rejected(tmp_path, spec, tiny_engine):
    bad = precompute_demos.DemoSpec(**{**spec.__dict__, "primary_series": "nope"})
    with pytest.raises(ValueError, match="primary series"):
        precompute_demos.precompute([bad], tiny_engine, tmp_path / "out")


def test_default_demo_ids_differ_from_frontend_mocks():
    ids = {d.demo_id for d in precompute_demos.DEMOS}
    assert ids == {"retail", "manufacturing"}
    assert not ids & {"retail-mock", "manufacturing-mock"}
