"""Year in review: replay past forecast origins and rank what surprised us.

At each origin we forecast the next ``step`` periods using only data before the origin, then
compare with what happened. Pure logic; the model call is injected as ``Forecaster`` so it can
be unit-tested with a fake.

Ranking rules (product choices, see backend/README.md):
- A period is a candidate when the actual fell outside P10–P90, or (hourly/daily/weekly only)
  when a calendar event falls in it, so a festival that was as big as expected is reported as
  such. Monthly and longer periods almost always contain some holiday, so there only band
  breaches are listed (still tagged with their calendar events).
- Positive surprises have actual > P50, misses actual < P50. Each list is ranked by
  |deviation_pct| and cut to ``top_n``.
- ``recurring_as_expected`` is true for a calendar-event period whose actual stayed in the band.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

import holidays as holidays_lib
import numpy as np
import pandas as pd

from app.services.health_check import MIN_POINTS, format_date, future_dates

logger = logging.getLogger(__name__)

# (lookback periods ≈ 12 months, origin spacing) by frequency.
DEFAULTS = {
    "hourly": (24 * 28, 24),
    "daily": (364, 7),
    "weekly": (52, 1),
    "monthly": (12, 1),
    "quarterly": (4, 1),
    "yearly": (3, 1),
}
MAX_ORIGINS = 120
# Frequencies where a holiday inside the period is specific enough to list an in-band period.
EVENT_FREQUENCIES = {"hourly", "daily", "weekly"}

# context (1-D, NaN allowed), horizon, seed → (quantiles (9, h) for levels 0.1..0.9, paths (n, h))
Forecaster = Callable[[np.ndarray, int, int], tuple[np.ndarray, np.ndarray]]


@dataclass
class Period:
    date: pd.Timestamp
    actual: float
    p10: float
    p50: float
    p90: float
    mean: float

    @property
    def inside(self) -> bool:
        return self.p10 <= self.actual <= self.p90

    @property
    def deviation_pct(self) -> float:
        return (self.actual - self.p50) / abs(self.p50) * 100 if self.p50 else 0.0


def default_window(frequency: str) -> tuple[int, int]:
    return DEFAULTS.get(frequency, (12, 1))


def origins(n: int, lookback: int, step: int) -> list[tuple[int, int]]:
    """(origin index, horizon) pairs tiling the last ``lookback`` points, oldest first."""
    start = max(0, n - lookback)
    starts = list(range(start, n, step))[-MAX_ORIGINS:]
    return [(o, min(step, n - o)) for o in starts]


def replay(
    history: pd.Series, lookback: int, step: int, forecaster: Forecaster, seed: int = 0
) -> list[Period]:
    """Forecast each replayed period from data strictly before its origin."""
    values = history.to_numpy(dtype=np.float64)
    periods: list[Period] = []
    for i, (origin, horizon) in enumerate(origins(len(values), lookback, step)):
        context = values[:origin]
        if np.isfinite(context).sum() < MIN_POINTS:
            continue
        quantiles, paths = forecaster(context, horizon, seed + i)
        for k in range(horizon):
            actual = values[origin + k]
            if not np.isfinite(actual):
                continue
            periods.append(
                Period(
                    date=history.index[origin + k],
                    actual=float(actual),
                    p10=float(quantiles[0, k]),
                    p50=float(quantiles[4, k]),
                    p90=float(quantiles[8, k]),
                    mean=float(np.mean(paths[:, k])),
                )
            )
    return periods


def calendar_events(
    dates: list[pd.Timestamp], frequency: str, country: str | None
) -> dict[pd.Timestamp, list[str]]:
    """Holiday names falling inside each period (the period runs to the next grid date)."""
    if not country or not dates:
        return {}
    years = list(range(min(dates).year - 1, max(dates).year + 2))
    try:
        calendar = holidays_lib.country_holidays(country, years=years)
    except (NotImplementedError, KeyError):
        logger.warning("No holiday calendar for country %r", country)
        return {}
    events: dict[pd.Timestamp, list[str]] = {}
    for start in dates:
        end = future_dates(start, frequency, 1)[0] if frequency != "unknown" else start
        days = pd.date_range(
            start.normalize(),
            max(end.normalize() - pd.Timedelta(days=1), start.normalize()),
            freq="D",
        )
        names: list[str] = []
        for day in days:
            for name in str(calendar.get(date(day.year, day.month, day.day)) or "").split("; "):
                if name and name not in names:
                    names.append(name)
        if names:
            events[start] = names
    return events


def _event(period: Period, events: list[str], annotation: str | None) -> dict:
    return {
        "date": format_date(period.date),
        "actual": round(period.actual, 6),
        "expected_p50": round(period.p50, 6),
        "expected_p10": round(period.p10, 6),
        "expected_p90": round(period.p90, 6),
        "deviation_pct": round(period.deviation_pct, 2),
        "calendar_events": events,
        "recurring_as_expected": bool(events) and period.inside,
        "annotation": annotation,
    }


def summarize(
    series_id: str,
    periods: list[Period],
    events: dict[pd.Timestamp, list[str]],
    annotations: dict[str, str],
    top_n: int,
    frequency: str = "daily",
) -> dict:
    list_events = frequency in EVENT_FREQUENCIES
    candidates = [p for p in periods if not p.inside or (list_events and p.date in events)]
    ranked = sorted(candidates, key=lambda p: abs(p.deviation_pct), reverse=True)

    def pick(positive: bool) -> list[dict]:
        chosen = [p for p in ranked if (p.actual > p.p50) == positive and p.actual != p.p50]
        return [
            _event(p, events.get(p.date, []), annotations.get(format_date(p.date)))
            for p in chosen[:top_n]
        ]

    result = {"series_id": series_id, "positive_surprises": pick(True), "misses": pick(False)}
    if periods:
        result["expected_total"] = round(sum(p.mean for p in periods), 6)
        result["actual_total"] = round(sum(p.actual for p in periods), 6)
        result["band_coverage"] = round(float(np.mean([p.inside for p in periods])), 4)
    return result
