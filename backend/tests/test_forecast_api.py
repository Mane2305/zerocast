import io

import numpy as np
import pandas as pd
import pytest

from app.services.forecast import forecast_paths
from tests.contract import assert_matches_schema

from .conftest import TINY_SAMPLES


def daily_csv(days=500, series=("A", "B")) -> bytes:
    dates = pd.date_range("2023-01-01", periods=days, freq="D")
    rng = np.random.default_rng(0)
    frames = [
        pd.DataFrame(
            {
                "date": dates.strftime("%Y-%m-%d"),
                "series_id": sid,
                "target": 50
                + 10 * np.sin(2 * np.pi * np.arange(days) / 7)
                + rng.normal(0, 2, days),
            }
        )
        for sid in series
    ]
    short = pd.DataFrame(
        {"date": dates[:10].strftime("%Y-%m-%d"), "series_id": "SHORT", "target": 1.0}
    )
    buffer = io.StringIO()
    pd.concat([*frames, short]).to_csv(buffer, index=False)
    return buffer.getvalue().encode()


def upload(client, **form) -> str:
    response = client.post("/datasets", files={"file": ("sales.csv", daily_csv())}, data=form)
    assert response.status_code == 201
    return response.json()["dataset_id"]


def run_job(client, body) -> dict:
    response = client.post("/jobs/forecast", json=body)
    assert response.status_code == 202
    ref = response.json()
    assert_matches_schema("JobRef", ref)
    assert ref["job_type"] == "forecast"
    assert client.app.state.jobs.wait_idle(60)
    job = client.get(f"/jobs/{ref['job_id']}").json()
    assert_matches_schema("Job", job)
    return job


