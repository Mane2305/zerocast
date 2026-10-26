import json

import numpy as np
import pandas as pd
import pytest

from scripts import precompute_demos
from tests.contract import assert_matches_schema

from .conftest import TINY_SAMPLES


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
        "accuracy.json",
        "dataset.json",
        "factors.json",
        "forecast.json",
        "health.json",
        "histories.json",
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
    factor_result = json.loads((out / "manufacturing" / "factors.json").read_text())
    assert_matches_schema("FactorResult", factor_result)
    assert [f["factor"] for f in factor_result["factors"]] == ["steel"]
    for series in forecast["series"]:
        assert_matches_schema("SeriesForecast", series)
        # 30 requested, capped at the tiny engine's 20 samples
        assert np.array(series["sample_paths"]).shape == (min(30, TINY_SAMPLES), 12)
    accuracy_result = json.loads((out / "manufacturing" / "accuracy.json").read_text())
    assert_matches_schema("AccuracyResult", accuracy_result)
    assert accuracy_result["origins"] == 2  # 60 months: origins at 36 and 48
    assert [s["series_id"] for s in accuracy_result["series"]] == ["cement"]
    assert_matches_schema(
        "HealthReport", json.loads((out / "manufacturing" / "health.json").read_text())
    )
    for item in json.loads((out / "manufacturing" / "histories.json").read_text()):
        assert_matches_schema("SeriesHistory", item)


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
    histories = json.loads((folder / "histories.json").read_text())
    series_ids = {s["series_id"] for s in dataset["series"]}
    assert forecast["series"][0]["series_id"] == history["series_id"] == spec.primary_series
    assert [h["series_id"] for h in histories] == [s["series_id"] for s in forecast["series"]]
    for series in forecast["series"]:
        assert series["series_id"] in series_ids
        assert len(series["quantiles"]) == len(forecast["quantile_levels"])
        assert all(len(row) == len(series["dates"]) for row in series["quantiles"])
        assert len(series["total_distribution"]["percentiles"]) == 101
        grid = series["step_exceedance_grid"]["percentiles"]
        assert len(grid) == 99 and all(len(row) == len(series["dates"]) for row in grid)
        assert series["last_year"] is not None and len(series["last_year"]) == len(series["dates"])
    assert forecast["series"][0]["dates"][0] == "2023-01-01T00:00:00"


def two_series_spec(tmp_path, spec, **changes):
    frame = monthly_frame()
    other = frame.assign(series_id="clinker", target=frame["target"] * 1.1)
    source = tmp_path / "two.parquet"
    pd.concat([other, frame]).to_parquet(source, index=False)
    return precompute_demos.DemoSpec(**{**spec.__dict__, "source": source, **changes})


def test_every_usable_series_is_precomputed_primary_first(tmp_path, spec, tiny_engine):
    two = two_series_spec(tmp_path, spec)
    out = tmp_path / "out"
    precompute_demos.precompute([two], tiny_engine, out)
    folder = out / two.demo_id

    forecast = json.loads((folder / "forecast.json").read_text())
    review = json.loads((folder / "review.json").read_text())
    histories = json.loads((folder / "histories.json").read_text())
    assert [s["series_id"] for s in forecast["series"]] == ["cement", "clinker"]
    assert [s["series_id"] for s in review["series"]] == ["cement", "clinker"]
    assert [h["series_id"] for h in histories] == ["cement", "clinker"]
    assert json.loads((folder / "factors.json").read_text())["series_id"] == "cement"


def test_non_additive_demo_reports_means(tmp_path, spec, tiny_engine):
    index = precompute_demos.DemoSpec(**{**spec.__dict__, "additive": False})
    out = tmp_path / "out"
    precompute_demos.precompute([index], tiny_engine, out)
    folder = out / index.demo_id

    dataset = json.loads((folder / "dataset.json").read_text())
    series = json.loads((folder / "forecast.json").read_text())["series"][0]
    review_series = json.loads((folder / "review.json").read_text())["series"][0]
    assert dataset["additive"] is False
    assert series["total_distribution"]["aggregation"] == "mean"
    # A horizon mean stays on the scale of a single step; a total would be ~12x larger.
    p50_total = series["total_distribution"]["percentiles"][50]
    assert min(series["quantiles"][0]) <= p50_total <= max(series["quantiles"][-1])
    assert review_series["aggregation"] == "mean"


def test_factor_subset(tmp_path, spec, tiny_engine):
    frame = monthly_frame().assign(coal=lambda f: f["steel"] * 0.5 + 3)
    source = tmp_path / "factors.parquet"
    frame.to_parquet(source, index=False)
    subset = precompute_demos.DemoSpec(**{**spec.__dict__, "source": source, "factors": ("coal",)})
    precompute_demos.precompute([subset], tiny_engine, tmp_path / "out")
    result = json.loads((tmp_path / "out" / subset.demo_id / "factors.json").read_text())
    assert [f["factor"] for f in result["factors"]] == ["coal"]

    unknown = precompute_demos.DemoSpec(**{**spec.__dict__, "factors": ("oil",)})
    with pytest.raises(ValueError, match="oil"):
        precompute_demos.precompute([unknown], tiny_engine, tmp_path / "out2")


def test_cement_demo_spec_matches_review_fixes():
    cement = next(d for d in precompute_demos.DEMOS if d.demo_id == "manufacturing")
    assert cement.additive is False
    assert cement.factors == ("steel", "electricity", "coal")


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


def test_short_history_without_last_year_rejected(tmp_path, spec, tiny_engine):
    source = tmp_path / "short.parquet"
    days = pd.date_range("2024-01-01", periods=60, freq="D").strftime("%Y-%m-%d")
    pd.DataFrame({"date": days, "series_id": "cement", "target": np.arange(60.0)}).to_parquet(
        source, index=False
    )
    short = precompute_demos.DemoSpec(**{**spec.__dict__, "source": source})
    with pytest.raises(ValueError, match="last-year"):
        precompute_demos.precompute([short], tiny_engine, tmp_path / "out")


def test_default_demo_ids_differ_from_frontend_mocks():
    ids = {d.demo_id for d in precompute_demos.DEMOS}
    assert ids == {"retail", "manufacturing"}
    assert not ids & {"retail-mock", "manufacturing-mock"}
