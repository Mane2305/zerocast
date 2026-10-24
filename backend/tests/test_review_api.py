import io

import numpy as np
import pandas as pd

from tests.contract import assert_matches_schema


def upload(client, holiday_country="IN") -> str:
    dates = pd.date_range("2023-06-01", periods=500, freq="D")
    rng = np.random.default_rng(1)
    df = pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d"),
            "series_id": "A",
            "target": 100 + 10 * np.sin(2 * np.pi * np.arange(500) / 7) + rng.normal(0, 2, 500),
        }
    )
    df.loc[450, "target"] = 900.0  # injected spike inside the replay window
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    response = client.post(
        "/datasets",
        files={"file": ("s.csv", buffer.getvalue().encode())},
        data={"holiday_country": holiday_country},
    )
    assert response.status_code == 201
    return response.json()["dataset_id"]


def run_review(client, body) -> dict:
    response = client.post("/jobs/review", json=body)
    assert response.status_code == 202
    assert_matches_schema("JobRef", response.json())
    assert response.json()["job_type"] == "review"
    assert client.app.state.jobs.wait_idle(120)
    job = client.get(f"/jobs/{response.json()['job_id']}").json()
    assert_matches_schema("Job", job)
    return job


def test_review_job_matches_contract_and_finds_spike(model_client):
    dataset_id = upload(model_client)
    spike_date = "2024-08-24T00:00:00"  # row 450
    model_client.post(
        f"/datasets/{dataset_id}/annotations",
        json={"series_id": "A", "date": "2024-08-24", "text": "Wholesale order"},
    )

    job = run_review(model_client, {"dataset_id": dataset_id, "series_ids": ["A"]})

    assert job["status"] == "succeeded", job.get("error")
    result = job["result"]
    assert_matches_schema("ReviewResult", result)
    series = result["series"][0]
    for event in series["positive_surprises"] + series["misses"]:
        assert_matches_schema("SurpriseEvent", event)
    assert len(series["positive_surprises"]) <= 5 and len(series["misses"]) <= 5
    top = series["positive_surprises"][0]
    assert top["date"] == spike_date and top["actual"] == 900.0
    assert top["annotation"] == "Wholesale order"
    assert 0 <= series["band_coverage"] <= 1


def test_review_validation(client):
    too_many = {"dataset_id": "x", "series_ids": [f"s{i}" for i in range(21)]}
    assert client.post("/jobs/review", json=too_many).status_code == 422
    zero_step = {"dataset_id": "x", "series_ids": ["A"], "step": 0}
    assert client.post("/jobs/review", json=zero_step).status_code == 422


def test_review_unknown_series_fails_job(model_client):
    dataset_id = upload(model_client)
    job = run_review(model_client, {"dataset_id": dataset_id, "series_ids": ["NOPE"]})
    assert job["status"] == "failed" and job["error"]["code"] == "series_not_found"


def test_annotations_roundtrip_and_replace(client):
    dataset_id = upload(client)
    url = f"/datasets/{dataset_id}/annotations"

    first = client.post(url, json={"series_id": "A", "date": "2024-08-24", "text": "Order"})
    second = client.post(
        url, json={"series_id": "A", "date": "2024-08-24T00:00:00", "text": "Big order"}
    )

    assert first.status_code == 201 and second.status_code == 201
    assert_matches_schema("Annotation", second.json())
    assert second.json()["annotation_id"] == first.json()["annotation_id"]
    listed = client.get(url).json()
    assert [(a["date"], a["text"]) for a in listed] == [("2024-08-24T00:00:00", "Big order")]
    for item in listed:
        assert_matches_schema("Annotation", item)


def test_annotation_errors(client):
    dataset_id = upload(client)
    url = f"/datasets/{dataset_id}/annotations"

    assert (
        client.post(url, json={"series_id": "ZZ", "date": "2024-01-01", "text": "x"}).json()["code"]
        == "series_not_found"
    )
    too_long = {"series_id": "A", "date": "2024-01-01", "text": "x" * 501}
    assert client.post(url, json=too_long).status_code == 422
    missing = client.get("/datasets/nope/annotations")
    assert missing.status_code == 404
    assert_matches_schema("Error", missing.json())
