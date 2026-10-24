from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.errors import not_found
from app.jobs import JobRunner
from app.repository import JobRecord
from app.schemas import Error, FactorRequest, ForecastRequest, Job, JobRef, ReviewRequest

router = APIRouter(prefix="/jobs", tags=["jobs"])


def get_runner(request: Request) -> JobRunner:
    return request.app.state.jobs


def job_ref(runner: JobRunner, job_id: str) -> dict[str, Any]:
    record = runner.status(job_id)
    return {"job_id": record.job_id, "job_type": record.job_type, "status": record.status}


def job_response(record: JobRecord) -> dict[str, Any]:
    body: dict[str, Any] = {
        "job_id": record.job_id,
        "job_type": record.job_type,
        "status": record.status,
        "progress": record.progress,
        "created_at": record.created_at.isoformat(),
        "finished_at": record.finished_at.isoformat() if record.finished_at else None,
        "error": record.error,
        "result": record.result if record.status == "succeeded" else None,
    }
    if record.message is not None:
        body["message"] = record.message
    return body


def unique(ids: list[str]) -> list[str]:
    return list(dict.fromkeys(ids))


@router.post("/forecast", status_code=202, response_model=JobRef)
def create_forecast_job(
    request: ForecastRequest, runner: Annotated[JobRunner, Depends(get_runner)]
) -> dict:
    params = request.model_dump()
    params["series_ids"] = unique(params["series_ids"])
    return job_ref(runner, runner.submit("forecast", params))


@router.post("/review", status_code=202, response_model=JobRef)
def create_review_job(
    request: ReviewRequest, runner: Annotated[JobRunner, Depends(get_runner)]
) -> dict:
    params = request.model_dump()
    params["series_ids"] = unique(params["series_ids"])
    return job_ref(runner, runner.submit("review", params))


@router.post("/factors", status_code=202, response_model=JobRef)
def create_factor_job(
    request: FactorRequest, runner: Annotated[JobRunner, Depends(get_runner)]
) -> dict:
    params = request.model_dump()
    params["factors"] = unique(params["factors"])
    return job_ref(runner, runner.submit("factors", params))


@router.get(
    "/{job_id}",
    response_model=Job,
    response_model_exclude_unset=True,
    responses={404: {"model": Error}},
)
def get_job(job_id: str, runner: Annotated[JobRunner, Depends(get_runner)]) -> dict:
    record = runner.status(job_id)
    if record is None:
        raise not_found("Job", job_id)
    return job_response(record)
