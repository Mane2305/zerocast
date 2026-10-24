import pytest

from app.repository import AnnotationRecord, DatasetRecord, JobRecord, utcnow


def test_dataset_roundtrip(repository):
    record = repository.add_dataset(
        DatasetRecord(name="Sales", storage_key="datasets/x.parquet", meta={"frequency": "daily"})
    )

    loaded = repository.get_dataset(record.dataset_id)

    assert loaded == record
    assert loaded.created_at.tzinfo is not None


def test_get_missing_returns_none(repository):
    assert repository.get_dataset("missing") is None
    assert repository.get_job("missing") is None


def test_job_lifecycle(repository):
    job = repository.add_job(JobRecord(job_type="forecast", params={"horizon": 28}))
    assert repository.get_job(job.job_id).status == "queued"

    repository.update_job(job.job_id, status="running", progress=40.0, message="Series 2 of 5")
    finished = repository.update_job(
        job.job_id, status="succeeded", progress=100.0, result={"series": []}, finished_at=utcnow()
    )

    assert finished.status == "succeeded"
    assert finished.result == {"series": []}
    assert finished.params == {"horizon": 28}
    assert repository.get_job(job.job_id) == finished


def test_update_job_rejects_unknown_fields(repository):
    job = repository.add_job(JobRecord(job_type="forecast"))
    with pytest.raises(ValueError):
        repository.update_job(job.job_id, job_type="review")


def test_update_missing_job_raises(repository):
    with pytest.raises(KeyError):
        repository.update_job("missing", status="running")


def test_annotation_upsert_replaces_same_series_and_date(repository):
    first = repository.upsert_annotation(
        AnnotationRecord(dataset_id="d1", series_id="s1", date="2025-11-01", text="Diwali")
    )
    second = repository.upsert_annotation(
        AnnotationRecord(dataset_id="d1", series_id="s1", date="2025-11-01", text="Diwali sale")
    )
    repository.upsert_annotation(
        AnnotationRecord(dataset_id="d1", series_id="s2", date="2025-11-01", text="Other")
    )
    repository.upsert_annotation(
        AnnotationRecord(dataset_id="d2", series_id="s1", date="2025-11-01", text="Other dataset")
    )

    annotations = repository.list_annotations("d1")

    assert second.annotation_id == first.annotation_id
    assert [(a.series_id, a.text) for a in annotations] == [("s1", "Diwali sale"), ("s2", "Other")]
