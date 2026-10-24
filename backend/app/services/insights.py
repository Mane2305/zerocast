"""Portfolio risk metrics and last-year alignment. Pure functions, no I/O.

Quantile arrays are ``(n_quantiles, horizon)`` aligned with ``levels`` (0.1 … 0.9).
Thresholds below are product choices, documented in backend/README.md.
"""

import numpy as np
import pandas as pd

from app.services.health_check import one_cycle_earlier

# Uncertainty score = mean (P90 - P10) / |P50|. A score of 0.3 is a band of about ±15%.
PREDICTABLE_BELOW = 0.3
VOLATILE_FROM = 0.6
# Trust horizon: steps until the relative band width first exceeds this (about ±25%).
TRUST_THRESHOLD = 0.5
# Upside/downside when one side of the band is this many times wider than the other.
SKEW_RATIO = 1.5


def _level(quantiles: np.ndarray, levels: list[float], q: float) -> np.ndarray:
    idx = int(np.argmin(np.abs(np.asarray(levels) - q)))
    return quantiles[idx].astype(np.float64)


def relative_width(quantiles: np.ndarray, levels: list[float]) -> np.ndarray:
    """(P90 - P10) / |P50| per step; NaN where P50 is 0."""
    p10, p50, p90 = (_level(quantiles, levels, q) for q in (0.1, 0.5, 0.9))
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(np.abs(p50) > 0, (p90 - p10) / np.abs(p50), np.nan)


def uncertainty_score(quantiles: np.ndarray, levels: list[float]) -> float:
    width = relative_width(quantiles, levels)
    finite = width[np.isfinite(width)]
    return float(finite.mean()) if finite.size else 0.0


def uncertainty_label(score: float) -> str:
    if score < PREDICTABLE_BELOW:
        return "predictable"
    if score < VOLATILE_FROM:
        return "moderate"
    return "volatile"


def risk_direction(quantiles: np.ndarray, levels: list[float]) -> str:
    p10, p50, p90 = (_level(quantiles, levels, q) for q in (0.1, 0.5, 0.9))
    up, down = float(np.mean(p90 - p50)), float(np.mean(p50 - p10))
    if up > SKEW_RATIO * down:
        return "upside"
    if down > SKEW_RATIO * up:
        return "downside"
    return "balanced"


def trust_horizon(quantiles: np.ndarray, levels: list[float]) -> int:
    """Number of leading steps whose relative band width stays within the threshold."""
    width = relative_width(quantiles, levels)
    # A step with P50 = 0 has no relative width; treat it as within the threshold only if
    # the band itself is zero (e.g. a constant-zero series).
    p10, p90 = _level(quantiles, levels, 0.1), _level(quantiles, levels, 0.9)
    within = np.where(np.isfinite(width), width <= TRUST_THRESHOLD, (p90 - p10) == 0)
    exceeded = np.flatnonzero(~within)
    return int(exceeded[0]) if exceeded.size else int(width.size)


def risk_metrics(quantiles: np.ndarray, levels: list[float]) -> dict:
    score = uncertainty_score(quantiles, levels)
    return {
        "uncertainty_score": round(score, 4),
        "uncertainty_label": uncertainty_label(score),
        "risk_direction": risk_direction(quantiles, levels),
        "trust_horizon": trust_horizon(quantiles, levels),
    }


def last_year_values(
    history: pd.Series, future: pd.DatetimeIndex, frequency: str
) -> list[float | None] | None:
    """Actuals one seasonal cycle before each forecast date, or None if none exist."""
    earlier = one_cycle_earlier(future, frequency)
    if earlier is None:
        return None
    values = history.reindex(earlier)
    if values.isna().all():
        return None
    return [None if pd.isna(v) else float(v) for v in values]
