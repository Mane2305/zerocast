"""Portfolio risk metrics and last-year alignment. Pure functions, no I/O.

Quantile arrays are ``(n_quantiles, horizon)`` aligned with ``levels`` (0.1 … 0.9).
Thresholds below are product choices, documented in backend/README.md.
"""

import numpy as np
import pandas as pd

from app.services.health_check import one_cycle_earlier

# Uncertainty score = sum (P90 - P10) / sum |P50| over the horizon (PRODUCT.md §4), so a few
# near-zero steps (closed days) cannot dominate it. A score of 0.3 is a band of about ±15%.
PREDICTABLE_BELOW = 0.3
VOLATILE_FROM = 0.6
# Trust horizon: leading steps h with sum_1..h (P90 - P10) / sum_1..h |P50| within this
# (about ±25%): the same ratio of sums as the score, accumulated step by step.
TRUST_THRESHOLD = 0.5
# Upside/downside when one side of the band is this many times wider than the other.
SKEW_RATIO = 1.5


def _level(quantiles: np.ndarray, levels: list[float], q: float) -> np.ndarray:
    idx = int(np.argmin(np.abs(np.asarray(levels) - q)))
    return quantiles[idx].astype(np.float64)


def uncertainty_score(quantiles: np.ndarray, levels: list[float]) -> float:
    p10, p50, p90 = (_level(quantiles, levels, q) for q in (0.1, 0.5, 0.9))
    scale = float(np.abs(p50).sum())
    return float((p90 - p10).sum()) / scale if scale > 0 else 0.0


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
    """Number of leading steps whose cumulative relative band width stays within the threshold."""
    p10, p50, p90 = (_level(quantiles, levels, q) for q in (0.1, 0.5, 0.9))
    width, scale = np.cumsum(p90 - p10), np.cumsum(np.abs(p50))
    # While the cumulative P50 is still 0 there is no relative width; such a prefix counts as
    # within the threshold only if the band is zero too (e.g. a constant-zero series).
    with np.errstate(divide="ignore", invalid="ignore"):
        within = np.where(scale > 0, width / scale <= TRUST_THRESHOLD, width == 0)
    exceeded = np.flatnonzero(~within)
    return int(exceeded[0]) if exceeded.size else int(within.size)


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
