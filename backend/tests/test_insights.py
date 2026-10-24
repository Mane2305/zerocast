import numpy as np
import pandas as pd
import pytest

from app.services import insights
from app.services.health_check import future_dates, one_cycle_earlier

LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


def band(p50, below, above, horizon=10) -> np.ndarray:
    """Quantiles spaced linearly from P50 - below (P10) to P50 + above (P90)."""
    p50 = np.broadcast_to(np.asarray(p50, dtype=float), (horizon,))
    below = np.broadcast_to(np.asarray(below, dtype=float), (horizon,))
    above = np.broadcast_to(np.asarray(above, dtype=float), (horizon,))
    rows = []
    for q in LEVELS:
        if q < 0.5:
            rows.append(p50 - below * (0.5 - q) / 0.4)
        else:
            rows.append(p50 + above * (q - 0.5) / 0.4)
    return np.array(rows)


def test_uncertainty_score_and_labels():
    narrow = band(100, 5, 5)  # (P90 - P10) / P50 = 0.1
    wide = band(100, 40, 40)  # 0.8

    assert insights.uncertainty_score(narrow, LEVELS) == pytest.approx(0.1)
    assert insights.risk_metrics(narrow, LEVELS)["uncertainty_label"] == "predictable"
    assert insights.risk_metrics(band(100, 20, 20), LEVELS)["uncertainty_label"] == "moderate"
    assert insights.risk_metrics(wide, LEVELS)["uncertainty_label"] == "volatile"


def test_uncertainty_score_ignores_zero_median_steps():
    q = band([0, 100, 100], 5, 5, horizon=3)
    assert insights.uncertainty_score(q, LEVELS) == pytest.approx(0.1)


@pytest.mark.parametrize(
    ("below", "above", "direction"),
    [(5, 20, "upside"), (20, 5, "downside"), (10, 12, "balanced")],
)
def test_risk_direction(below, above, direction):
    assert insights.risk_direction(band(100, below, above), LEVELS) == direction


def test_trust_horizon_is_steps_before_threshold():
    widening = np.linspace(2, 80, 10)  # relative width 0.04 … 1.6
    q = band(100, widening / 2, widening / 2)

    first_bad = int(np.argmax(widening / 100 > insights.TRUST_THRESHOLD))
    assert insights.trust_horizon(q, LEVELS) == first_bad


def test_trust_horizon_full_and_zero():
    assert insights.trust_horizon(band(100, 1, 1), LEVELS) == 10
    assert insights.trust_horizon(band(100, 60, 60), LEVELS) == 0
    assert insights.trust_horizon(band(0, 0, 0), LEVELS) == 10  # constant zero series


def test_last_year_daily_aligns_weekdays():
    dates = pd.date_range("2023-01-01", "2024-12-31", freq="D")
    history = pd.Series(np.arange(len(dates), dtype=float), index=dates)
    future = future_dates(dates[-1], "daily", 7)

    values = insights.last_year_values(history, future, "daily")

    expected_dates = future - pd.Timedelta(weeks=52)
    assert all(a.weekday() == b.weekday() for a, b in zip(future, expected_dates, strict=True))
    assert values == history.reindex(expected_dates).tolist()


def test_last_year_monthly_month_end():
    dates = pd.date_range("2022-01-31", periods=30, freq="ME")
    history = pd.Series(np.arange(30, dtype=float), index=dates)
    future = future_dates(dates[-1], "monthly", 3)

    assert list(future.strftime("%Y-%m-%d")) == ["2024-07-31", "2024-08-31", "2024-09-30"]
    assert insights.last_year_values(history, future, "monthly") == [18.0, 19.0, 20.0]


def test_last_year_none_when_history_too_short():
    dates = pd.date_range("2024-01-01", periods=60, freq="D")
    history = pd.Series(1.0, index=dates)
    future = future_dates(dates[-1], "daily", 10)

    assert insights.last_year_values(history, future, "daily") is None


def test_last_year_partial_gives_nulls():
    dates = pd.date_range("2023-06-12", "2024-06-05", freq="D")
    history = pd.Series(1.0, index=dates)
    future = future_dates(dates[-1], "daily", 10)  # one year back starts 2023-06-08

    values = insights.last_year_values(history, future, "daily")
    assert values[:4] == [None] * 4 and values[4:] == [1.0] * 6


@pytest.mark.parametrize(
    ("last", "frequency", "expected"),
    [
        ("2024-01-01 22:00", "hourly", ["2024-01-01T23:00:00", "2024-01-02T00:00:00"]),
        ("2024-01-31", "daily", ["2024-02-01T00:00:00", "2024-02-02T00:00:00"]),
        ("2024-01-01", "weekly", ["2024-01-08T00:00:00", "2024-01-15T00:00:00"]),
        ("2024-01-01", "monthly", ["2024-02-01T00:00:00", "2024-03-01T00:00:00"]),
        ("2024-01-01", "quarterly", ["2024-04-01T00:00:00", "2024-07-01T00:00:00"]),
        ("2024-12-31", "yearly", ["2025-12-31T00:00:00", "2026-12-31T00:00:00"]),
    ],
)
def test_future_dates(last, frequency, expected):
    assert [d.isoformat() for d in future_dates(pd.Timestamp(last), frequency, 2)] == expected


def test_one_cycle_earlier_unknown_is_none():
    assert one_cycle_earlier(pd.DatetimeIndex(["2024-01-01"]), "unknown") is None
