"""Template validation, frequency detection and the data health check.

Pure functions on DataFrames: no I/O. Input is the universal long template
(date, series_id, target, optional numeric factor columns). Output is a cleaned frame on a
regular date grid (missing dates filled as blanks, duplicates resolved, ±inf → NaN) plus the
health report in the contract's shape.
"""

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

REQUIRED_COLUMNS = ("date", "series_id", "target")
MIN_POINTS = 30
MAX_FACTORS = 10

# (label, severity when count > 0, action taken)
CHECKS: dict[str, tuple[str, str, str]] = {
    "missing_dates": ("Missing dates", "warning", "Filled as blanks"),
    "duplicates": ("Duplicates", "warning", "Kept the last row for each date"),
    "negative_values": ("Negative values", "info", "Kept as is"),
    "non_finite": ("Non-finite values", "warning", "Replaced with blanks"),
    "too_short": (
        "Too short",
        "warning",
        f"Excluded from forecasting (needs at least {MIN_POINTS} values)",
    ),
    "constant_series": ("Constant series", "warning", "Forecast will be flat"),
    "irregular_spacing": ("Irregular spacing", "error", "Excluded from forecasting"),
    "too_many_factors": (
        "Too many factors",
        "warning",
        f"Ignored factor columns beyond the first {MAX_FACTORS}",
    ),
}
EXCLUDING_CHECKS = {"too_short", "irregular_spacing"}

# Frequencies with a fixed step, and calendar frequencies stepped in months.
_FIXED_STEPS = {
    "hourly": pd.Timedelta(hours=1),
    "daily": pd.Timedelta(days=1),
    "weekly": pd.Timedelta(days=7),
}
_MONTH_STEPS = {"monthly": 1, "quarterly": 3, "yearly": 12}


class DatasetError(Exception):
    """The file cannot be used at all (wrong columns, unparsable values)."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


@dataclass
class HealthResult:
    frame: pd.DataFrame
    frequency: str
    factor_columns: list[str]
    series: list[dict[str, Any]]
    report: dict[str, Any]
    date_range: dict[str, str] | None


def format_date(value: pd.Timestamp) -> str:
    return value.isoformat()


def _examples(values: pd.Series, limit: int = 5) -> list[str]:
    return [str(v) for v in values.drop_duplicates().head(limit)]


def _to_number(column: pd.Series, name: str) -> pd.Series:
    if pd.api.types.is_bool_dtype(column):
        raise DatasetError("invalid_columns", f"Column {name!r} must be numeric", {"column": name})
    numbers = pd.to_numeric(column, errors="coerce")
    bad = column.notna() & numbers.isna()
    if pd.api.types.is_object_dtype(column) or pd.api.types.is_string_dtype(column):
        bad &= column.astype("string").str.strip().ne("")
    if bad.any():
        raise DatasetError(
            "invalid_columns",
            f"Column {name!r} must contain plain numbers (no commas or currency symbols)",
            {"column": name, "examples": _examples(column[bad])},
        )
    return numbers.astype("float64")


def validate_template(raw: pd.DataFrame) -> tuple[pd.DataFrame, list[str], list[str]]:
    """Check the template columns and coerce types.

    Returns (frame, factor_columns, ignored_factor_columns). Raises DatasetError.
    """
    df = raw.rename(columns=lambda c: str(c).strip())
    lowered = {c.lower(): c for c in df.columns}
    missing = [c for c in REQUIRED_COLUMNS if c not in lowered]
    if missing:
        raise DatasetError(
            "invalid_columns",
            f"Missing required column(s): {', '.join(missing)}",
            {"missing": missing, "found": [str(c) for c in raw.columns]},
        )
    df = df.rename(columns={lowered[c]: c for c in REQUIRED_COLUMNS})
    if df.columns.duplicated().any():
        raise DatasetError("invalid_columns", "Column names must be unique")
    if df.empty:
        raise DatasetError("empty_file", "The file has no rows")

    dates = pd.to_datetime(df["date"], errors="coerce", format="ISO8601")
    if dates.isna().any():
        raise DatasetError(
            "invalid_dates",
            "Every row needs a date in ISO format (YYYY-MM-DD or YYYY-MM-DD HH:MM)",
            {"examples": _examples(df.loc[dates.isna(), "date"])},
        )
    if dates.dt.tz is not None:
        dates = dates.dt.tz_localize(None)

    series_id = df["series_id"]
    blank_id = series_id.isna() | series_id.astype("string").str.strip().eq("")
    if blank_id.any():
        raise DatasetError("invalid_columns", f"{int(blank_id.sum())} row(s) have no series_id")

    factors = [c for c in df.columns if c not in REQUIRED_COLUMNS]
    kept, ignored = factors[:MAX_FACTORS], factors[MAX_FACTORS:]
    clean = pd.DataFrame(
        {
            "date": dates.astype("datetime64[ns]"),
            "series_id": series_id.astype("string").str.strip().astype(object),
            "target": _to_number(df["target"], "target"),
        }
    )
    for name in kept:
        clean[name] = _to_number(df[name], name)
    return clean, kept, ignored


def detect_frequency(df: pd.DataFrame) -> str:
    """Median spacing between consecutive dates within each series."""
    dates = df[["series_id", "date"]].drop_duplicates().sort_values(["series_id", "date"])
    diffs = dates.groupby("series_id")["date"].diff().dropna()
    if diffs.empty:
        return "unknown"
    median = diffs.median()
    for name, step in _FIXED_STEPS.items():
        if median == step:
            return name
    days = median / pd.Timedelta(days=1)
    if 28 <= days <= 31:
        return "monthly"
    if 89 <= days <= 92:
        return "quarterly"
    if 365 <= days <= 366:
        return "yearly"
    return "unknown"


def _grid(dates: pd.DatetimeIndex, frequency: str) -> pd.DatetimeIndex | None:
    """Regular grid from the first to the last date, or None if dates don't sit on one."""
    start, end = dates[0], dates[-1]
    if frequency in _FIXED_STEPS:
        grid = pd.date_range(start, end, freq=_FIXED_STEPS[frequency])
    elif frequency in _MONTH_STEPS:
        months = _MONTH_STEPS[frequency]
        if dates.is_month_end.all():
            grid = pd.date_range(start, end, freq=f"{months}ME")
        else:
            grid = pd.date_range(start, end, freq=pd.DateOffset(months=months))
    else:
        return None
    return grid if dates.isin(grid).all() else None