def test_forecast_job_matches_contract(model_client):
    dataset_id = upload(model_client)

    job = run_job(model_client, {"dataset_id": dataset_id, "series_ids": ["A", "B"], "horizon": 30})

    assert job["status"] == "succeeded", job.get("error")
    assert job["progress"] == 100 and job["error"] is None and job["finished_at"]
    result = job["result"]
    assert_matches_schema("ForecastResult", result)
    assert result["quantile_levels"] == [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    assert [s["series_id"] for s in result["series"]] == ["A", "B"]
    for series in result["series"]:
        assert_matches_schema("SeriesForecast", series)
        assert_matches_schema("RiskMetrics", series["risk"])
        assert len(series["dates"]) == 30
        assert np.array(series["quantiles"]).shape == (9, 30)
        assert len(series["total_distribution"]["percentiles"]) == 101
        assert np.array(series["step_exceedance_grid"]["percentiles"]).shape == (99, 30)
        assert len(series["last_year"]) == 30
        assert series["dates"][0] == "2024-05-15T00:00:00"  # day after the last history date
        quantiles = np.array(series["quantiles"])
        assert np.all(np.diff(quantiles, axis=0) >= 0)
        assert series.get("sample_paths") is None  # return_paths defaults to 0


def test_return_paths_returns_sample_paths(model_client):
    dataset_id = upload(model_client)
    body = {"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 12, "return_paths": 5}

    series = run_job(model_client, body)["result"]["series"][0]

    assert_matches_schema("SeriesForecast", series)
    paths = np.array(series["sample_paths"])
    assert paths.shape == (5, 12) and np.all(np.isfinite(paths))


def test_return_paths_is_capped_at_the_sample_count(model_client):
    dataset_id = upload(model_client)
    body = {"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 6, "return_paths": 50}

    series = run_job(model_client, body)["result"]["series"][0]

    assert np.array(series["sample_paths"]).shape == (TINY_SAMPLES, 6)


def test_total_distribution_comes_from_paths(model_client):
    dataset_id = upload(model_client)
    job = run_job(model_client, {"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 192})
    series = job["result"]["series"][0]

    totals = np.array(series["total_distribution"]["percentiles"])
    summed_p10 = np.array(series["quantiles"][0]).sum()

    assert np.all(np.diff(totals) >= 0)
    # Yug draws one uniform per 64-step block, so paths are comonotone within a block but not
    # across blocks: over three blocks the P10 of the total is not the sum of per-step P10s.
    assert totals[10] != pytest.approx(summed_p10, rel=1e-3)


def test_same_seed_same_result(model_client):
    dataset_id = upload(model_client)
    body = {"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 10, "seed": 5}

    first = run_job(model_client, body)["result"]["series"][0]["quantiles"]
    second = run_job(model_client, body)["result"]["series"][0]["quantiles"]

    assert first == second


@pytest.mark.parametrize(
    ("series_ids", "code"),
    [(["A", "NOPE"], "series_not_found"), (["SHORT"], "series_excluded")],
)
def test_bad_series_fail_the_job(model_client, series_ids, code):
    dataset_id = upload(model_client)

    job = run_job(model_client, {"dataset_id": dataset_id, "series_ids": series_ids, "horizon": 5})

    assert job["status"] == "failed" and job["result"] is None
    assert_matches_schema("Error", job["error"])
    assert job["error"]["code"] == code


def test_unknown_dataset_fails_the_job(model_client):
    job = run_job(model_client, {"dataset_id": "missing", "series_ids": ["A"], "horizon": 5})
    assert job["error"]["code"] == "not_found"


def test_model_disabled_fails_the_job(client):
    dataset_id = upload(client)
    job = run_job(client, {"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 5})
    assert job["error"]["code"] == "model_disabled"


@pytest.mark.parametrize(
    "body",
    [
        {"dataset_id": "x", "series_ids": [], "horizon": 5},
        {"dataset_id": "x", "series_ids": ["A"], "horizon": 257},
        {"dataset_id": "x", "series_ids": [f"s{i}" for i in range(101)], "horizon": 5},
        {"dataset_id": "x", "series_ids": ["A"]},
        {"dataset_id": "x", "series_ids": ["A"], "horizon": 5, "return_paths": 51},
        {"dataset_id": "x", "series_ids": ["A"], "horizon": 5, "return_paths": -1},
    ],
)
def test_invalid_request_is_422(client, body):
    response = client.post("/jobs/forecast", json=body)
    assert response.status_code == 422
    assert_matches_schema("Error", response.json())


def test_unknown_job_is_404(client):
    response = client.get("/jobs/nope")
    assert response.status_code == 404
    assert_matches_schema("Error", response.json())


def test_running_job_has_no_result_field_set(model_client):
    dataset_id = upload(model_client)
    response = model_client.post(
        "/jobs/forecast", json={"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 5}
    )
    job = model_client.get(f"/jobs/{response.json()['job_id']}").json()
    assert_matches_schema("Job", job)
    if job["status"] != "succeeded":
        assert job["result"] is None
    model_client.app.state.jobs.wait_idle(60)


def test_tiny_samples_used(model_client):
    assert model_client.app.state.engine.num_samples == TINY_SAMPLES


def test_forecasts_of_non_negative_series_are_clipped_at_zero(tiny_engine):
    rng = np.random.default_rng(4)
    sales = np.where(np.arange(120) % 7 == 5, 0.0, rng.uniform(0, 10, 120))  # closed Saturdays

    quantiles, paths, _ = forecast_paths(tiny_engine, sales, 14, "daily", seed=0)
    raw = tiny_engine.forecast(sales, 14, "daily", seed=0)

    assert quantiles.min() >= 0 and paths.min() >= 0
    np.testing.assert_array_equal(quantiles, np.maximum(raw.quantiles, 0))
    np.testing.assert_array_equal(paths, np.maximum(raw.paths, 0))


def test_series_with_negative_history_are_not_clipped(tiny_engine):
    profit = np.sin(np.arange(120) / 5.0) * 10  # genuinely goes below zero
    quantiles, paths, _ = forecast_paths(tiny_engine, profit, 14, "daily", seed=0)
    raw = tiny_engine.forecast(profit, 14, "daily", seed=0)
    np.testing.assert_array_equal(quantiles, raw.quantiles)
    np.testing.assert_array_equal(paths, raw.paths)


def test_non_additive_dataset_forecasts_the_horizon_mean(model_client):
    body = {"series_ids": ["A"], "horizon": 12}
    total = run_job(model_client, {**body, "dataset_id": upload(model_client)})
    mean = run_job(model_client, {**body, "dataset_id": upload(model_client, additive="false")})

    total_series, mean_series = total["result"]["series"][0], mean["result"]["series"][0]
    assert total_series["total_distribution"]["aggregation"] == "sum"
    assert mean_series["total_distribution"]["aggregation"] == "mean"
    np.testing.assert_allclose(
        mean_series["total_distribution"]["percentiles"],
        np.array(total_series["total_distribution"]["percentiles"]) / 12,
        rtol=1e-5,
    )
