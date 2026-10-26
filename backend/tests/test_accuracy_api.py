import numpy as np
import pytest

from tests.contract import assert_matches_schema

from .test_forecast_api import daily_csv, upload


def run(client, body) -> dict:
    response = client.post("/jobs/accuracy", json=body)
    assert response.status_code == 202
    assert_matches_schema("JobRef", response.json())
    assert response.json()["job_type"] == "accuracy"
    assert client.app.state.jobs.wait_idle(120)
    job = client.get(f"/jobs/{response.json()['job_id']}").json()
    assert_matches_schema("Job", job)
    return job


def test_accuracy_job_matches_contract(model_client):
    dataset_id = upload(model_client)

    job = run(
        model_client,
        {"dataset_id": dataset_id, "series_ids": ["A", "B"], "horizon": 14, "origins": 3},
    )

    assert job["status"] == "succeeded", job.get("error")
    result = job["result"]
    assert_matches_schema("AccuracyResult", result)
    assert result["horizon"] == 14 and result["origins"] == 3
    assert [s["series_id"] for s in result["series"]] == ["A", "B"]
    for series in result["series"]:
        assert len(series["backtest"]["dates"]) == 42
        assert series["backtest"]["dates"][-1] == "2024-05-14T00:00:00"  # last history date
        assert [q["level"] for q in series["quantile_coverage"]] == pytest.approx(
            [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
        )
        assert np.all(np.diff([q["observed"] for q in series["quantile_coverage"]]) >= 0)
        assert series["naive_wape"] is not None
    assert result["portfolio"]["wape"] >= 0


def test_series_too_short_to_backtest_fails_the_job(model_client):
    files = {"file": ("short.csv", daily_csv(days=60, series=("A",)))}
    dataset_id = model_client.post("/datasets", files=files).json()["dataset_id"]
    # The only origin (60 - 40 = 20) has fewer than 30 points of context.
    job = run(model_client, {"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 40})
    assert job["status"] == "failed" and job["error"]["code"] == "history_too_short"


@pytest.mark.parametrize(
    "body",
    [
        {"dataset_id": "x", "series_ids": ["A"]},
        {"dataset_id": "x", "series_ids": [f"s{i}" for i in range(21)], "horizon": 5},
        {"dataset_id": "x", "series_ids": ["A"], "horizon": 5, "origins": 0},
    ],
)
def test_invalid_accuracy_request_is_422(client, body):
    response = client.post("/jobs/accuracy", json=body)
    assert response.status_code == 422
    assert_matches_schema("Error", response.json())
