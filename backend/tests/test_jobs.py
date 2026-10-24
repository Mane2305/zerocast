import threading

import pytest

from app.jobs import InProcessJobRunner, JobFailed
from app.repository import JobRecord


def run(runner: InProcessJobRunner, job_type: str, params=None):
    job_id = runner.submit(job_type, params or {})
    assert runner.wait_idle(10)
    return runner.status(job_id)


@pytest.fixture
def make_runner(repository):
    runners = []

    def build(handlers):
        runner = InProcessJobRunner(repository, handlers)
        runners.append(runner)
        return runner

    yield build
    for runner in runners:
        runner.shutdown()


def test_successful_job_reports_progress_and_result(make_runner):
    seen = []

    def handler(params, progress):
        progress(50, "Halfway")
        seen.append(params)
        return {"answer": params["x"] * 2}

    job = run(make_runner({"forecast": handler}), "forecast", {"x": 21})

    assert job.status == "succeeded" and job.progress == 100.0
    assert job.result == {"answer": 42} and job.message == "Halfway"
    assert job.finished_at is not None and job.error is None
    assert seen == [{"x": 21}]


def test_job_failed_stores_contract_error(make_runner):
    def handler(params, progress):
        raise JobFailed("series_not_found", "nope", {"series_ids": ["Z"]})

    job = run(make_runner({"forecast": handler}), "forecast")

    assert job.status == "failed"
    assert job.error == {
        "code": "series_not_found",
        "message": "nope",
        "details": {"series_ids": ["Z"]},
    }
    assert job.result is None


def test_crash_becomes_internal_error(make_runner):
    def handler(params, progress):
        raise ZeroDivisionError("boom")

    job = run(make_runner({"forecast": handler}), "forecast")

    assert job.status == "failed" and job.error["code"] == "internal_error"


def test_jobs_run_one_at_a_time(make_runner):
    active, peak = 0, 0
    lock = threading.Lock()

    def handler(params, progress):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        threading.Event().wait(0.02)
        with lock:
            active -= 1
        return {}

    runner = make_runner({"forecast": handler})
    ids = [runner.submit("forecast", {}) for _ in range(5)]
    assert runner.wait_idle(10)

    assert peak == 1
    assert {runner.status(i).status for i in ids} == {"succeeded"}


def test_progress_is_clamped(make_runner):
    def handler(params, progress):
        progress(250)
        return {}

    runner = make_runner({"forecast": handler})
    assert run(runner, "forecast").progress == 100.0


def test_unknown_job_type_rejected(make_runner):
    with pytest.raises(ValueError):
        make_runner({}).submit("forecast", {})


def test_unfinished_jobs_from_previous_run_marked_failed(repository, make_runner):
    stale = repository.add_job(JobRecord(job_type="forecast", status="running"))

    make_runner({"forecast": lambda p, progress: {}})

    job = repository.get_job(stale.job_id)
    assert job.status == "failed" and job.error["code"] == "interrupted"
