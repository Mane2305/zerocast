"""Pydantic response models mirroring contracts/openapi.yaml."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Frequency = Literal["hourly", "daily", "weekly", "monthly", "quarterly", "yearly", "unknown"]
CheckId = Literal[
    "missing_dates",
    "duplicates",
    "negative_values",
    "non_finite",
    "too_short",
    "constant_series",
    "irregular_spacing",
    "too_many_factors",
    "zero_values",
]


class Error(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    model_loaded: bool
    device: str | None = None
    version: str | None = None


class LatencyStats(BaseModel):
    p50: float | None = None
    p95: float | None = None
    count: int | None = None


class ModelInfo(BaseModel):
    name: str
    revision: str | None = None
    weights_revision: str | None = None
    parameters: int
    quantile_levels: list[float]
    max_context: int
    block_size: int
    license: str
    device: str | None = None
    num_samples: int | None = None
    latency_ms: LatencyStats | None = None


class HealthCheck(BaseModel):
    id: CheckId
    label: str
    severity: Literal["info", "warning", "error"]
    count: int
    percent: float | None = None
    action_taken: str | None = None
    affected_series: list[str] | None = None


class HealthReport(BaseModel):
    ready: bool
    checks: list[HealthCheck]


class SeriesSummary(BaseModel):
    series_id: str
    length: int
    start: str | None = None
    end: str | None = None
    missing_count: int | None = None
    status: Literal["ready", "warning", "excluded"]
    issues: list[str] | None = None


class DateRange(BaseModel):
    start: str | None = None
    end: str | None = None


class Dataset(BaseModel):
    dataset_id: str
    name: str
    created_at: str | None = None
    frequency: Frequency
    holiday_country: str | None = None
    series_count: int
    factor_columns: list[str]
    additive: bool
    date_range: DateRange | None = None
    series: list[SeriesSummary] | None = None
    health: HealthReport


class SeriesHistory(BaseModel):
    series_id: str
    dates: list[str]
    target: list[float | None]
    factors: dict[str, list[float | None]] | None = None


JobType = Literal["forecast", "review", "factors"]
JobStatus = Literal["queued", "running", "succeeded", "failed"]


class ForecastRequest(BaseModel):
    dataset_id: str
    series_ids: list[str] = Field(min_length=1, max_length=100)
    horizon: int = Field(ge=1, le=256)
    seed: int = 0
    return_paths: int = Field(default=0, ge=0, le=50)


class JobRef(BaseModel):
    job_id: str
    job_type: JobType
    status: JobStatus


class Job(BaseModel):
    job_id: str
    job_type: JobType
    status: JobStatus
    progress: float = Field(ge=0, le=100)
    message: str | None = None
    created_at: str | None = None
    finished_at: str | None = None
    error: Error | None = None
    # Shape depends on job_type; built by the job handlers and checked by contract tests.
    result: dict[str, Any] | None = None


class ReviewRequest(BaseModel):
    dataset_id: str
    series_ids: list[str] = Field(min_length=1, max_length=20)
    lookback_periods: int | None = Field(default=None, ge=1)
    step: int | None = Field(default=None, ge=1)
    top_n: int = Field(default=5, ge=1, le=50)


class AnnotationInput(BaseModel):
    series_id: str
    date: datetime
    text: str = Field(max_length=500)


class Annotation(BaseModel):
    annotation_id: str
    series_id: str
    date: str
    text: str
    created_at: str | None = None


class FactorRequest(BaseModel):
    dataset_id: str
    series_id: str
    factors: list[str] = Field(min_length=1, max_length=10)
    horizon: int = Field(default=28, ge=1, le=64)
    max_lag: int = Field(default=3, ge=0, le=24)
