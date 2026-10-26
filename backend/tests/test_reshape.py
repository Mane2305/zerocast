import json

import pandas as pd
import pytest

from app.services.health_check import DatasetError
from app.services.reshape import InputOptions, parse_id_columns, read_json_records, to_long


def test_default_long_template_passes_through():
    raw = pd.DataFrame({"date": ["2024-01-01"], "series_id": ["A"], "target": ["1"], "price": [2]})

    out = to_long(raw)

    assert out.input_format == "long" and out.hierarchy == [] and out.attributes == {}
    assert list(out.frame.columns) == ["date", "series_id", "target", "price"]


def test_hierarchy_id_columns_build_the_series_id():
    raw = pd.DataFrame(
        {
            "Date": ["2024-01-01", "2024-01-01", "2024-01-02"],
            "Store": ["S1", "S2", "S1"],
            "Product": ["BAGS", "BAGS", "BAGS"],
            "Sales": ["3", "4", "5"],
            "promo": ["0", "1", "0"],
        }
    )
    options = InputOptions(id_columns=["store", "product"], target_column="sales")

    out = to_long(raw, options)

    assert out.frame["series_id"].tolist() == ["S1|BAGS", "S2|BAGS", "S1|BAGS"]
    assert list(out.frame.columns) == ["date", "series_id", "target", "promo"]
    assert out.hierarchy == ["Store", "Product"]
    assert out.attributes == {
        "S1|BAGS": {"Store": "S1", "Product": "BAGS"},
        "S2|BAGS": {"Store": "S2", "Product": "BAGS"},
    }


def test_wide_files_are_detected_and_melted():
    raw = pd.DataFrame({"date": ["2024-01-01", "2024-01-02"], "A": ["1", "2"], "B": [3, None]})

    out = to_long(raw)

    assert out.input_format == "wide"
    assert list(out.frame.columns) == ["date", "series_id", "target"]
    assert out.frame["series_id"].tolist() == ["A", "A", "B", "B"]
    assert out.frame["target"].tolist()[:3] == ["1", "2", 3]


def test_text_columns_keep_auto_detection_on_long():
    raw = pd.DataFrame({"date": ["2024-01-01"], "item": ["A"], "qty": ["1"]})
    with pytest.raises(DatasetError) as err:
        to_long(raw)
    assert err.value.details["missing"] == ["series_id", "target"]


def test_explicit_wide_with_custom_date_column():
    raw = pd.DataFrame({"Month": ["2024-01-01"], "cement": ["101.5"]})
    out = to_long(raw, InputOptions(format="wide", date_column="month"))
    assert out.frame["series_id"].tolist() == ["cement"] and out.input_format == "wide"


def test_unit_column_is_used_for_display_and_dropped():
    raw = pd.DataFrame(
        {"date": ["2024-01-01"] * 2, "series_id": ["A", "B"], "target": [1, 2], "Unit": ["kg"] * 2}
    )
    out = to_long(raw)
    assert out.unit == "kg" and "Unit" not in out.frame.columns
    assert to_long(raw, InputOptions(unit="tonnes")).unit == "tonnes"


def test_blank_id_values_are_rejected():
    raw = pd.DataFrame({"date": ["2024-01-01"], "store": [" "], "target": [1]})
    with pytest.raises(DatasetError, match="no store"):
        to_long(raw, InputOptions(id_columns=["store"]))


def test_id_columns_must_not_reuse_target():
    raw = pd.DataFrame({"date": ["2024-01-01"], "target": [1]})
    with pytest.raises(DatasetError) as err:
        to_long(raw, InputOptions(id_columns=["target"]))
    assert err.value.code == "invalid_id_columns"


@pytest.mark.parametrize("text", ["store", "[]", "[1]", '[""]', "{}"])
def test_bad_id_columns_field(text):
    with pytest.raises(DatasetError) as err:
        parse_id_columns(text)
    assert err.value.code == "invalid_id_columns"


def test_id_columns_field():
    assert parse_id_columns(' ["store", " item "] ') == ["store", "item"]
    assert parse_id_columns(None) is None and parse_id_columns(" ") is None


def test_json_records():
    data = json.dumps([{"date": "2024-01-01", "series_id": "A", "target": 1.5}]).encode()
    frame = read_json_records(data)
    assert frame.to_dict("records") == [{"date": "2024-01-01", "series_id": "A", "target": 1.5}]


@pytest.mark.parametrize("data", [b'{"a": 1}', b"[1, 2]", b"[{"])
def test_bad_json(data):
    with pytest.raises(DatasetError) as err:
        read_json_records(data)
    assert err.value.code == "unreadable_file"
