"""Build the retail demo: UCI Online Retail II (daily), one UK online store x 5 product families.

Source: UCI Machine Learning Repository, "Online Retail II" (Chen, 2012), CC BY 4.0.
    https://archive.ics.uci.edu/dataset/502/online+retail+ii
Download (no account needed):
    curl -L -o data/raw/online_retail/online_retail_ii.zip \
        https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip
    (the .zip or the extracted online_retail_II.xlsx both work)

The source has no category column, so product families are assigned from the item description
by keyword; the first family that matches wins (see FAMILIES). Cancellations (invoice "C...")
and rows with non-positive quantity or price are dropped.

Output (universal long template): date, series_id=<family>, target=units sold that day, plus
factors `avg_unit_price` (quantity-weighted, carried forward on days without sales) and
`holiday` (1 on a UK bank holiday). Days without sales, including Saturdays and the Christmas
shutdown when the shop did not trade, are recorded as 0 units: they are real zero-sales days.

    cd backend
    uv run python ../data/scripts/build_online_retail.py
"""

import argparse
import zipfile
from pathlib import Path

import holidays
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RAW = ROOT / "data" / "raw" / "online_retail"
DEFAULT_OUT = ROOT / "data" / "processed" / "retail_online.parquet"
WORKBOOK = "online_retail_II.xlsx"
HOLIDAY_COUNTRY = "GB"
# family -> regex on the upper-case description, checked in this order (first match wins)
FAMILIES = {
    "CHRISTMAS": r"CHRISTMAS",
    "CANDLES & T-LIGHTS": r"CANDLE|T-LIGHT",
    "BAGS": r"\bBAGS?\b",
    "CARDS & WRAP": r"\bCARDS?\b|\bWRAP",
    "MUGS & CUPS": r"\bMUGS?\b|\bCUPS?\b",
}
COLUMNS = ["Invoice", "Description", "Quantity", "InvoiceDate", "Price"]


def read_source(raw_dir: Path) -> pd.DataFrame:
    """All sheets of the workbook, from the .xlsx or a .zip that contains it."""
    path = raw_dir / WORKBOOK
    if path.exists():
        sheets = pd.read_excel(path, sheet_name=None, usecols=COLUMNS)
    else:
        sheets = None
        for archive in sorted(raw_dir.glob("*.zip")):
            with zipfile.ZipFile(archive) as zf:
                if WORKBOOK in zf.namelist():
                    with zf.open(WORKBOOK) as fh:
                        sheets = pd.read_excel(fh, sheet_name=None, usecols=COLUMNS)
                    break
        if sheets is None:
            raise FileNotFoundError(f"{WORKBOOK} not found in {raw_dir} (or a .zip inside it)")
    return pd.concat(sheets.values(), ignore_index=True)


def assign_family(descriptions: pd.Series) -> pd.Series:
    text = descriptions.fillna("").astype(str).str.upper()
    family = pd.Series(pd.NA, index=descriptions.index, dtype="object")
    for name, pattern in FAMILIES.items():
        family = family.where(family.notna() | ~text.str.contains(pattern, regex=True), name)
    return family


def build(raw: pd.DataFrame) -> pd.DataFrame:
    sales = raw[
        ~raw["Invoice"].astype(str).str.startswith("C") & (raw["Quantity"] > 0) & (raw["Price"] > 0)
    ].copy()
    sales["family"] = assign_family(sales["Description"])
    sales = sales.dropna(subset=["family"])
    if sales.empty:
        raise ValueError("no sales rows match any product family")
    sales["date"] = pd.to_datetime(sales["InvoiceDate"]).dt.normalize()
    sales["revenue"] = sales["Quantity"] * sales["Price"]

    daily = sales.groupby(["family", "date"])[["Quantity", "revenue"]].sum()
    days = pd.date_range(sales["date"].min(), sales["date"].max(), freq="D")
    bank_holidays = holidays.country_holidays(HOLIDAY_COUNTRY, years=sorted(set(days.year)))
    holiday = [float(d in bank_holidays) for d in days]

    frames = []
    for family in FAMILIES:
        if family not in daily.index.get_level_values("family"):
            raise ValueError(f"family {family!r} has no sales")
        one = daily.loc[family].reindex(days)
        units = one["Quantity"].fillna(0.0)
        price = (one["revenue"] / one["Quantity"]).ffill().bfill()
        frames.append(
            pd.DataFrame(
                {
                    "date": days.strftime("%Y-%m-%d"),
                    "series_id": family,
                    "target": units.astype(float).to_numpy(),
                    "avg_unit_price": price.round(4).to_numpy(),
                    "holiday": holiday,
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    frame = build(read_source(args.raw_dir))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(args.out, index=False)
    print(
        f"wrote {args.out} - {frame['series_id'].nunique()} families, {len(frame)} rows "
        f"({frame['date'].min()} ... {frame['date'].max()}), holiday_country={HOLIDAY_COUNTRY}"
    )


if __name__ == "__main__":
    main()
