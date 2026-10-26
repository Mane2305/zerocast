import io
import json

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


def test_upload_reports_v2_fields_for_the_default_template(client):
    body = upload(client, template_csv()).json()
    assert body["input_format"] == "long" and body["hierarchy"] == []
    assert "unit" not in body and "attributes" not in body["series"][0]


def test_upload_long_with_hierarchy_columns(client):
    df = pd.read_csv(io.BytesIO(template_csv(price=False)))
    df["store"] = "S1"
    df = df.rename(columns={"series_id": "product", "target": "units", "date": "day"})
    form = {
        "id_columns": '["store", "product"]',
        "target_column": "units",
        "date_column": "day",
        "unit": "units",
    }

    response = upload(client, df.to_csv(index=False).encode(), **form)

    assert response.status_code == 201, response.json()
    body = response.json()
    assert_matches_schema("Dataset", body)
    assert body["hierarchy"] == ["store", "product"] and body["unit"] == "units"
    assert [s["series_id"] for s in body["series"]] == ["S1|A", "S1|B"]
    assert body["series"][0]["attributes"] == {"store": "S1", "product": "A"}
    stored = client.get(f"/datasets/{body['dataset_id']}").json()
    assert stored["hierarchy"] == ["store", "product"]


def test_upload_wide_json(client):
    dates = pd.date_range("2024-01-01", periods=40, freq="D").strftime("%Y-%m-%d")
    records = [{"date": d, "north": 10 + i % 7, "south": 20 + i % 5} for i, d in enumerate(dates)]

    response = upload(client, json.dumps(records).encode(), filename="sales.json")

    assert response.status_code == 201, response.json()
    body = response.json()
    assert_matches_schema("Dataset", body)
    assert body["input_format"] == "wide"
    assert [s["series_id"] for s in body["series"]] == ["north", "south"]
    history = client.get(f"/datasets/{body['dataset_id']}/series/north").json()
    assert history["target"][:2] == [10.0, 11.0]


def test_bad_id_columns_is_422(client):
    response = upload(client, template_csv(), id_columns="store")
    assert response.status_code == 422 and response.json()["code"] == "invalid_id_columns"


def test_bad_format_is_422(client):
    response = upload(client, template_csv(), format="sideways")
    assert response.status_code == 422
    assert_matches_schema("Error", response.json())
