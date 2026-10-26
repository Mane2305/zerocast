"""Repository for datasets, jobs and annotations.

Callers get plain dataclasses, never ORM rows, so nothing outside this module depends on
SQLAlchemy sessions. Phase 2 swaps SQLite for Supabase Postgres by changing ZC_DB_URL only.
"""

import uuid
from dataclasses import dataclass, field, fields
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.db import AnnotationRow, DatasetRow, JobRow, SeriesForecastRow, utcnow


def new_id() -> str:
    return uuid.uuid4().hex


def _aware(value: datetime | None) -> datetime | None:
    # SQLite drops tzinfo; everything we store is UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


@dataclass
class DatasetRecord:
    name: str
    storage_key: str
    holiday_country: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)
    dataset_id: str = field(default_factory=new_id)
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class JobRecord:
    job_type: str
    params: dict[str, Any] = field(default_factory=dict)
    status: str = "queued"
    progress: float = 0.0
    message: str | None = None
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    job_id: str = field(default_factory=new_id)
    created_at: datetime = field(default_factory=utcnow)
    finished_at: datetime | None = None
    cache_key: str | None = None


@dataclass
class AnnotationRecord:
    dataset_id: str
    series_id: str
    date: str
    text: str
    annotation_id: str = field(default_factory=new_id)
    created_at: datetime = field(default_factory=utcnow)


_JOB_UPDATABLE = {"status", "progress", "message", "result", "error", "finished_at"}


def _to_record(row: Any, cls: type) -> Any:
    values = {f.name: getattr(row, f.name) for f in fields(cls)}
    for key in ("created_at", "finished_at"):
        if key in values:
            values[key] = _aware(values[key])
    return cls(**values)


class Repository:
    def __init__(self, session_factory: sessionmaker) -> None:
        self._sessions = session_factory

    # Datasets
    def add_dataset(self, record: DatasetRecord) -> DatasetRecord:
        with self._sessions.begin() as session:
            session.add(DatasetRow(**vars(record)))
        return record

    def get_dataset(self, dataset_id: str) -> DatasetRecord | None:
        with self._sessions() as session:
            row = session.get(DatasetRow, dataset_id)
            return _to_record(row, DatasetRecord) if row else None

    # Jobs
    def add_job(self, record: JobRecord) -> JobRecord:
        with self._sessions.begin() as session:
            session.add(JobRow(**vars(record)))
        return record

    def get_job(self, job_id: str) -> JobRecord | None:
        with self._sessions() as session:
            row = session.get(JobRow, job_id)
            return _to_record(row, JobRecord) if row else None

    def find_reusable_job(self, cache_key: str) -> JobRecord | None:
        """Newest job with this key that has not failed (queued, running or succeeded)."""
        with self._sessions() as session:
            row = session.scalars(
                select(JobRow)
                .where(JobRow.cache_key == cache_key, JobRow.status != "failed")
                .order_by(JobRow.created_at.desc())
                .limit(1)
            ).first()
            return _to_record(row, JobRecord) if row else None

    # Per-item forecast cache
    def get_series_forecast(self, cache_key: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(SeriesForecastRow, cache_key)
            return row.result if row else None

    def put_series_forecast(self, cache_key: str, dataset_id: str, result: dict[str, Any]) -> None:
        with self._sessions.begin() as session:
            session.merge(
                SeriesForecastRow(cache_key=cache_key, dataset_id=dataset_id, result=result)
            )

    def update_job(self, job_id: str, **changes: Any) -> JobRecord:
        unknown = set(changes) - _JOB_UPDATABLE
        if unknown:
            raise ValueError(f"Cannot update job fields: {sorted(unknown)}")
        with self._sessions.begin() as session:
            row = session.get(JobRow, job_id)
            if row is None:
                raise KeyError(job_id)
            for key, value in changes.items():
                setattr(row, key, value)
            session.flush()
            return _to_record(row, JobRecord)

    def fail_unfinished_jobs(self, error: dict[str, Any]) -> int:
        """Mark queued/running jobs as failed (they cannot survive a restart in Phase 1)."""
        with self._sessions.begin() as session:
            rows = session.scalars(
                select(JobRow).where(JobRow.status.in_(("queued", "running")))
            ).all()
            for row in rows:
                row.status, row.error, row.finished_at = "failed", error, utcnow()
            return len(rows)

    # Annotations
    def upsert_annotation(self, record: AnnotationRecord) -> AnnotationRecord:
        """Add an annotation, replacing any existing one for the same series and date."""
        with self._sessions.begin() as session:
            row = session.scalars(
                select(AnnotationRow).where(
                    AnnotationRow.dataset_id == record.dataset_id,
                    AnnotationRow.series_id == record.series_id,
                    AnnotationRow.date == record.date,
                )
            ).one_or_none()
            if row is None:
                row = AnnotationRow(**vars(record))
                session.add(row)
            else:
                row.text = record.text
                row.created_at = record.created_at
            session.flush()
            return _to_record(row, AnnotationRecord)

    def list_annotations(self, dataset_id: str) -> list[AnnotationRecord]:
        with self._sessions() as session:
            rows = session.scalars(
                select(AnnotationRow)
                .where(AnnotationRow.dataset_id == dataset_id)
                .order_by(AnnotationRow.series_id, AnnotationRow.date)
            ).all()
            return [_to_record(row, AnnotationRecord) for row in rows]
