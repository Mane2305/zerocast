import numpy as np
import pandas as pd
import pytest

from app.services import accuracy
from app.services.forecast import round_sig

LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


def flat_forecaster(level=100.0, spread=0.1, calls=None):
    def forecast(context, horizon, seed):
        if calls is not None:
            calls.append(len(context))
        quantiles = np.repeat(
            np.linspace(level * (1 - spread), level * (1 + spread), 9)[:, None], horizon, axis=1
        )
        return quantiles, np.full((20, horizon), level)

    return forecast


def daily(values, start="2024-01-01") -> pd.Series:
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="D"), dtype=float)


def test_origins_tile_the_end_of_the_history():
    assert accuracy.origin_indices(100, 10, 3) == [70, 80, 90]
    assert accuracy.origin_indices(25, 10, 5) == [5, 15]


def test_seasonal_naive_repeats_the_last_season():
    context = np.arange(14.0)
    np.testing.assert_array_equal(
        accuracy.seasonal_naive(context, 9, 7), [7, 8, 9, 10, 11, 12, 13, 7, 8]
    )
    assert np.isnan(accuracy.seasonal_naive(np.ones(3), 2, 7)).all()


def test_each_origin_only_sees_the_past():
    calls = []
    bt = accuracy.backtest(daily(np.full(200, 100.0)), 14, 4, "daily", flat_forecaster(calls=calls))

    assert calls == [144, 158, 172, 186]
    assert bt.origins == 4 and len(bt.dates) == 56
    assert bt.dates[-1] == pd.Timestamp("2024-01-01") + pd.Timedelta(days=199)


def test_origins_without_enough_context_are_skipped():
    bt = accuracy.backtest(daily(np.full(50, 100.0)), 10, 5, "daily", flat_forecaster())
    assert bt.origins == 2  # origins at 30 and 40; 0, 10, 20 have < 30 points of context


def test_perfect_forecast_scores():
    bt = accuracy.backtest(daily(np.full(200, 100.0)), 14, 4, "daily", flat_forecaster())

    result = accuracy.series_result("A", bt, LEVELS, round_sig)

    assert result["wape"] == 0 and result["bias_pct"] == 0
    assert result["coverage_p10_p90"] == 1.0
    assert result["naive_wape"] == 0 and result["improvement_vs_naive_pct"] is None
    assert [q["observed"] for q in result["quantile_coverage"]] == [0, 0, 0, 0, 1, 1, 1, 1, 1]
    assert len(result["backtest"]["p50"]) == 56


def test_wape_bias_and_coverage():
    # Actuals alternate 80 / 120 around a flat P50 of 100 with P10-P90 = 90..110.
    values = np.where(np.arange(200) % 2 == 0, 80.0, 120.0)

    bt = accuracy.backtest(daily(values), 10, 3, "daily", flat_forecaster())
    m = accuracy.metrics(accuracy.sums(bt))

    assert m["wape"] == pytest.approx(20.0)
    assert m["bias_pct"] == pytest.approx(0.0)
    assert m["coverage_p10_p90"] == 0.0


def test_over_forecast_has_positive_bias():
    bt = accuracy.backtest(daily(np.full(100, 80.0)), 10, 2, "daily", flat_forecaster())
    assert accuracy.metrics(accuracy.sums(bt))["bias_pct"] == pytest.approx(25.0)


def test_model_beats_naive_on_a_level_shift():
    # A weekly pattern that the naive copies, then a jump to a flat 100 the fake model predicts.
    values = np.concatenate([np.tile([50.0, 150.0, 50, 150, 50, 150, 50], 20), np.full(30, 100.0)])

    bt = accuracy.backtest(daily(values), 10, 3, "daily", flat_forecaster())
    m = accuracy.metrics(accuracy.sums(bt))

    assert m["wape"] == 0 and m["naive_wape"] > 0
    assert m["improvement_vs_naive_pct"] == 100.0


def test_missing_actuals_are_skipped_but_kept_in_the_overlay():
    values = np.full(100, 100.0)
    values[-3] = np.nan

    bt = accuracy.backtest(daily(values), 10, 2, "daily", flat_forecaster())
    result = accuracy.series_result("A", bt, LEVELS, round_sig)

    assert result["backtest"]["actual"][-3] is None
    assert accuracy.sums(bt).count == 19


def test_portfolio_is_weighted_by_volume():
    big = accuracy.backtest(daily(np.full(100, 1000.0)), 10, 2, "daily", flat_forecaster(1000))
    small = accuracy.backtest(daily(np.full(100, 10.0)), 10, 2, "daily", flat_forecaster(20))

    pooled = accuracy.portfolio([big, small])

    assert accuracy.metrics(accuracy.sums(small))["wape"] == pytest.approx(100.0)
    assert pooled["wape"] == pytest.approx(100 * 200 / (20 * 1000 + 20 * 10))
    assert pooled["coverage_p10_p90"] == pytest.approx(1000 / 1010, abs=1e-4)
