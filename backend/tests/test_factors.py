import numpy as np
import pytest

from app.services import factors
from app.services.factors import OriginScore


@pytest.mark.parametrize(
    ("related", "helps", "expected"),
    [
        (True, True, "use_it"),
        (True, False, "real_driver_yug_cannot_use"),
        (False, True, "helps_yug_unclear_link"),
        (False, False, "probably_drop"),
    ],
)
def test_verdict_mapping(related, helps, expected):
    assert factors.verdict(related, helps) == expected
    assert factors.EXPLANATIONS[expected]


def test_explanations_never_claim_causation():
    for text in factors.EXPLANATIONS.values():
        assert "cause" not in text.lower()


# ------------------------------------------------------------------ lens 1
def noise(n, seed):
    return np.random.default_rng(seed).normal(size=n)


def test_lagged_driver_is_related_at_its_lag():
    driver = noise(300, 1)
    target = 100 + 0.1 * np.arange(300) + 5 * np.roll(driver, 2) + noise(300, 2)

    result = factors.relatedness(target, driver, "daily", max_lag=3)

    assert result["is_related"] is True
    assert result["best_lag"] == 2 and result["effect"] > 0.5


def test_independent_factor_is_not_related():
    result = factors.relatedness(100 + noise(300, 3), noise(300, 4), "daily", max_lag=3)
    assert result["is_related"] is False and result["p_value"] > factors.ALPHA


def test_shared_trend_and_season_alone_is_not_related():
    t = np.arange(240)
    season = 10 * np.sin(2 * np.pi * t / 12)
    target = 100 + 0.5 * t + season + noise(240, 5)
    factor = 50 + 0.3 * t + season + noise(240, 6)

    result = factors.relatedness(target, factor, "monthly", max_lag=2)

    assert result["is_related"] is False


def test_constant_or_short_factor_is_not_related():
    assert factors.relatedness(noise(200, 7), np.ones(200), "daily", 3)["is_related"] is False
    assert factors.relatedness(noise(20, 7), noise(20, 8), "daily", 3)["p_value"] == 1.0


def test_missing_values_are_tolerated():
    driver = noise(300, 9)
    target = 5 * driver + noise(300, 10)
    target[::17] = np.nan
    driver[::23] = np.nan

    assert factors.relatedness(target, driver, "daily", 0)["is_related"] is True


# ------------------------------------------------------------------ lens 2
def test_pinball_is_zero_for_perfect_forecast():
    actual = np.array([1.0, 2.0, 3.0])
    loss, scale = factors.pinball_terms(actual, np.tile(actual, (9, 1)))
    assert loss == 0.0 and scale == 6.0


def test_pinball_ignores_missing_actuals():
    actual = np.array([1.0, np.nan])
    loss, scale = factors.pinball_terms(actual, np.full((9, 2), 2.0))
    assert scale == 1.0 and loss > 0


def test_backtest_origins():
    assert factors.backtest_origins(100, 10, 3) == [70, 80, 90]
    assert factors.backtest_origins(50, 10) == [30, 40]  # needs ≥ 30 points of context


def test_consistent_improvement_helps():
    scores = [OriginScore(base_num=10 + i % 3, with_num=7 + i % 3, den=100) for i in range(8)]

    result = factors.helps_yug(scores)

    assert result["helps"] is True
    assert result["ci_high"] < 0 and result["change_pct"] < 0


def test_mixed_results_do_not_help():
    scores = [OriginScore(10, 6 if i % 2 else 14, 100) for i in range(8)]

    result = factors.helps_yug(scores)

    assert result["helps"] is False and result["ci_low"] < 0 < result["ci_high"]


def test_too_few_origins_never_helps():
    result = factors.helps_yug([OriginScore(10, 1, 100), OriginScore(10, 1, 100)])
    assert result == {"helps": False, "wql_with_factor": 0.01}  # 2 / 200


def test_factor_check_end_to_end_with_fakes():
    n, horizon = 300, 14
    driver = noise(n, 11)
    target = 100 + 10 * np.roll(driver, 1) + noise(n, 12)

    def univariate(context, h, seed):
        return np.tile(np.linspace(80, 120, 9)[:, None], (1, h))

    def with_factor(context, factor, h, seed):
        # Pretend the factor makes Yug sharper: a tight band around the truth.
        start = len(context)
        truth = target[start : start + h]
        return np.vstack([truth + d for d in np.linspace(-1, 1, 9)])

    calls = []
    result = factors.factor_check(
        target,
        {"driver": driver, "junk": noise(n, 13)},
        "daily",
        horizon,
        3,
        univariate,
        with_factor,
        progress=lambda p, m: calls.append(m),
    )

    by_name = {f["factor"]: f for f in result["factors"]}
    assert by_name["driver"]["verdict"] == "use_it"
    assert by_name["junk"]["verdict"] == "helps_yug_unclear_link"
    assert result["baseline_wql"] > by_name["driver"]["helps_yug"]["wql_with_factor"]
    assert calls == ["Checking factor 1 of 2", "Checking factor 2 of 2"]
