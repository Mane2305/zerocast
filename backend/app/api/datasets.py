import re
from pathlib import PurePath
from typing import Annotated, Literal

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.deps import get_repository, get_storage
from app.errors import ApiError, not_found
from app.repository import AnnotationRecord, DatasetRecord, Repository
from app.schemas import Annotation, AnnotationInput, Dataset, Error, SeriesHistory
from app.services import datasets
from app.services.health_check import DatasetError, format_date
from app.services.reshape import InputOptions, parse_id_columns
from app.storage import Storage

router = APIRouter(prefix="/datasets", tags=["datasets"])

COUNTRY_CODE = re.compile(r"^[A-Za-z]{2,3}$")
CHUNK = 1024 * 1024


async def _read_limited(file: UploadFile) -> bytes:
    data = bytearray()
    while chunk := await file.read(CHUNK):
        data.extend(chunk)
        if len(data) > datasets.MAX_UPLOAD_BYTES:
            raise ApiError(
                422,
                "file_too_large",
                f"File is larger than {datasets.MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
                {"max_bytes": datasets.MAX_UPLOAD_BYTES},
            )
    return bytes(data)


def _get_record(repository: Repository, dataset_id: str) -> DatasetRecord:
    record = repository.get_dataset(dataset_id)
    if record is None:
        raise not_found("Dataset", dataset_id)
    return record


@router.post(
    "",
    status_code=201,
    response_model=Dataset,
    response_model_exclude_none=True,
    responses={422: {"model": Error}},
)
async def create_dataset(
    file: Annotated[UploadFile, File()],
    repository: Annotated[Repository, Depends(get_repository)],
    storage: Annotated[Storage, Depends(get_storage)],
    name: Annotated[str | None, Form()] = None,
    holiday_country: Annotated[str | None, Form()] = None,
    additive: Annotated[bool, Form()] = True,
    format: Annotated[Literal["auto", "long", "wide"], Form()] = "auto",
    date_column: Annotated[str | None, Form()] = None,
    target_column: Annotated[str | None, Form()] = None,
    id_columns: Annotated[str | None, Form()] = None,
    unit: Annotated[str | None, Form()] = None,
) -> dict:
    if holiday_country is not None:
        holiday_country = holiday_country.strip().upper() or None
    if holiday_country is not None and not COUNTRY_CODE.match(holiday_country):
        raise ApiError(
            422, "invalid_holiday_country", "holiday_country must be an ISO code, e.g. IN"
        )
    data = await _read_limited(file)
    display_name = (name or "").strip() or PurePath(file.filename or "dataset").stem
    try:
        options = InputOptions(
            format=format,
            date_column=(date_column or "").strip() or None,
            target_column=(target_column or "").strip() or None,
            id_columns=parse_id_columns(id_columns),
            unit=(unit or "").strip() or None,
        )
        record = await run_in_threadpool(
            datasets.ingest,
            data,
            display_name,
            holiday_country,
            repository,
            storage,
            additive,
            options,
        )
    except DatasetError as exc:
        raise ApiError(422, exc.code, exc.message, exc.details) from exc
    return datasets.dataset_response(record)


@router.get(
    "/{dataset_id}",
    response_model=Dataset,
    response_model_exclude_none=True,
    responses={404: {"model": Error}},
)
def get_dataset(
    dataset_id: str, repository: Annotated[Repository, Depends(get_repository)]
) -> dict:
    return datasets.dataset_response(_get_record(repository, dataset_id))


@router.get(
    "/{dataset_id}/series/{series_id}",
    response_model=SeriesHistory,
    response_model_exclude_none=True,
    responses={404: {"model": Error}},
)
def get_series(
    dataset_id: str,
    series_id: str,
    repository: Annotated[Repository, Depends(get_repository)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> dict:
    record = _get_record(repository, dataset_id)
    history = datasets.series_history(record, storage, series_id)
    if history is None:
        raise not_found("Series", series_id)
    return history


def _annotation(record: AnnotationRecord) -> dict:
    return {
        "annotation_id": record.annotation_id,
        "series_id": record.series_id,
        "date": record.date,
        "text": record.text,
        "created_at": record.created_at.isoformat(),
    }


@router.get(
    "/{dataset_id}/annotations",
    response_model=list[Annotation],
    responses={404: {"model": Error}},
)
def list_annotations(
    dataset_id: str, repository: Annotated[Repository, Depends(get_repository)]
) -> list[dict]:
    _get_record(repository, dataset_id)
    return [_annotation(a) for a in repository.list_annotations(dataset_id)]


@router.post(
    "/{dataset_id}/annotations",
    status_code=201,
    response_model=Annotation,
    responses={404: {"model": Error}, 422: {"model": Error}},
)
def add_annotation(
    dataset_id: str,
    body: AnnotationInput,
    repository: Annotated[Repository, Depends(get_repository)],
) -> dict:
    record = _get_record(repository, dataset_id)
    if body.series_id not in {s["series_id"] for s in record.meta["series"]}:
        raise ApiError(422, "series_not_found", f"Series {body.series_id!r} not in this dataset")
    # Same naive ISO format as the review's surprise dates, so they can be matched.
    when = pd.Timestamp(body.date)
    if when.tzinfo is not None:
        when = when.tz_convert(None)
    saved = repository.upsert_annotation(
        AnnotationRecord(
            dataset_id=dataset_id,
            series_id=body.series_id,
            date=format_date(when),
            text=body.text.strip(),
        )
    )
    return _annotation(saved)
