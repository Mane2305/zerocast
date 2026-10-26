import numpy as np
import pandas as pd
import pytest

from app.services.health_check import (
    MAX_FACTORS,
    MIN_POINTS,
    DatasetError,
    detect_frequency,
    run_health_check,
    validate_template,
)


def make_frame(series: dict[str, list], start="2024-01-01", freq="D", **factors) -> pd.DataFrame:
    rows = []
    for sid, values in series.items():
        dates = pd.date_range(start, periods=len(values), freq=freq)
        rows.append(pd.DataFrame({"date": dates, "series_id": sid, "target": values}))
    df = pd.concat(rows, ignore_index=True)
    for name, values in factors.items():
        df[name] = values
    return df


def good(n=40, offset=0.0) -> list[float]:
    return [10.0 + offset + (i % 7) for i in range(n)]


def check(result, check_id):
    return next(c for c in result.report["checks"] if c["id"] == check_id)


def series(result, sid):
    return next(s for s in result.series if s["series_id"] == sid)


def test_clean_dataset_is_ready_with_all_checks_zero():
    result = run_health_check(make_frame({"A": good(), "B": good(offset=5)}))

    assert result.frequency == "daily"
    assert result.report["ready"] is True
    assert [c["id"] for c in result.report["checks"]] == [
        "missing_dates",
        "duplicates",
        "negative_values",
        "non_finite",
        "too_short",
        "constant_series",
        "irregular_spacing",
        "too_many_factors",
        "zero_values",
        "closed_periods_zero",
    ]
    assert all(c["count"] == 0 and c["severity"] == "info" for c in result.report["checks"])
    assert {s["status"] for s in result.series} == {"ready"}


def test_missing_dates_filled_as_blanks():
    df = make_frame({"A": good(), "B": good()})
    df = df.drop(index=[5, 6, 7]).reset_index(drop=True)  # three days gone from A

    result = run_health_check(df)

    missing = check(result, "missing_dates")
    assert missing["count"] == 3
    assert missing["percent"] == pytest.approx(100 * 3 / 80, abs=0.01)
    assert missing["action_taken"] == "Filled as blanks"
    assert missing["affected_series"] == ["A"]
    a = series(result, "A")
    assert a["length"] == 40 and a["missing_count"] == 3 and a["status"] == "warning"
    assert result.frame[result.frame.series_id == "A"]["target"].isna().sum() == 3


def test_duplicates_keep_last_row():
    df = make_frame({"A": good()})
    dup = df.iloc[[3]].assign(target=999.0)
    df = pd.concat([df, dup], ignore_index=True)

    result = run_health_check(df)

    assert check(result, "duplicates")["count"] == 1
    assert check(result, "duplicates")["affected_series"] == ["A"]
    row = result.frame[result.frame.date == pd.Timestamp("2024-01-04")]
    assert row["target"].tolist() == [999.0]


def test_negative_values_kept():
    values = good()
    values[2] = -5.0
    result = run_health_check(make_frame({"A": values}))

    negative = check(result, "negative_values")
    assert negative["count"] == 1 and negative["severity"] == "info"
    assert result.frame["target"].min() == -5.0


def test_non_finite_replaced_with_blanks():
    values = good()
    values[0], values[1] = np.inf, -np.inf
    result = run_health_check(make_frame({"A": values}))

    assert check(result, "non_finite")["count"] == 2
    assert result.frame["target"].isna().sum() == 2
    assert not np.isinf(result.frame["target"]).any()


def test_too_short_series_excluded():
    result = run_health_check(make_frame({"A": good(), "S": good(MIN_POINTS - 1)}))

    assert check(result, "too_short")["affected_series"] == ["S"]
    assert series(result, "S")["status"] == "excluded"
    assert result.report["ready"] is True


def test_blanks_do_not_count_towards_minimum_length():
    values = good(MIN_POINTS + 2)
    values[:5] = [None] * 5
    result = run_health_check(make_frame({"A": values}))

    assert check(result, "too_short")["count"] == 1
    assert result.report["ready"] is False


def test_constant_series_flagged():
    result = run_health_check(make_frame({"A": [3.0] * 40, "B": good()}))

    assert check(result, "constant_series")["affected_series"] == ["A"]
    assert series(result, "A")["status"] == "warning"


