"""Accuracy: backtest the last few forecast horizons and score them against what happened.

Origins are spaced one horizon apart and end at the last observed period, so the backtested
periods tile the end of the history without overlap. Each origin forecasts from data strictly
before it. Pure logic; the model call is injected as ``Forecaster`` (same shape as the review).

Scores (percentages 0-100, coverage shares 0-1):
- WAPE = sum|actual - P50| / sum|actual| * 100; bias = sum(P50 - actual) / sum|actual| * 100.
- Range accuracy = share of actuals inside P10-P90.
- Calibration = share of actuals at or below each quantile level.
- Naive baseline = seasonal naive (repeat the last season before the origin). It is scored on
  the periods where it exists; the model is re-scored on the same periods for the comparison.
- Portfolio = all series pooled, so every sum is naturally weighted by volume; range accuracy
  is the volume-weighted mean of the series' coverage.
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from app.services.health_check import MIN_POINTS, format_date
from app.services.review import Forecaster

# Season length (periods) for the naive baseline.
SEASON = {"hourly": 24, "daily": 7, "weekly": 52, "monthly": 12, "quarterly": 4, "yearly": 1}


@dataclass
class Backtest:
    dates: list[pd.Timestamp] = field(default_factory=list)
    actual: list[float] = field(default_factory=list)  # NaN where nothing was observed
    quantiles: list[np.ndarray] = field(default_factory=list)  # (9,) per period
    naive: list[float] = field(default_factory=list)  # NaN where no naive value exists
    origins: int = 0


def season_length(frequency: str) -> int:
    return SEASON.get(frequency, 1)


def origin_indices(n: int, horizon: int, origins: int) -> list[int]:
    """Origin indices, oldest first, spaced one horizon apart and ending at the series end."""
    return [n - k * horizon for k in range(origins, 0, -1) if n - k * horizon >= 0]


def seasonal_naive(context: np.ndarray, horizon: int, season: int) -> np.ndarray:
    """Repeat the last ``season`` values of the context; NaN if the context is too short."""
    if len(context) < season:
        return np.full(horizon, np.nan)
    last = context[-season:]
    return np.array([last[k % season] for k in range(horizon)], dtype=np.float64)


def backtest(
    history: pd.Series,
    horizon: int,
    origins: int,
    frequency: str,
    forecaster: Forecaster,
    seed: int = 0,
) -> Backtest:
    values = history.to_numpy(dtype=np.float64)
    season = season_length(frequency)
    result = Backtest()
    for i, origin in enumerate(origin_indices(len(values), horizon, origins)):
        context = values[:origin]
        if np.isfinite(context).sum() < MIN_POINTS:
            continue
        quantiles, _ = forecaster(context, horizon, seed + i)
        naive = seasonal_naive(context, horizon, season)
        result.origins += 1
        for k in range(horizon):
            result.dates.append(history.index[origin + k])
            result.actual.append(float(values[origin + k]))
            result.quantiles.append(np.asarray(quantiles[:, k], dtype=np.float64))
            result.naive.append(float(naive[k]))
    return result


@dataclass
class Sums:
    """Running sums for one series or the whole portfolio."""

    abs_error: float = 0.0
    error: float = 0.0
    volume: float = 0.0
    inside: int = 0
    count: int = 0
    naive_abs_error: float = 0.0
    model_abs_error_on_naive: float = 0.0
    naive_volume: float = 0.0

    def add(self, other: "Sums") -> None:
        for name in self.__dataclass_fields__:
            setattr(self, name, getattr(self, name) + getattr(other, name))


def _pct(num: float, den: float) -> float:
    return num / den * 100 if den > 0 else 0.0


def sums(bt: Backtest) -> Sums:
    s = Sums()
    for actual, q, naive in zip(bt.actual, bt.quantiles, bt.naive, strict=True):
        if not np.isfinite(actual):
            continue
        p10, p50, p90 = q[0], q[4], q[8]
        s.abs_error += abs(actual - p50)
        s.error += p50 - actual
        s.volume += abs(actual)
        s.inside += int(p10 <= actual <= p90)
        s.count += 1
        if np.isfinite(naive):
            s.naive_abs_error += abs(actual - naive)
            s.model_abs_error_on_naive += abs(actual - p50)
            s.naive_volume += abs(actual)
    return s


def metrics(s: Sums, coverage: float | None = None) -> dict:
    out = {
        "wape": round(_pct(s.abs_error, s.volume), 4),
        "bias_pct": round(_pct(s.error, s.volume), 4),
        "coverage_p10_p90": round(
            coverage if coverage is not None else (s.inside / s.count if s.count else 0.0), 4
        ),
        "naive_wape": None,
        "improvement_vs_naive_pct": None,
    }
    if s.naive_volume > 0:
        naive_wape = _pct(s.naive_abs_error, s.naive_volume)
        model_wape = _pct(s.model_abs_error_on_naive, s.naive_volume)
        out["naive_wape"] = round(naive_wape, 4)
        if naive_wape > 0:
            out["improvement_vs_naive_pct"] = round((naive_wape - model_wape) / naive_wape * 100, 4)
    return out


def quantile_coverage(bt: Backtest, levels: list[float]) -> list[dict]:
    observed = [(a, q) for a, q in zip(bt.actual, bt.quantiles, strict=True) if np.isfinite(a)]
    return [
        {
            "level": level,
            "observed": round(float(np.mean([a <= q[i] for a, q in observed])), 4)
            if observed
            else 0.0,
        }
        for i, level in enumerate(levels)
    ]


def series_result(series_id: str, bt: Backtest, levels: list[float], round_values) -> dict:
    q = np.array(bt.quantiles).reshape(-1, len(levels))
    return {
        "series_id": series_id,
        **metrics(sums(bt)),
        "quantile_coverage": quantile_coverage(bt, levels),
        "backtest": {
            "dates": [format_date(d) for d in bt.dates],
            "actual": [None if not np.isfinite(a) else a for a in round_values(bt.actual)],
            "p10": round_values(q[:, 0]),
            "p50": round_values(q[:, 4]),
            "p90": round_values(q[:, 8]),
        },
    }


def portfolio(backtests: list[Backtest]) -> dict:
    total = Sums()
    weighted_coverage = 0.0
    for bt in backtests:
        s = sums(bt)
        total.add(s)
        if s.count:
            weighted_coverage += s.volume * s.inside / s.count
    coverage = weighted_coverage / total.volume if total.volume > 0 else None
    return metrics(total, coverage)
