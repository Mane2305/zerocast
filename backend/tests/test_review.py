import holidays
import numpy as np
import pandas as pd
import pytest

from app.services import review


def flat_forecaster(level=100.0, spread=0.1, calls=None):
    """P50 = level, P10/P90 = level × (1 ∓ spread); records each context it was given."""

    def forecast(context, horizon, seed):
        if calls is not None:
            calls.append(context.copy())
        quantiles = np.repeat(
            np.linspace(level * (1 - spread), level * (1 + spread), 9)[:, None], horizon, axis=1
        )
        paths = np.full((20, horizon), level)
        return quantiles, paths

    return forecast


def daily_series(days=500, start="2024-06-01", level=100.0) -> pd.Series:
    dates = pd.date_range(start, periods=days, freq="D")
    return pd.Series(level, index=dates, dtype=float)


def diwali(year: int) -> pd.Timestamp:
    for day, name in holidays.country_holidays("IN", years=[year]).items():
        if "Diwali" in name:
            return pd.Timestamp(day)
    raise AssertionError("Diwali not in the IN calendar")


def run(history, frequency="daily", country=None, top_n=5, annotations=None, calls=None):
    lookback, step = review.default_window(frequency)
    periods = review.replay(history, lookback, step, flat_forecaster(calls=calls))
    events = review.calendar_events([p.date for p in periods], frequency, country)
    return review.summarize("A", periods, events, annotations or {}, top_n, frequency)


def test_injected_spike_is_top_positive_surprise_with_holiday():
    history = daily_series()
    spike = diwali(2025)
    history[spike] = 300.0
    history[spike + pd.Timedelta(days=40)] = 150.0

    result = run(history, country="IN")

    top = result["positive_surprises"][0]
    assert top["date"] == spike.isoformat()
    assert top["actual"] == 300.0 and top["deviation_pct"] == 200.0
    assert any("Diwali" in name for name in top["calendar_events"])
    assert top["recurring_as_expected"] is False
    assert result["positive_surprises"][1]["deviation_pct"] == 50.0


def test_injected_dip_is_top_miss():
    history = daily_series()
    dip = history.index[-30]
    history[dip] = 20.0

    result = run(history)

    assert result["misses"][0]["date"] == dip.isoformat()
    assert result["misses"][0]["deviation_pct"] == -80.0
    assert result["positive_surprises"] == []


def test_festival_inside_band_reported_as_expected():
    history = daily_series()
    day = diwali(2025)
    history[day] = 105.0  # above P50 but within P10–P90 (90–110)

    result = run(history, country="IN")

    festival = next(e for e in result["positive_surprises"] if e["date"] == day.isoformat())
    assert festival["recurring_as_expected"] is True
    assert festival["calendar_events"]


def test_inside_band_without_event_is_not_listed():
    history = daily_series()
    history[history.index[-10]] = 105.0

    assert run(history)["positive_surprises"] == []


def test_top_n_limits_each_list():
    history = daily_series()
    for k in range(1, 9):
        history[history.index[-k * 10]] = 100.0 + 20 * k

    result = run(history, top_n=3)

    assert [e["deviation_pct"] for e in result["positive_surprises"]] == [160.0, 140.0, 120.0]


def test_no_future_leakage():
    history = daily_series()
    spike = history.index[-20]
    history[spike] = 999.0
    calls = []

    run(history, calls=calls)

    spike_pos = history.index.get_loc(spike)
    for context in calls:
        if len(context) <= spike_pos:
            assert 999.0 not in context


def test_totals_and_coverage():
    history = daily_series()
    history[history.index[-5]] = 300.0

    result = run(history)

    assert result["actual_total"] == pytest.approx(364 * 100 + 200)
    assert result["expected_total"] == pytest.approx(364 * 100)
    assert result["band_coverage"] == pytest.approx(363 / 364, abs=1e-4)


def test_origins_tile_the_lookback():
    assert review.origins(100, 21, 7) == [(79, 7), (86, 7), (93, 7)]
    assert review.origins(100, 10, 7) == [(90, 7), (97, 3)]
    assert len(review.origins(10_000, 10_000, 1)) == review.MAX_ORIGINS


def test_short_contexts_are_skipped():
    history = daily_series(days=40)  # only the last 10 origins have ≥ 30 points of context

    periods = review.replay(history, 364, 7, flat_forecaster())

    assert periods and min(p.date for p in periods) >= history.index[30]


def test_missing_actuals_are_skipped():
    history = daily_series()
    history[history.index[-3]] = np.nan

    periods = review.replay(history, 364, 7, flat_forecaster())

    assert len(periods) == 363


def test_annotations_attached():
    history = daily_series()
    day = history.index[-50]
    history[day] = 250.0

    result = run(history, annotations={day.isoformat(): "Bulk order"})

    assert result["positive_surprises"][0]["annotation"] == "Bulk order"


def test_monthly_events_cover_the_whole_month():
    dates = [pd.Timestamp("2025-01-01"), pd.Timestamp("2025-02-01")]

    events = review.calendar_events(dates, "monthly", "IN")

    assert "Republic Day" in events[pd.Timestamp("2025-01-01")]


def test_unknown_country_has_no_events():
    assert review.calendar_events([pd.Timestamp("2025-01-01")], "daily", "ZZ") == {}
    assert review.calendar_events([pd.Timestamp("2025-01-01")], "daily", None) == {}


def test_monthly_defaults():
    dates = pd.date_range("2018-01-01", periods=60, freq="MS")
    history = pd.Series(100.0, index=dates)
    history[dates[-2]] = 140.0

    result = run(history, frequency="monthly")

    assert result["positive_surprises"][0]["date"] == dates[-2].isoformat()
    assert result["band_coverage"] == pytest.approx(11 / 12, abs=1e-4)


def test_monthly_lists_only_band_breaches_but_tags_events():
    dates = pd.date_range("2018-01-01", periods=60, freq="MS")
    history = pd.Series(100.0, index=dates)
    history[dates[-1]] = 105.0  # in band, month with holidays
    history[dates[-12]] = 150.0  # breach

    result = run(history, frequency="monthly", country="IN")

    assert [e["date"] for e in result["positive_surprises"]] == [dates[-12].isoformat()]
    assert result["positive_surprises"][0]["calendar_events"]  # January: Republic Day


def test_non_additive_totals_are_period_means():
    history = daily_series()
    history[history.index[-5]] = 300.0
    lookback, step = review.default_window("daily")
    periods = review.replay(history, lookback, step, flat_forecaster())

    result = review.summarize("A", periods, {}, {}, 5, "daily", additive=False)

    assert result["aggregation"] == "mean"
    assert result["actual_total"] == pytest.approx((364 * 100 + 200) / 364)
    assert result["expected_total"] == pytest.approx(100)
    assert run(history)["aggregation"] == "sum"
