"""Input v2: turn an uploaded table (long or wide, any ID columns) into the internal long template.

Internal format stays `date, series_id, target, [factors...]`. Accepted on input:
- Long: `date, <id columns...>, target, [factors]`. With several ID columns, series_id is
  built as "a|b" and the ID columns are kept as the dataset's hierarchy (per-item attributes).
- Wide: `date, item_A, item_B, ...`, one column per item; converted to long. No factors.
- An optional `unit` column (one value) is used as the display unit and dropped.
Column names are matched case- and space-insensitively. Raises DatasetError.
"""

import json
from dataclasses import dataclass, field
from typing import Literal

import pandas as pd

from app.services.health_check import DatasetError

Format = Literal["auto", "long", "wide"]
SEPARATOR = "|"
UNIT_COLUMN = "unit"


@dataclass
class InputOptions:
    format: Format = "auto"
    date_column: str | None = None
    target_column: str | None = None
    id_columns: list[str] | None = None
    unit: str | None = None


@dataclass
class Reshaped:
    frame: pd.DataFrame  # date, series_id, target, [factors] (values not yet validated)
    input_format: Literal["long", "wide"]
    hierarchy: list[str] = field(default_factory=list)
    attributes: dict[str, dict[str, str]] = field(default_factory=dict)
    unit: str | None = None


def parse_id_columns(text: str | None) -> list[str] | None:
    """The `id_columns` form field: a JSON array of column names."""
    if text is None or not text.strip():
        return None
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        value = None
    if not (
        isinstance(value, list) and value and all(isinstance(v, str) and v.strip() for v in value)
    ):
        raise DatasetError(
            "invalid_id_columns", 'id_columns must be a JSON array of names, e.g. ["store","item"]'
        )
    return [v.strip() for v in value]


def read_json_records(data: bytes) -> pd.DataFrame:
    try:
        records = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DatasetError(
            "unreadable_file", "Could not read the file as JSON", {"reason": str(exc)}
        ) from exc
    if not isinstance(records, list) or not all(isinstance(r, dict) for r in records):
        raise DatasetError(
            "unreadable_file", 'JSON must be an array of records, e.g. [{"date": ...}, ...]'
        )
    # Strings like the CSV path; the health check coerces types with clear errors.
    frame = pd.DataFrame.from_records(records)
    return frame.astype(object).where(frame.notna(), None)


def looks_like_json(data: bytes) -> bool:
    return data.lstrip(b"\xef\xbb\xbf \t\r\n")[:1] in (b"[", b"{")


def _find(columns: dict[str, str], name: str) -> str | None:
    return columns.get(name.strip().lower())


def _require(columns: dict[str, str], names: list[str], raw: pd.DataFrame) -> list[str]:
    """Actual column names for ``names``; reports every missing one at once."""
    missing = [n for n in names if _find(columns, n) is None]
    if missing:
        raise DatasetError(
            "invalid_columns",
            f"Missing required column(s): {', '.join(missing)}",
            {"missing": missing, "found": [str(c) for c in raw.columns]},
        )
    return [columns[n.strip().lower()] for n in names]


def _numeric_like(column: pd.Series) -> bool:
    values = column.dropna()
    if values.empty:
        return True
    text = values.astype(str).str.strip()
    text = text[text != ""]
    return bool(pd.to_numeric(text, errors="coerce").notna().all())


def _take_unit(df: pd.DataFrame, columns: dict[str, str], given: str | None) -> str | None:
    found = _find(columns, UNIT_COLUMN)
    if found is None:
        return given
    values = df.pop(found).dropna().astype(str).str.strip()
    values = values[values != ""].unique()
    if given:
        return given
    return str(values[0]) if len(values) == 1 else None


def detect_format(raw: pd.DataFrame, options: InputOptions) -> Literal["long", "wide"]:
    if options.format != "auto":
        return options.format
    columns = {str(c).strip().lower(): str(c) for c in raw.columns}
    target = (options.target_column or "target").strip().lower()
    if options.id_columns or target in columns or "series_id" in columns:
        return "long"
    date = (options.date_column or "date").strip().lower()
    others = [c for key, c in columns.items() if key not in (date, UNIT_COLUMN)]
    if others and all(_numeric_like(raw[c]) for c in others):
        return "wide"
    return "long"  # let the long-format checks explain what is missing


def to_long(raw: pd.DataFrame, options: InputOptions | None = None) -> Reshaped:
    options = options or InputOptions()
    df = raw.rename(columns=lambda c: str(c).strip())
    if df.columns.duplicated().any():
        raise DatasetError("invalid_columns", "Column names must be unique")
    columns = {c.lower(): c for c in df.columns}
    input_format = detect_format(df, options)
    date_name = options.date_column or "date"
    if input_format == "wide":
        (date,) = _require(columns, [date_name], raw)
        return _wide(df, date, _take_unit(df, columns, options.unit))
    id_names = options.id_columns or ["series_id"]
    # Template order (date, IDs, target) so the error lists columns as the template does.
    date, *ids, target = _require(
        columns, [date_name, *id_names, options.target_column or "target"], raw
    )
    unit = _take_unit(df, columns, options.unit)
    return _long(df, columns, date, target, ids, unit)


def _wide(df: pd.DataFrame, date: str, unit: str | None) -> Reshaped:
    items = [c for c in df.columns if c != date]
    if not items:
        raise DatasetError("invalid_columns", "A wide file needs at least one item column")
    long = df.melt(id_vars=[date], value_vars=items, var_name="series_id", value_name="target")
    long = long.rename(columns={date: "date"})[["date", "series_id", "target"]]
    return Reshaped(frame=long, input_format="wide", unit=unit)


def _long(
    df: pd.DataFrame,
    columns: dict[str, str],
    date: str,
    target: str,
    ids: list[str],
    unit: str | None,
) -> Reshaped:
    if len(set(ids)) != len(ids) or date in ids or target in ids:
        raise DatasetError("invalid_id_columns", "ID columns must differ from date and target")
    for name in ids:
        blank = df[name].isna() | df[name].astype("string").str.strip().eq("")
        if blank.any():
            raise DatasetError("invalid_columns", f"{int(blank.sum())} row(s) have no {name}")
    parts = [df[c].astype("string").str.strip().astype(object) for c in ids]
    series_id = (
        parts[0]
        if len(parts) == 1
        else pd.Series(
            [SEPARATOR.join(values) for values in zip(*parts, strict=True)], index=df.index
        )
    )
    factors = [c for c in df.columns if c not in (date, target, *ids)]
    long = pd.DataFrame({"date": df[date], "series_id": series_id, "target": df[target]})
    for name in factors:
        if name.lower() in ("date", "series_id", "target"):
            raise DatasetError("invalid_columns", f"Column {name!r} clashes with a template name")
        long[name] = df[name]

    hierarchy = [] if ids == [columns.get("series_id")] else ids
    attributes: dict[str, dict[str, str]] = {}
    if hierarchy:
        firsts = pd.DataFrame({"series_id": series_id, **dict(zip(ids, parts, strict=True))})
        for row in firsts.drop_duplicates("series_id").itertuples(index=False):
            attributes[row[0]] = dict(zip(ids, row[1:], strict=True))
    return Reshaped(
        frame=long, input_format="long", hierarchy=hierarchy, attributes=attributes, unit=unit
    )
