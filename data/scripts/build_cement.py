"""Build the manufacturing demo: India cement production index (monthly, base 2011-12=100).

Source: Office of the Economic Adviser, DPIIT - Index of Eight Core Industries.
    https://eaindustry.nic.in/ici_download_data.asp  ("Download ICI data (Base Year = 2011-12)")

Output (universal long template): date, series_id="cement", target=cement index, plus the
other seven core-industry indices as factor columns (for the Factor check demo).

    cd backend
    uv run python ../data/scripts/build_cement.py \
        --source ../data/raw/cement/Core_Industries_2011_12.xlsx \
        --out ../data/processed/manufacturing_cement.parquet
"""

import argparse
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "data" / "raw" / "cement" / "Core_Industries_2011_12.xlsx"
DEFAULT_OUT = ROOT / "data" / "processed" / "manufacturing_cement.parquet"
SHEET = "Index"
TARGET = "cement"


def column_key(header: str) -> str:
    """'Index of Petroleum Refinery Products' -> 'petroleum_refinery_products'."""
    name = re.sub(r"^\s*index of\s+", "", str(header), flags=re.IGNORECASE)
    name = re.sub(r"\(.*?\)", "", name)
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def build(source: Path) -> pd.DataFrame:
    raw = pd.read_excel(source, sheet_name=SHEET)
    month_col = raw.columns[0]
    # Monthly rows have a real date; annual summary rows ("2012-13(Apr-Mar)") and blanks don't.
    is_month = raw[month_col].map(lambda v: isinstance(v, (datetime, pd.Timestamp)))
    monthly = raw[is_month].copy()
    monthly["date"] = pd.to_datetime(monthly[month_col]).dt.to_period("M").dt.to_timestamp()

    renamed = {c: column_key(c) for c in raw.columns[1:] if not str(c).startswith("Unnamed")}
    monthly = monthly.rename(columns=renamed)
    if TARGET not in monthly.columns:
        raise ValueError(f"No cement column found; got {sorted(renamed.values())}")
    # The overall index includes cement itself, so it would leak the target.
    factors = [c for c in renamed.values() if c not in (TARGET, "overall_index")]

    out = pd.DataFrame(
        {
            "date": monthly["date"].dt.strftime("%Y-%m-%d"),
            "series_id": TARGET,
            "target": monthly[TARGET].astype(float).round(4),
        }
    )
    for name in factors:
        out[name] = pd.to_numeric(monthly[name], errors="coerce").round(4)
    out = out.sort_values("date").reset_index(drop=True)
    if out["date"].duplicated().any():
        raise ValueError("Duplicate months in source")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    frame = build(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(args.out, index=False)
    print(
        f"wrote {args.out} - {len(frame)} months "
        f"({frame['date'].iloc[0]} ... {frame['date'].iloc[-1]}), "
        f"factors: {', '.join(frame.columns[3:])}"
    )


if __name__ == "__main__":
    main()
