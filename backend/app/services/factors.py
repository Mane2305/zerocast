"""Factor check: two lenses per factor, never presented as one another (PRODUCT.md §6).

Lens 1 — "Related to your sales?": OLS of the de-trended, de-seasonalised target on the
de-trended, de-seasonalised factor at lags 0..max_lag, with HAC (Newey-West) errors because
residuals are autocorrelated. The best lag's p-value is Bonferroni-adjusted across lags.
Language is "related to", never "causes".

Lens 2 — "Helps Yug forecast?": rolling-origin backtest of sales-only vs sales + factor
(horizon ≤ 64, same seed per origin, so the comparison is paired), scored by weighted quantile
loss. A paired bootstrap over origins gives a CI for the % change; the factor "helps" only if
the whole CI is below zero.
"""

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import pandas as pd
import statsmodels.api as sm

from app.services.health_check import MIN_POINTS

ALPHA = 0.05
N_ORIGINS = 8
MIN_ORIGINS = 3
BOOTSTRAP = 1000
QUANTILE_LEVELS = np.linspace(0.1, 0.9, 9)
SEASON = {"hourly": 24, "daily": 7, "weekly": 52, "monthly": 12, "quarterly": 4}

# context (T,), horizon, seed → quantiles (9, horizon)
Univariate = Callable[[np.ndarray, int, int], np.ndarray]
# context (T,), factor (T,), horizon, seed → quantiles (9, horizon)
WithFactor = Callable[[np.ndarray, np.ndarray, int, int], np.ndarray]

EXPLANATIONS = {
    "use_it": "Related to your sales, and Yug forecasts better with it. Worth including.",
    "real_driver_yug_cannot_use": (
        "Related to your sales, but Yug doesn't use it well yet. Track it separately."
    ),
    "helps_yug_unclear_link": (
        "Yug forecasts better with it, but there is no clear statistical link. Use with care."
    ),
    "probably_drop": "No clear link to your sales and no forecasting gain. Probably drop it.",
}


# ------------------------------------------------------------------ lens 1
def deseasonalize(values: np.ndarray, frequency: str) -> np.ndarray:
    """Residuals after regressing on a linear trend and seasonal dummies (NaN kept as NaN)."""
    n = len(values)
    t = np.arange(n, dtype=float)
    columns = [np.ones(n), (t - t.mean()) / max(t.std(), 1.0)]
    period = SEASON.get(frequency)
    if period and n >= 2 * period:
        phase = np.arange(n) % period
        columns += [(phase == k).astype(float) for k in range(1, period)]
    design = np.column_stack(columns)
    observed = np.isfinite(values)
    residuals = np.full(n, np.nan)
    if observed.sum() > design.shape[1]:
        fit = sm.OLS(values[observed], design[observed]).fit()
        residuals[observed] = values[observed] - fit.predict(design[observed])
    return residuals


def _standardize(x: np.ndarray) -> np.ndarray:
    std = np.nanstd(x)
    return (x - np.nanmean(x)) / std if std > 0 else np.zeros_like(x)


def relatedness(target: np.ndarray, factor: np.ndarray, frequency: str, max_lag: int) -> dict:
    y = _standardize(deseasonalize(target, frequency))
    x = _standardize(deseasonalize(factor, frequency))
    best: dict | None = None
    for lag in range(max_lag + 1):
        ys, xs = (y[lag:], x[: len(x) - lag]) if lag else (y, x)
        ok = np.isfinite(ys) & np.isfinite(xs)
        if ok.sum() < MIN_POINTS or np.nanstd(xs[ok]) == 0:
            continue
        n = int(ok.sum())
        maxlags = max(1, int(4 * (n / 100) ** (2 / 9)))
        fit = sm.OLS(ys[ok], sm.add_constant(xs[ok])).fit(
            cov_type="HAC", cov_kwds={"maxlags": maxlags}
        )
        candidate = {"best_lag": lag, "effect": float(fit.params[1]), "p": float(fit.pvalues[1])}
        if best is None or candidate["p"] < best["p"]:
            best = candidate
    if best is None:
        return {"is_related": False, "best_lag": 0, "effect": 0.0, "p_value": 1.0}
    p_value = min(1.0, best["p"] * (max_lag + 1))
    return {
        "is_related": p_value < ALPHA,
        "best_lag": best["best_lag"],
        "effect": round(best["effect"], 4),
        "p_value": round(p_value, 6),
    }


