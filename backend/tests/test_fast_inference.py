import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.engine import YugEngine
from app.engine.testing import make_tiny_pipeline
from app.engine.yug_engine import MAX_DEFAULT_THREADS, default_threads
from app.jobs import cache_key
from app.main import create_app
from app.services.forecast import series_cache_key, with_paths

from .conftest import TINY_SAMPLES
from .test_forecast_api import daily_csv, run_job, upload


def test_default_threads_is_bounded(monkeypatch):
    monkeypatch.setattr("os.cpu_count", lambda: 64)
    assert default_threads() == MAX_DEFAULT_THREADS
    monkeypatch.setattr("os.cpu_count", lambda: 1)
    assert default_threads() == 1


def test_warm_up_does_not_change_forecasts(tiny_engine):
    warmed = YugEngine(make_tiny_pipeline, num_samples=TINY_SAMPLES, model_name="tiny", warmup=True)
    warmed.wait_until_loaded()
    context = 50 + np.sin(np.arange(200) / 3)

    ours = warmed.forecast(context, 20, "daily", seed=1)
    reference = tiny_engine.forecast(context, 20, "daily", seed=1)

    np.testing.assert_array_equal(ours.paths, reference.paths)
    warmed.shutdown()


def test_engine_accepts_an_already_loaded_pipeline(tiny_engine):
    """Modal memory snapshots load the model before the engine (and its thread) exist."""
    pipeline = tiny_engine.submit(lambda p: p).result()
    engine = YugEngine(lambda: pipeline, num_samples=TINY_SAMPLES, model_name="tiny")
    engine.wait_until_loaded()
    assert engine.loaded
    engine.shutdown()


def test_cache_key_is_order_insensitive_for_params():
    a = cache_key("forecast", {"horizon": 14, "dataset_id": "d"})
    assert a == cache_key("forecast", {"dataset_id": "d", "horizon": 14})
    assert a != cache_key("forecast", {"dataset_id": "d", "horizon": 15})
    assert a != cache_key("accuracy", {"dataset_id": "d", "horizon": 14})


def test_identical_request_reuses_the_job(model_client):
    dataset_id = upload(model_client)
    body = {"dataset_id": dataset_id, "series_ids": ["A"], "horizon": 7}

    first = run_job(model_client, body)
    again = model_client.post("/jobs/forecast", json=body).json()

    assert again["job_id"] == first["job_id"] and again["status"] == "succeeded"


def test_failed_jobs_are_not_reused(model_client):
    body = {"dataset_id": "missing", "series_ids": ["A"], "horizon": 7}
    first = run_job(model_client, body)
    second = model_client.post("/jobs/forecast", json=body).json()
    assert first["status"] == "failed" and second["job_id"] != first["job_id"]


def test_review_jobs_are_never_reused(model_client):
    """Review results include annotations, which can change after the job ran."""
    dataset_id = upload(model_client)
    body = {"dataset_id": dataset_id, "series_ids": ["A"], "lookback_periods": 14}
    first = model_client.post("/jobs/review", json=body).json()
    assert model_client.app.state.jobs.wait_idle(60)
    assert model_client.post("/jobs/review", json=body).json()["job_id"] != first["job_id"]


def test_item_cache_serves_other_requests_and_path_counts(model_client):
    dataset_id = upload(model_client)
    both = run_job(
        model_client, {"dataset_id": dataset_id, "series_ids": ["A", "B"], "horizon": 10}
    )["result"]["series"]
    calls_before = model_client.app.state.engine.latency_stats()["count"]

    one = run_job(
        model_client,
        {"dataset_id": dataset_id, "series_ids": ["B"], "horizon": 10, "return_paths": 4},
    )["result"]["series"][0]

    assert model_client.app.state.engine.latency_stats()["count"] == calls_before  # no model call
    assert one["quantiles"] == both[1]["quantiles"]
    assert np.array(one["sample_paths"]).shape == (4, 10)
    assert both[0].get("sample_paths") is None


def test_with_paths_slices_the_cached_paths():
    cached = {"quantiles": [[1.0]], "sample_paths": [[1.0], [2.0], [3.0]]}
    assert with_paths(cached, 2)["sample_paths"] == [[1.0], [2.0]]
    assert with_paths(cached, 0)["sample_paths"] is None
    assert series_cache_key("d", "A", 14, 0) != series_cache_key("d", "A|", 14, 0)


@pytest.fixture
def prewarm_client(settings, tiny_engine):
    settings = settings.model_copy(update={"prewarm": True, "prewarm_horizon": 9})
    with TestClient(create_app(settings, engine=tiny_engine)) as client:
        yield client


def test_upload_starts_the_default_forecast(prewarm_client):
    dataset_id = upload(prewarm_client)  # items A, B usable; SHORT excluded
    assert prewarm_client.app.state.jobs.wait_idle(60)
    calls_before = prewarm_client.app.state.engine.latency_stats()["count"]

    job = run_job(
        prewarm_client,
        {"dataset_id": dataset_id, "series_ids": ["A", "B"], "horizon": 9, "return_paths": 0},
    )

    assert job["status"] == "succeeded"
    assert prewarm_client.app.state.engine.latency_stats()["count"] == calls_before
    assert [s["series_id"] for s in job["result"]["series"]] == ["A", "B"]


def test_prewarm_is_limited_to_the_first_items(settings, tiny_engine):
    settings = settings.model_copy(update={"prewarm": True, "prewarm_max_items": 1})
    with TestClient(create_app(settings, engine=tiny_engine)) as client:
        response = client.post("/datasets", files={"file": ("s.csv", daily_csv())})
        assert client.app.state.jobs.wait_idle(60)
        dataset_id = response.json()["dataset_id"]
        jobs = client.app.state.repository
        key = cache_key(
            "forecast",
            {
                "dataset_id": dataset_id,
                "series_ids": ["A"],
                "horizon": 28,
                "seed": 0,
                "return_paths": 0,
            },
        )
        assert jobs.find_reusable_job(key).status == "succeeded"


def test_no_prewarm_without_a_model(settings):
    settings = settings.model_copy(update={"prewarm": True})
    with TestClient(create_app(settings)) as client:
        assert client.post("/datasets", files={"file": ("s.csv", daily_csv())}).status_code == 201
        assert client.app.state.jobs.wait_idle(5)
