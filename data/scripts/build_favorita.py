"""Build the retail demo: Favorita store sales (daily), one store x a few product families.

Source: Kaggle "Store Sales - Time Series Forecasting" (Corporacion Favorita, Ecuador).
    https://www.kaggle.com/competitions/store-sales-time-series-forecasting/data
Download (needs a Kaggle account that has accepted the competition rules):
    kaggle competitions download -c store-sales-time-series-forecasting -p data/raw/favorita
    (unzip it, or leave the .zip - both work)

Output (universal long template): date, series_id=<family>, target=sales, plus factors
`onpromotion` (items on promotion that day) and `holiday` (1 on a holiday that applies to the
store: national, its state or its city; transferred holidays excluded).

    cd backend
    uv run python ../data/scripts/build_favorita.py --store 44
"""

import argparse
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RAW = ROOT / "data" / "raw" / "favorita"
DEFAULT_OUT = ROOT / "data" / "processed" / "retail_favorita.parquet"
DEFAULT_STORE = 44  # largest store (Quito)
DEFAULT_FAMILIES = ("GROCERY I", "BEVERAGES", "PRODUCE", "CLEANING", "DAIRY")
HOLIDAY_TYPES = {"Holiday", "Transfer", "Additional", "Bridge"}
HOLIDAY_COUNTRY = "EC"


def _read(raw_dir: Path, name: str) -> pd.DataFrame:
    path = raw_dir / name
    if path.exists():
        return pd.read_csv(path)
    for archive in sorted(raw_dir.glob("*.zip")):
        with zipfile.ZipFile(archive) as zf:
            if name in zf.namelist():
                with zf.open(name) as fh:
                    return pd.read_csv(fh)
    raise FileNotFoundError(f"{name} not found in {raw_dir} (or a .zip inside it)")


def holiday_flags(holidays: pd.DataFrame, store: pd.Series) -> pd.Series:
    """1 for each date with a holiday that applies to this store."""
    applies = (
        (holidays["locale"] == "National")
        | ((holidays["locale"] == "Regional") & (holidays["locale_name"] == store["state"]))
        | ((holidays["locale"] == "Local") & (holidays["locale_name"] == store["city"]))
    )
    transferred = holidays["transferred"].astype(str).str.lower().eq("true")
    keep = applies & holidays["type"].isin(HOLIDAY_TYPES) & ~transferred
    dates = pd.to_datetime(holidays.loc[keep, "date"]).drop_duplicates()
    return pd.Series(1, index=pd.DatetimeIndex(dates))


def build(raw_dir: Path, store_nbr: int, families: tuple[str, ...]) -> pd.DataFrame:
    train = _read(raw_dir, "train.csv")
    stores = _read(raw_dir, "stores.csv")
    holidays = _read(raw_dir, "holidays_events.csv")

    match = stores[stores["store_nbr"] == store_nbr]
    if match.empty:
        raise ValueError(f"store {store_nbr} not in stores.csv")
    store = match.iloc[0]

    rows = train[(train["store_nbr"] == store_nbr) & train["family"].isin(families)]
    missing = sorted(set(families) - set(rows["family"]))
    if missing:
        raise ValueError(f"families not found for store {store_nbr}: {missing}")

    dates = pd.to_datetime(rows["date"])
    flags = holiday_flags(holidays, store)
    out = pd.DataFrame(
        {
            "date": dates.dt.strftime("%Y-%m-%d"),
            "series_id": rows["family"].to_numpy(),
            "target": rows["sales"].astype(float).round(3).to_numpy(),
            "onpromotion": rows["onpromotion"].astype(float).to_numpy(),
            "holiday": dates.map(lambda d: float(flags.get(d, 0))).to_numpy(),
        }
    )
    # Stores are closed on 25 Dec and the source has no row for it; the health check reports
    # those as missing dates and fills them as blanks, which is the honest treatment.
    return out.sort_values(["series_id", "date"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--store", type=int, default=DEFAULT_STORE)
    parser.add_argument("--families", nargs="+", default=list(DEFAULT_FAMILIES))
    args = parser.parse_args()

    frame = build(args.raw_dir, args.store, tuple(args.families))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(args.out, index=False)
    print(
        f"wrote {args.out} - store {args.store}, {frame['series_id'].nunique()} families, "
        f"{len(frame)} rows ({frame['date'].min()} ... {frame['date'].max()}), "
        f"holiday_country={HOLIDAY_COUNTRY}"
    )


if __name__ == "__main__":
    main()
