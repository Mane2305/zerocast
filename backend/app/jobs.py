"""JobRunner interface and the Phase 1 in-process implementation.

Jobs run one at a time on a background thread; their state lives in the Repository so the
API can poll it. Model calls inside a job still go through the YugEngine worker.
Phase 2 replaces InProcessJobRunner with a Modal-backed runner using the same interface.
"""

import hashlib
import json
import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Protocol

from app.repository import JobRecord, Repository, utcnow

logger = logging.getLogger(__name__)

JOB_TYPES = ("forecast", "review", "factors", "accuracy")
# Results that depend on more than (dataset, params): the review includes annotations.
UNCACHED_JOB_TYPES = {"review"}


def cache_key(job_type: str, params: dict[str, Any]) -> str:
    """Datasets are immutable after upload and every model call is seeded, so the same
    (job_type, params) always gives the same result."""
    text = json.dumps({"job_type": job_type, "params": params}, sort_keys=True, default=str)
    return hashlib.sha256(text.encode()).hexdigest()


class JobFailed(Exception):
    """Raised by a handler to fail a job with a contract Error (code, message, details)."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    def as_error(self) -> dict[str, Any]:
        error: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            error["details"] = self.details
        return error


class Progress(Protocol):
    def __call__(self, percent: float, message: str | None = None) -> None: ...


Handler = Callable[[dict[str, Any], Progress], dict[str, Any]]


class JobRunner(Protocol):
    def submit(self, job_type: str, params: dict[str, Any]) -> str: ...

    def status(self, job_id: str) -> JobRecord | None: ...


class InProcessJobRunner:
    def __init__(self, repository: Repository, handlers: dict[str, Handler]) -> None:
        self._repository = repository
        self._handlers = handlers
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="job-runner")
        self._idle = threading.Event()
        self._idle.set()
        self._pending = 0
        self._lock = threading.Lock()
        interrupted = repository.fail_unfinished_jobs(
            {"code": "interrupted", "message": "The server restarted before this job finished"}
        )
        if interrupted:
            logger.warning("Marked %d unfinished job(s) from a previous run as failed", interrupted)

    def submit(self, job_type: str, params: dict[str, Any]) -> str:
        if job_type not in self._handlers:
            raise ValueError(f"No handler for job type {job_type!r}")
        key = None if job_type in UNCACHED_JOB_TYPES else cache_key(job_type, params)
        if key is not None:
            # Same request already done or in progress (e.g. a double click, or the forecast
            # started right after upload): return that job instead of running the model again.
            reusable = self._repository.find_reusable_job(key)
            if reusable is not None:
                return reusable.job_id
        record = self._repository.add_job(
            JobRecord(job_type=job_type, params=params, cache_key=key)
        )
        with self._lock:
            self._pending += 1
            self._idle.clear()
        self._executor.submit(self._run, record.job_id, job_type, params)
        return record.job_id

    def status(self, job_id: str) -> JobRecord | None:
        return self._repository.get_job(job_id)

    def wait_idle(self, timeout: float | None = None) -> bool:
        """Block until no job is queued or running (used by tests and scripts)."""
        return self._idle.wait(timeout)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=True, cancel_futures=True)

    def _run(self, job_id: str, job_type: str, params: dict[str, Any]) -> None:
        repo = self._repository

        def progress(percent: float, message: str | None = None) -> None:
            changes: dict[str, Any] = {"progress": max(0.0, min(100.0, float(percent)))}
            if message is not None:
                changes["message"] = message
            repo.update_job(job_id, **changes)

        try:
            repo.update_job(job_id, status="running", progress=0.0)
            result = self._handlers[job_type](params, progress)
            repo.update_job(
                job_id, status="succeeded", progress=100.0, result=result, finished_at=utcnow()
            )
        except JobFailed as exc:
            repo.update_job(job_id, status="failed", error=exc.as_error(), finished_at=utcnow())
        except Exception as exc:
            logger.exception("Job %s (%s) crashed", job_id, job_type)
            error = {"code": "internal_error", "message": f"{type(exc).__name__}: {exc}"}
            repo.update_job(job_id, status="failed", error=error, finished_at=utcnow())
        finally:
            with self._lock:
                self._pending -= 1
                if self._pending == 0:
                    self._idle.set()