def test_irregular_spacing_excluded():
    regular = make_frame({"A": good()})
    odd = pd.DataFrame(
        {
            "date": pd.date_range("2024-01-01", periods=40, freq="D")
            + pd.to_timedelta([0] * 20 + [12] * 20, unit="h"),
            "series_id": "B",
            "target": good(),
        }
    )
    result = run_health_check(pd.concat([regular, odd], ignore_index=True))

    irregular = check(result, "irregular_spacing")
    assert irregular["affected_series"] == ["B"] and irregular["severity"] == "error"
    assert series(result, "B")["status"] == "excluded"


def test_too_many_factors_ignored():
    df = make_frame({"A": good()})
    for i in range(MAX_FACTORS + 2):
        df[f"f{i}"] = 1.0

    result = run_health_check(df)

    assert check(result, "too_many_factors")["count"] == 2
    assert result.factor_columns == [f"f{i}" for i in range(MAX_FACTORS)]


@pytest.mark.parametrize(
    ("freq", "expected"),
    [
        ("h", "hourly"),
        ("D", "daily"),
        ("W-MON", "weekly"),
        ("MS", "monthly"),
        ("ME", "monthly"),
        ("QS", "quarterly"),
        ("YS", "yearly"),
    ],
)
def test_detect_frequency(freq, expected):
    df = make_frame({"A": good(), "B": good()}, freq=freq)
    assert detect_frequency(df) == expected


def test_monthly_month_end_data_has_no_missing_dates():
    result = run_health_check(make_frame({"A": good()}, start="2020-01-31", freq="ME"))

    assert result.frequency == "monthly"
    assert check(result, "missing_dates")["count"] == 0


def test_unknown_frequency_makes_everything_irregular():
    df = make_frame({"A": good()}, freq="5D")
    result = run_health_check(df)

    assert result.frequency == "unknown"
    assert result.report["ready"] is False


def test_column_names_are_case_and_space_insensitive():
    df = make_frame({"A": good()}).rename(columns={"date": " Date", "target": "TARGET"})
    clean, _, _ = validate_template(df)
    assert list(clean.columns) == ["date", "series_id", "target"]


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda df: df.drop(columns=["target"]), "invalid_columns"),
        (lambda df: df.assign(date="not a date"), "invalid_dates"),
        (lambda df: df.assign(target="1,234"), "invalid_columns"),
        (lambda df: df.assign(price="₹10"), "invalid_columns"),
        (lambda df: df.assign(series_id=None), "invalid_columns"),
        (lambda df: df.iloc[0:0], "empty_file"),
    ],
)
def test_unusable_files_raise(mutate, code):
    with pytest.raises(DatasetError) as info:
        validate_template(mutate(make_frame({"A": good()})))
    assert info.value.code == code


def test_zero_values_are_reported_as_info_without_downgrading_the_series():
    closed_saturdays = [0.0 if i % 7 == 5 else 10.0 + i for i in range(40)]
    result = run_health_check(make_frame({"A": closed_saturdays, "B": good(offset=5)}))

    zero = check(result, "zero_values")
    assert zero["severity"] == "info" and zero["count"] == 5
    assert zero["affected_series"] == ["A"]
    assert zero["action_taken"].startswith("Kept as 0")
    assert series(result, "A")["status"] == "ready"
    assert "zero_values" in series(result, "A")["issues"]


def test_closed_weekday_zeros_are_reported_as_closed_periods():
    closed_saturdays = [0.0 if i % 7 == 5 else 10.0 + i for i in range(40)]
    one_off_zero = good(offset=5)
    one_off_zero[10] = 0.0
    result = run_health_check(make_frame({"A": closed_saturdays, "B": one_off_zero}))

    closed = check(result, "closed_periods_zero")
    assert closed["severity"] == "info" and closed["count"] == 5
    assert closed["affected_series"] == ["A"]
    assert check(result, "zero_values")["count"] == 6  # B's single zero is not a closure
    assert series(result, "A")["status"] == "ready"
    assert "closed_periods_zero" in series(result, "A")["issues"]


def test_shutdown_across_all_series_is_a_closed_period():
    a, b = good(), good(offset=3)
    for i in (20, 21):
        a[i] = b[i] = 0.0
    b[30] = 0.0  # only one series is 0 that month: not a shutdown

    result = run_health_check(make_frame({"A": a, "B": b}, freq="MS"))

    closed = check(result, "closed_periods_zero")
    assert closed["count"] == 4 and closed["affected_series"] == ["A", "B"]


def test_weekday_rule_needs_enough_weeks():
    few = [0.0 if i % 7 == 5 else 10.0 + i for i in range(21)] + [None] * 19
    result = run_health_check(make_frame({"A": few}))
    assert check(result, "zero_values")["count"] == 3
    assert check(result, "closed_periods_zero")["count"] == 0
