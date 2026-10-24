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
online_retail = load_script("build_online_retail")


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


def online_retail_rows(days: int = 40) -> pd.DataFrame:
    """Mimic the UCI workbook: one row per invoice line, no sales on Saturdays."""
    rows = []
    for i, day in enumerate(pd.date_range("2010-12-01", periods=days, freq="D")):
        if day.day_of_week == 5:
            continue
        stamp = day + pd.Timedelta(hours=10)
        for description, qty, price in [
            ("JUMBO BAG RED RETROSPOT", 10 + i, 2.0),
            ("LUNCH BAG BLACK SKULL", 5, 1.5),
            ("WHITE HANGING HEART T-LIGHT HOLDER", 6, 2.55),
            ("CHRISTMAS CANDLE HOLDER", 3, 4.0),  # Christmas wins over candles
            ("BIRTHDAY CARD, RETRO SPOT", 12, 0.42),
            ("HOME SWEET HOME MUG", 4, 2.95),
            ("PAPER CRAFT, LITTLE BIRDIE", 99, 0.1),  # no family: dropped
        ]:
            rows.append([f"{500000 + i}", description, qty, stamp, price])
        rows.append([f"C{600000 + i}", "JUMBO BAG RED RETROSPOT", -50, stamp, 2.0])
    return pd.DataFrame(rows, columns=online_retail.COLUMNS)


@pytest.mark.parametrize("as_zip", [False, True])
def test_online_retail_builder_outputs_template(tmp_path, as_zip):
    raw = tmp_path / "raw"
    raw.mkdir()
    workbook = raw / online_retail.WORKBOOK
    with pd.ExcelWriter(workbook) as writer:  # two sheets, like the source
        online_retail_rows().iloc[:100].to_excel(writer, sheet_name="Year 1", index=False)
        online_retail_rows().iloc[100:].to_excel(writer, sheet_name="Year 2", index=False)
    if as_zip:
        with zipfile.ZipFile(raw / "online_retail_ii.zip", "w") as zf:
            zf.write(workbook, online_retail.WORKBOOK)
        workbook.unlink()

    frame = online_retail.build(online_retail.read_source(raw))

    assert set(frame["series_id"]) == set(online_retail.FAMILIES)
    assert list(frame.columns) == ["date", "series_id", "target", "avg_unit_price", "holiday"]
    bags = frame[frame["series_id"] == "BAGS"].set_index("date")
    assert bags.loc["2010-12-01", "target"] == 15  # 10 jumbo + 5 lunch; cancellation dropped
    assert bags.loc["2010-12-04", "target"] == 0  # Saturday: no trading, recorded as 0
    assert bags.loc["2010-12-04", "avg_unit_price"] == bags.loc["2010-12-03", "avg_unit_price"]
    christmas = frame[frame["series_id"] == "CHRISTMAS"].set_index("date")
    assert christmas.loc["2010-12-01", "target"] == 3
    assert frame.set_index("date").loc["2010-12-27", "holiday"].eq(1).all()

    health = run_health_check(frame)
    assert health.frequency == "daily" and health.report["ready"] is True
    assert health.factor_columns == ["avg_unit_price", "holiday"]


def test_online_retail_builder_errors(tmp_path):
    with pytest.raises(FileNotFoundError, match=online_retail.WORKBOOK):
        online_retail.read_source(tmp_path)
    no_mugs = online_retail_rows()
    no_mugs = no_mugs[~no_mugs["Description"].str.contains("MUG")]
    with pytest.raises(ValueError, match="MUGS"):
        online_retail.build(no_mugs)
