import io

import numpy as np
import pandas as pd
import pytest

from tests.contract import assert_matches_schema

from .conftest import TINY_SAMPLES


def upload(client) -> str:
    n = 300
    rng = np.random.default_rng(2)
    promo = rng.integers(0, 2, n).astype(float)
    df = pd.DataFrame(
        {
            "date": pd.date_range("2024-01-01", periods=n, freq="D").strftime("%Y-%m-%d"),
            "series_id": "A",
            "target": 100 + 30 * promo + rng.normal(0, 3, n),
            "promo": promo,
            "noise": rng.normal(size=n),
        }
    )
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    response = client.post("/datasets", files={"file": ("f.csv", buffer.getvalue().encode())})
    assert response.status_code == 201
    return response.json()["dataset_id"]


def run(client, body) -> dict:
    response = client.post("/jobs/factors", json=body)
    assert response.status_code == 202
    assert response.json()["job_type"] == "factors"
    assert client.app.state.jobs.wait_idle(120)
    job = client.get(f"/jobs/{response.json()['job_id']}").json()
    assert_matches_schema("Job", job)
    return job


def test_factor_job_matches_contract(model_client):
    dataset_id = upload(model_client)

    job = run(
        model_client,
        {"dataset_id": dataset_id, "series_id": "A", "factors": ["promo", "noise"], "horizon": 14},
    )

    assert job["status"] == "succeeded", job.get("error")
    result = job["result"]
    assert_matches_schema("FactorResult", result)
    assert result["series_id"] == "A" and result["baseline_wql"] > 0
    by_name = {f["factor"]: f for f in result["factors"]}
    assert by_name["promo"]["related"]["is_related"] is True
    assert by_name["promo"]["related"]["best_lag"] == 0
    assert by_name["noise"]["related"]["is_related"] is False
    for item in result["factors"]:
        assert item["verdict"] in {
            "use_it",
            "real_driver_yug_cannot_use",
            "helps_yug_unclear_link",
            "probably_drop",
        }
        assert {"helps", "wql_with_factor", "change_pct", "ci_low", "ci_high"} <= set(
            item["helps_yug"]
        )


def test_unknown_factor_fails_job(model_client):
    dataset_id = upload(model_client)
    job = run(model_client, {"dataset_id": dataset_id, "series_id": "A", "factors": ["price"]})
    assert job["status"] == "failed" and job["error"]["code"] == "factor_not_found"
    assert job["error"]["details"]["available"] == ["promo", "noise"]


@pytest.mark.parametrize(
    "body",
    [
        {"dataset_id": "x", "series_id": "A", "factors": ["p"], "horizon": 65},
        {"dataset_id": "x", "series_id": "A", "factors": []},
        {"dataset_id": "x", "series_id": "A", "factors": [f"f{i}" for i in range(11)]},
    ],
)
def test_factor_request_validation(client, body):
    response = client.post("/jobs/factors", json=body)
    assert response.status_code == 422
    assert_matches_schema("Error", response.json())


def test_covariate_forecast_matches_pipeline(tiny_engine):
    rng = np.random.default_rng(0)
    target = (50 + rng.normal(size=200)).astype(np.float32)
    factor = rng.normal(size=200).astype(np.float32)

    ours = tiny_engine.forecast_with_covariates(target, factor, 20, "daily", seed=3)

    def reference(pipeline):
        stack = np.stack([target, factor])
        return pipeline.predict([stack], 20, freq="D", num_samples=TINY_SAMPLES, seed=3).values[0]

    np.testing.assert_array_equal(ours, tiny_engine.submit(reference).result())
    assert ours.shape == (9, 20)


def test_covariate_forecast_guards(tiny_engine):
    target = np.ones(100) + np.arange(100)
    with pytest.raises(ValueError, match="horizon"):
        tiny_engine.forecast_with_covariates(target, np.zeros(100), 65, "daily")
    with pytest.raises(ValueError, match="aligned"):
        tiny_engine.forecast_with_covariates(target, np.zeros(99), 10, "daily")
    with_inf = np.zeros(100)
    with_inf[3] = np.inf
    assert tiny_engine.forecast_with_covariates(target, with_inf, 5, "daily").shape == (9, 5)
