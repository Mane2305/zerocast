import io

import pandas as pd

from app.services import datasets
from tests.contract import assert_matches_schema


def template_csv(n=40, series=("A", "B"), price=True) -> bytes:
    frames = []
    for i, sid in enumerate(series):
        frame = pd.DataFrame(
            {
                "date": pd.date_range("2024-01-01", periods=n, freq="D").strftime("%Y-%m-%d"),
                "series_id": sid,
                "target": [float(10 + i + d % 7) for d in range(n)],
            }
        )
        if price:
            frame["price"] = 2.5
        frames.append(frame)
    df = pd.concat(frames, ignore_index=True)
    df.loc[3, "target"] = None
    return df.to_csv(index=False).encode()


def upload(client, data: bytes, filename="sales.csv", **form):
    return client.post("/datasets", files={"file": (filename, data)}, data=form)


def test_upload_csv_returns_dataset(client):
    response = upload(client, template_csv(), holiday_country="in")

    assert response.status_code == 201
    body = response.json()
    assert_matches_schema("Dataset", body)
    assert body["name"] == "sales"
    assert body["frequency"] == "daily"
    assert body["holiday_country"] == "IN"
    assert body["series_count"] == 2
    assert body["factor_columns"] == ["price"]
    assert body["health"]["ready"] is True
    assert body["date_range"] == {"start": "2024-01-01T00:00:00", "end": "2024-02-09T00:00:00"}
    for summary in body["series"]:
        assert_matches_schema("SeriesSummary", summary)
    for item in body["health"]["checks"]:
        assert_matches_schema("HealthCheck", item)


def test_upload_parquet(client):
    df = pd.read_csv(io.BytesIO(template_csv(price=False)))
    buffer = io.BytesIO()
    df.to_parquet(buffer, index=False)

    response = upload(client, buffer.getvalue(), filename="x.parquet", name="My data")

    assert response.status_code == 201
    assert response.json()["name"] == "My data"
    assert response.json()["factor_columns"] == []


def test_get_dataset_roundtrip(client):
    created = upload(client, template_csv()).json()

    response = client.get(f"/datasets/{created['dataset_id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_series_history(client):
    dataset_id = upload(client, template_csv()).json()["dataset_id"]

    response = client.get(f"/datasets/{dataset_id}/series/A")

    assert response.status_code == 200
    body = response.json()
    assert_matches_schema("SeriesHistory", body)
    assert len(body["dates"]) == len(body["target"]) == 40
    assert body["target"][3] is None
    assert body["factors"]["price"][0] == 2.5


def test_unknown_dataset_and_series_are_404(client):
    missing = client.get("/datasets/nope")
    assert missing.status_code == 404
    assert_matches_schema("Error", missing.json())

    dataset_id = upload(client, template_csv()).json()["dataset_id"]
    response = client.get(f"/datasets/{dataset_id}/series/ZZZ")
    assert response.status_code == 404
    assert_matches_schema("Error", response.json())


def test_wrong_columns_is_422_error(client):
    response = upload(client, b"day,item,qty\n2024-01-01,A,1\n")

    assert response.status_code == 422
    body = response.json()
    assert_matches_schema("Error", body)
    assert body["code"] == "invalid_columns"
    assert body["details"]["missing"] == ["date", "series_id", "target"]


def test_unreadable_file_is_422(client):
    response = upload(client, b"PAR1 definitely not parquet")

    assert response.status_code == 422
    assert response.json()["code"] == "unreadable_file"


def test_file_too_large_is_422(client, monkeypatch):
    monkeypatch.setattr(datasets, "MAX_UPLOAD_BYTES", 100)

    response = upload(client, template_csv())

    assert response.status_code == 422
    assert response.json()["code"] == "file_too_large"


def test_missing_file_uses_error_shape(client):
    response = client.post("/datasets", data={"name": "x"})

    assert response.status_code == 422
    assert_matches_schema("Error", response.json())
    assert response.json()["code"] == "validation_error"


def test_invalid_holiday_country(client):
    response = upload(client, template_csv(), holiday_country="India!")
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_holiday_country"


def test_additive_flag_defaults_true_and_can_be_false(client):
    default = upload(client, template_csv()).json()
    index = upload(client, template_csv(), additive="false").json()

    assert default["additive"] is True and index["additive"] is False
    assert_matches_schema("Dataset", index)
    assert client.get(f"/datasets/{index['dataset_id']}").json()["additive"] is False