def _check(check_id: str, count: int, percent: float | None, affected: list[str]) -> dict:
    label, severity, action = CHECKS[check_id]
    check: dict[str, Any] = {
        "id": check_id,
        "label": label,
        "severity": severity if count else "info",
        "count": int(count),
    }
    if percent is not None:
        check["percent"] = round(float(percent), 2)
    if count:
        check["action_taken"] = action
        check["affected_series"] = sorted(affected)
    return check


def _pct(part: int, whole: int) -> float:
    return 100.0 * part / whole if whole else 0.0


def run_health_check(raw: pd.DataFrame) -> HealthResult:
    df, factor_columns, ignored_factors = validate_template(raw)
    value_columns = ["target", *factor_columns]
    total_rows = len(df)

    # Non-finite values (±inf) are treated as unknown (Yug issue #7: inf reads as observed 0).
    values = df[value_columns].to_numpy()
    non_finite_rows = np.isinf(values).any(axis=1)
    non_finite_series = df.loc[non_finite_rows, "series_id"].unique().tolist()
    df[value_columns] = df[value_columns].replace([np.inf, -np.inf], np.nan)

    duplicated = df.duplicated(["series_id", "date"], keep="last")
    duplicate_series = df.loc[duplicated, "series_id"].unique().tolist()
    df = df.loc[~duplicated].sort_values(["series_id", "date"], kind="stable")

    frequency = detect_frequency(df)

    issues: dict[str, list[str]] = {}
    pieces: list[pd.DataFrame] = []
    missing_dates = 0
    grid_points = 0
    for sid, group in df.groupby("series_id", sort=True):
        sid = str(sid)
        series_issues = issues.setdefault(sid, [])
        dates = pd.DatetimeIndex(group["date"])
        grid = _grid(dates, frequency)
        if grid is None:
            series_issues.append("irregular_spacing")
            pieces.append(group)
            continue
        filled = group.set_index("date").reindex(grid).rename_axis("date").reset_index()
        filled["series_id"] = sid
        gap = len(grid) - len(group)
        if gap:
            series_issues.append("missing_dates")
        missing_dates += gap
        grid_points += len(grid)
        pieces.append(filled[group.columns])

    frame = pd.concat(pieces, ignore_index=True)
    for sid in non_finite_series:
        issues[sid].append("non_finite")
    for sid in duplicate_series:
        issues[sid].append("duplicates")

    negative = frame["target"] < 0
    negative_series = frame.loc[negative, "series_id"].unique().tolist()
    for sid in negative_series:
        issues[sid].append("negative_values")

    summaries = []
    for sid, group in frame.groupby("series_id", sort=True):
        sid = str(sid)
        target = group["target"]
        observed = int(target.notna().sum())
        if "irregular_spacing" not in issues[sid] and observed < MIN_POINTS:
            issues[sid].append("too_short")
        elif observed and target.nunique() == 1:
            issues[sid].append("constant_series")
        series_issues = sorted(set(issues[sid]), key=list(CHECKS).index)
        if EXCLUDING_CHECKS & set(series_issues):
            status = "excluded"
        elif series_issues:
            status = "warning"
        else:
            status = "ready"
        summaries.append(
            {
                "series_id": sid,
                "length": len(group),
                "start": format_date(group["date"].min()),
                "end": format_date(group["date"].max()),
                "missing_count": int(target.isna().sum()),
                "status": status,
                "issues": series_issues,
            }
        )

    def with_issue(check_id: str) -> list[str]:
        return [s["series_id"] for s in summaries if check_id in s["issues"]]

    n_series = len(summaries)
    observed_rows = int(frame["target"].notna().sum())
    checks = [
        _check(
            "missing_dates",
            missing_dates,
            _pct(missing_dates, grid_points),
            with_issue("missing_dates"),
        ),
        _check(
            "duplicates",
            int(duplicated.sum()),
            _pct(int(duplicated.sum()), total_rows),
            duplicate_series,
        ),
        _check(
            "negative_values",
            int(negative.sum()),
            _pct(int(negative.sum()), observed_rows),
            negative_series,
        ),
        _check(
            "non_finite",
            int(non_finite_rows.sum()),
            _pct(int(non_finite_rows.sum()), total_rows),
            non_finite_series,
        ),
    ]
    for check_id in ("too_short", "constant_series", "irregular_spacing"):
        affected = with_issue(check_id)
        checks.append(_check(check_id, len(affected), _pct(len(affected), n_series), affected))
    too_many = _check("too_many_factors", len(ignored_factors), None, [])
    if ignored_factors:
        too_many.pop("affected_series")
    checks.append(too_many)

    return HealthResult(
        frame=frame,
        frequency=frequency,
        factor_columns=factor_columns,
        series=summaries,
        report={"ready": any(s["status"] != "excluded" for s in summaries), "checks": checks},
        date_range={
            "start": format_date(frame["date"].min()),
            "end": format_date(frame["date"].max()),
        },
    )