# ------------------------------------------------------------------ lens 2
def pinball_terms(actual: np.ndarray, quantiles: np.ndarray) -> tuple[float, float]:
    """(sum of 2·pinball over quantiles and observed steps / n_quantiles, sum |actual|)."""
    ok = np.isfinite(actual)
    y, q = actual[ok], quantiles[:, ok]
    diff = y[None, :] - q
    loss = np.maximum(QUANTILE_LEVELS[:, None] * diff, (QUANTILE_LEVELS[:, None] - 1) * diff)
    return float(2 * loss.sum() / len(QUANTILE_LEVELS)), float(np.abs(y).sum())


def backtest_origins(n: int, horizon: int, n_origins: int = N_ORIGINS) -> list[int]:
    """Non-overlapping origins ending at the last point, oldest first, with enough context."""
    starts = [n - horizon * k for k in range(1, n_origins + 1)]
    return sorted(o for o in starts if o >= MIN_POINTS)


@dataclass
class OriginScore:
    base_num: float
    with_num: float
    den: float


def _wql(num: np.ndarray, den: np.ndarray) -> float:
    total = den.sum()
    return float(num.sum() / total) if total > 0 else float("nan")


def helps_yug(scores: list[OriginScore], seed: int = 0) -> dict:
    base = np.array([s.base_num for s in scores])
    with_f = np.array([s.with_num for s in scores])
    den = np.array([s.den for s in scores])
    base_wql, with_wql = _wql(base, den), _wql(with_f, den)
    if len(scores) < MIN_ORIGINS or not np.isfinite(base_wql) or base_wql == 0:
        # Too few origins to say anything: never claim the factor helps.
        out: dict = {"helps": False}
        if np.isfinite(with_wql):
            out["wql_with_factor"] = round(with_wql, 6)
        return out
    change = (with_wql / base_wql - 1) * 100
    # Paired bootstrap: resample origins, keep each origin's two scores together. The shared
    # denominator cancels in the ratio of WQLs.
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(scores), size=(BOOTSTRAP, len(scores)))
    b_base = base[idx].sum(axis=1)
    valid = b_base > 0
    boot = (with_f[idx].sum(axis=1)[valid] / b_base[valid] - 1) * 100
    ci_low, ci_high = np.percentile(boot, [2.5, 97.5])
    return {
        "helps": bool(ci_high < 0),
        "wql_with_factor": round(with_wql, 6),
        "change_pct": round(float(change), 2),
        "ci_low": round(float(ci_low), 2),
        "ci_high": round(float(ci_high), 2),
    }


def verdict(is_related: bool, helps: bool) -> str:
    if is_related and helps:
        return "use_it"
    if is_related:
        return "real_driver_yug_cannot_use"
    if helps:
        return "helps_yug_unclear_link"
    return "probably_drop"


def factor_check(
    target: np.ndarray,
    factors: dict[str, np.ndarray],
    frequency: str,
    horizon: int,
    max_lag: int,
    univariate: Univariate,
    with_factor: WithFactor,
    progress: Callable[[float, str], None] | None = None,
) -> dict:
    origins = backtest_origins(len(target), horizon)
    baseline: list[tuple[float, float]] = []
    for i, origin in enumerate(origins):
        q = univariate(target[:origin], horizon, i)
        baseline.append(pinball_terms(target[origin : origin + horizon], q))
    base_num = np.array([b[0] for b in baseline])
    den = np.array([b[1] for b in baseline])

    results = []
    for j, (name, values) in enumerate(factors.items()):
        if progress:
            progress(100.0 * j / len(factors), f"Checking factor {j + 1} of {len(factors)}")
        related = relatedness(target, values, frequency, max_lag)
        scores = []
        for i, origin in enumerate(origins):
            q = with_factor(target[:origin], values[:origin], horizon, i)
            num, _ = pinball_terms(target[origin : origin + horizon], q)
            scores.append(OriginScore(base_num[i], num, den[i]))
        helps = helps_yug(scores)
        label = verdict(related["is_related"], helps["helps"])
        results.append(
            {
                "factor": name,
                "related": related,
                "helps_yug": helps,
                "verdict": label,
                "explanation": EXPLANATIONS[label],
            }
        )
    out: dict = {"factors": results}
    baseline_wql = _wql(base_num, den) if origins else float("nan")
    if np.isfinite(baseline_wql):
        out["baseline_wql"] = round(baseline_wql, 6)
    return out


def series_frame(frame: pd.DataFrame, series_id: str) -> pd.DataFrame:
    return frame[frame["series_id"] == series_id].sort_values("date").reset_index(drop=True)
