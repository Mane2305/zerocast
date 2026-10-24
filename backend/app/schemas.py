"""Pydantic response models mirroring contracts/openapi.yaml."""

from typing import Any, Literal

from pydantic import BaseModel

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
    date_range: DateRange | None = None
    series: list[SeriesSummary] | None = None
    health: HealthReport


class SeriesHistory(BaseModel):
    series_id: str
    dates: list[str]
    target: list[float | None]
    factors: dict[str, list[float | None]] | None = None
