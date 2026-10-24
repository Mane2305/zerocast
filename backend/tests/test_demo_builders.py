"""data/scripts demo builders: small synthetic files in each source's real layout."""

import importlib.util
import zipfile
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services.health_check import run_health_check

SCRIPTS = Path(__file__).resolve().parents[2] / "data" / "scripts"


def load_script(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cement = load_script("build_cement")
favorita = load_script("build_favorita")


def write_core_index_xlsx(path: Path, months: int = 40) -> None:
    """Mimic the OEA workbook: monthly rows, then annual summary rows, then blanks."""
    headers = [
        "Months/Years",
        "Overall Index (Base:2011-12=100) ",
        "Index of Coal",
        "Index of Steel",
        "Index of Cement",
        "Index of Electricity",
    ]
    dates = pd.date_range("2011-04-01", periods=months, freq="MS")
    rows = [
        [d.to_pydatetime(), 100.0, 90.0 + i, 95.0, 97.0 + i % 12, 98.0] for i, d in enumerate(dates)
    ]
    rows += [["2011-12(Apr-Mar)", 100.0, 95.0, 96.0, 100.0, 99.0], [None] * 6]
    pd.DataFrame(rows, columns=headers).to_excel(path, sheet_name="Index", index=False)


def test_cement_builder_outputs_template(tmp_path):
    source = tmp_path / "core.xlsx"
    write_core_index_xlsx(source)

    frame = cement.build(source)

    assert list(frame.columns) == ["date", "series_id", "target", "coal", "steel", "electricity"]
    assert len(frame) == 40 and set(frame["series_id"]) == {"cement"}
    assert frame["date"].iloc[0] == "2011-04-01"
    assert frame["target"].iloc[1] == 98.0
    result = run_health_check(frame)
    assert result.frequency == "monthly" and result.report["ready"]


def test_cement_builder_requires_cement_column(tmp_path):
    source = tmp_path / "core.xlsx"
    pd.DataFrame({"Months/Years": [datetime(2011, 4, 1)], "Index of Coal": [1.0]}).to_excel(
        source, sheet_name="Index", index=False
    )
    with pytest.raises(ValueError, match="cement"):
        cement.build(source)


def test_column_key():
    assert (
        cement.column_key("Index of Petroleum Refinery Products") == "petroleum_refinery_products"
    )
    assert cement.column_key("Overall Index (Base:2011-12=100) ") == "overall_index"


def write_favorita_raw(raw: Path, days: int = 60, as_zip: bool = False) -> None:
    dates = pd.date_range("2016-12-01", periods=days, freq="D")
    dates = dates[~((dates.month == 12) & (dates.day == 25))]  # stores closed on Christmas
    rows = []
    for store in (44, 1):
        for family in (*favorita.DEFAULT_FAMILIES, "BOOKS"):
            for i, d in enumerate(dates):
                rows.append(
                    {
                        "id": len(rows),
                        "date": d.strftime("%Y-%m-%d"),
                        "store_nbr": store,
                        "family": family,
                        "sales": float(100 + i % 7 * 10),
                        "onpromotion": i % 3,
                    }
                )
    files = {
        "train.csv": pd.DataFrame(rows),
        "stores.csv": pd.DataFrame(
            {
                "store_nbr": [1, 44],
                "city": ["Quito", "Quito"],
                "state": ["Pichincha"] * 2,
                "type": ["D", "A"],
                "cluster": [13, 5],
            }
        ),
        "holidays_events.csv": pd.DataFrame(
            {
                "date": ["2017-01-01", "2016-12-06", "2016-12-10", "2016-12-12", "2017-01-02"],
                "type": ["Holiday", "Holiday", "Holiday", "Work Day", "Transfer"],
                "locale": ["National", "Local", "Local", "National", "National"],
                "locale_name": ["Ecuador", "Quito", "Cuenca", "Ecuador", "Ecuador"],
                "description": ["Primer dia", "Fundacion de Quito", "Otra", "Recupero", "Traslado"],
                "transferred": [True, False, False, False, False],
            }
        ),
    }
    raw.mkdir(parents=True, exist_ok=True)
    if as_zip:
        with zipfile.ZipFile(raw / "store-sales.zip", "w") as zf:
            for name, df in files.items():
                zf.writestr(name, df.to_csv(index=False))
    else:
        for name, df in files.items():
            df.to_csv(raw / name, index=False)


@pytest.mark.parametrize("as_zip", [False, True])
def test_favorita_builder_outputs_template(tmp_path, as_zip):
    write_favorita_raw(tmp_path / "raw", as_zip=as_zip)

    frame = favorita.build(tmp_path / "raw", 44, favorita.DEFAULT_FAMILIES)

    assert list(frame.columns) == ["date", "series_id", "target", "onpromotion", "holiday"]
    assert sorted(frame["series_id"].unique()) == sorted(favorita.DEFAULT_FAMILIES)
    holidays = set(frame.loc[frame["holiday"] == 1, "date"])
    # Local Quito holiday and national Transfer count; transferred, other-city and
    # "Work Day" rows don't.
    assert holidays == {"2016-12-06", "2017-01-02"}

    result = run_health_check(frame)
    assert result.frequency == "daily" and result.report["ready"]
    missing = next(c for c in result.report["checks"] if c["id"] == "missing_dates")
    assert missing["count"] == len(favorita.DEFAULT_FAMILIES)  # 25 Dec per family


def test_favorita_builder_errors(tmp_path):
    write_favorita_raw(tmp_path / "raw")
    with pytest.raises(ValueError, match="store 99"):
        favorita.build(tmp_path / "raw", 99, favorita.DEFAULT_FAMILIES)
    with pytest.raises(ValueError, match="NOPE"):
        favorita.build(tmp_path / "raw", 44, ("NOPE",))
    with pytest.raises(FileNotFoundError):
        favorita.build(tmp_path / "empty", 44, favorita.DEFAULT_FAMILIES)


def test_outputs_roundtrip_through_parquet(tmp_path):
    write_favorita_raw(tmp_path / "raw")
    frame = favorita.build(tmp_path / "raw", 44, favorita.DEFAULT_FAMILIES)
    frame.to_parquet(tmp_path / "out.parquet", index=False)

    back = pd.read_parquet(tmp_path / "out.parquet")
    pd.testing.assert_frame_equal(back, frame)
    assert np.isfinite(back["target"]).all()
