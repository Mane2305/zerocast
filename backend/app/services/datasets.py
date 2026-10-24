"""Dataset ingestion: read an upload, run the health check, store the cleaned Parquet."""

import io
from typing import Any

import pandas as pd

from app.repository import DatasetRecord, Repository
from app.services.health_check import DatasetError, format_date, run_health_check
from app.storage import Storage

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
PARQUET_MAGIC = b"PAR1"


def read_upload(data: bytes) -> pd.DataFrame:
    """Parse Parquet (detected by magic bytes) or CSV. Raises DatasetError."""
    if not data:
        raise DatasetError("empty_file", "The file is empty")
    try:
        if data[:4] == PARQUET_MAGIC:
            return pd.read_parquet(io.BytesIO(data))
        # Read everything as text; the health check coerces types with clear errors.
        return pd.read_csv(io.BytesIO(data), dtype=str, encoding="utf-8-sig")
    except (ValueError, UnicodeDecodeError, OSError, pd.errors.ParserError) as exc:
        raise DatasetError(
            "unreadable_file",
            "Could not read the file as Parquet or UTF-8 CSV",
            {"reason": str(exc)},
        ) from exc


def clean_key(dataset_id: str) -> str:
    return f"datasets/{dataset_id}/clean.parquet"


def ingest(
    data: bytes,
    name: str,
    holiday_country: str | None,
    repository: Repository,
    storage: Storage,
) -> DatasetRecord:
    result = run_health_check(read_upload(data))
    record = DatasetRecord(name=name, storage_key="", holiday_country=holiday_country)
    record.storage_key = clean_key(record.dataset_id)
    buffer = io.BytesIO()
    result.frame.to_parquet(buffer, index=False)
    storage.put(record.storage_key, buffer.getvalue())
    record.meta = {
        "frequency": result.frequency,
        "factor_columns": result.factor_columns,
        "date_range": result.date_range,
        "series": result.series,
        "health": result.report,
    }
    return repository.add_dataset(record)


def dataset_response(record: DatasetRecord) -> dict[str, Any]:
    meta = record.meta
    return {
        "dataset_id": record.dataset_id,
        "name": record.name,
        "created_at": record.created_at.isoformat(),
        "frequency": meta["frequency"],
        "holiday_country": record.holiday_country,
        "series_count": len(meta["series"]),
        "factor_columns": meta["factor_columns"],
        "date_range": meta["date_range"],
        "series": meta["series"],
        "health": meta["health"],
    }


def load_frame(record: DatasetRecord, storage: Storage) -> pd.DataFrame:
    return pd.read_parquet(io.BytesIO(storage.get(record.storage_key)))


def _nullable(values: pd.Series) -> list[float | None]:
    return [None if pd.isna(v) else float(v) for v in values]


def series_history(record: DatasetRecord, storage: Storage, series_id: str) -> dict | None:
    frame = load_frame(record, storage)
    rows = frame[frame["series_id"] == series_id].sort_values("date")
    if rows.empty:
        return None
    history: dict[str, Any] = {
        "series_id": series_id,
        "dates": [format_date(d) for d in rows["date"]],
        "target": _nullable(rows["target"]),
    }
    factors = record.meta["factor_columns"]
    if factors:
        history["factors"] = {name: _nullable(rows[name]) for name in factors}
    return history
