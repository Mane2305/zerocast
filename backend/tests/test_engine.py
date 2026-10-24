import threading
from pathlib import Path

import numpy as np
import pytest

from app.engine import EngineNotReady, YugEngine
from app.engine.summaries import step_exceedance_grid, total_distribution
from app.engine.yug_engine import YUG_FREQ, sanitize_context, yug_commit

from .conftest import TINY_SAMPLES


def seasonal(n: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    return (50 + 10 * np.sin(2 * np.pi * t / 7) + rng.normal(0, 2, n)).astype(np.float32)


def reference(engine: YugEngine, context, horizon, freq, seed=0) -> np.ndarray:
    """What pipeline.predict returns for the same inputs (run on the worker thread)."""

    def run(pipeline):
        return pipeline.predict(
            context, horizon, freq=freq, num_samples=TINY_SAMPLES, seed=seed
        ).values[0]

    return engine.submit(run).result()


@pytest.mark.parametrize(
    ("name", "context", "horizon"),
    [
        ("one block", seasonal(200), 28),
        ("exact block", seasonal(200), 64),
        ("multi block", seasonal(300), 150),
        ("with gaps", np.where(np.arange(200) % 13 == 0, np.nan, seasonal(200)), 70),
        ("shorter than a patch", seasonal(9), 10),
        ("longer than max context", seasonal(2100), 20),
    ],
)
def test_quantiles_match_pipeline_predict(tiny_engine, name, context, horizon):
    ours = tiny_engine.forecast(context, horizon, "daily", seed=7)

    expected = reference(tiny_engine, context, horizon, "D", seed=7)
    np.testing.assert_array_equal(ours.quantiles, expected, err_msg=name)
    assert ours.paths.shape == (TINY_SAMPLES, horizon)


def test_tiny_scale_series_matches_within_float_precision(tiny_engine):
    # Std under the RevIn floor triggers Yug's unit-scale rescue; the inverse is applied to
    # paths instead of the band, so equality holds only to float32 rounding.
    context = (1000.0 + 1e-5 * seasonal(200)).astype(np.float32)

    ours = tiny_engine.forecast(context, 30, "daily", seed=3)

    expected = reference(tiny_engine, context, 30, "D", seed=3)
    np.testing.assert_allclose(ours.quantiles, expected, rtol=1e-6)


def test_constant_series_is_flat(tiny_engine):
    out = tiny_engine.forecast(np.full(100, 4.0), 20, "daily")

    assert np.all(out.paths == 4.0)
    np.testing.assert_array_equal(out.quantiles, reference(tiny_engine, np.full(100, 4.0), 20, "D"))


def test_same_seed_is_reproducible_and_seeds_differ(tiny_engine):
    context = seasonal(200)
    a = tiny_engine.forecast(context, 80, "daily", seed=1)
    b = tiny_engine.forecast(context, 80, "daily", seed=1)
    c = tiny_engine.forecast(context, 80, "daily", seed=2)

    np.testing.assert_array_equal(a.paths, b.paths)
    assert not np.array_equal(a.paths, c.paths)


def test_quantiles_are_quantiles_of_paths(tiny_engine):
    out = tiny_engine.forecast(seasonal(200), 100, "daily")

    np.testing.assert_allclose(
        out.quantiles, np.quantile(out.paths, np.linspace(0.1, 0.9, 9), axis=0), rtol=1e-5
    )


def test_inf_is_treated_as_missing(tiny_engine):
    context = seasonal(200)
    with_inf = context.copy()
    with_inf[50] = np.inf
    with_nan = context.copy()
    with_nan[50] = np.nan

    a = tiny_engine.forecast(with_inf, 30, "daily")
    b = tiny_engine.forecast(with_nan, 30, "daily")

    np.testing.assert_array_equal(a.quantiles, b.quantiles)


def test_sanitize_context_rules():
    import pandas as pd

    assert sanitize_context(np.ones((1, 5))).shape == (5,)
    assert sanitize_context(pd.Series([1.0, 2.0])).dtype == np.float32
    assert np.isnan(sanitize_context([1.0, np.inf, -np.inf])[1:]).all()
    with pytest.raises(ValueError):
        sanitize_context(np.ones((2, 5)))
    with pytest.raises(ValueError):
        sanitize_context([])


def test_frequency_mapping_avoids_misbucketed_aliases():
    assert "Y" not in YUG_FREQ.values() and "ms" not in YUG_FREQ.values()
    assert YUG_FREQ["yearly"] == "A"


def test_all_calls_run_on_one_worker_thread(tiny_engine):
    threads: set[str] = set()

    def record(_pipeline):
        threads.add(threading.current_thread().name)

    callers = [
        threading.Thread(target=lambda: tiny_engine.submit(record).result()) for _ in range(8)
    ]
    for t in callers:
        t.start()
    for t in callers:
        t.join()

    assert len(threads) == 1 and next(iter(threads)).startswith("yug-worker")


def test_latency_is_recorded(tiny_engine):
    before = tiny_engine.latency_stats()["count"]
    tiny_engine.forecast(seasonal(100), 10, "daily")

    stats = tiny_engine.latency_stats()
    assert stats["count"] == before + 1 and stats["p95"] >= stats["p50"] > 0


def test_engine_not_ready_after_failed_load():
    def broken():
        raise OSError("no weights")

    engine = YugEngine(broken, num_samples=5, model_name="broken")
    with pytest.raises(OSError):
        engine.wait_until_loaded()
    assert not engine.loaded and isinstance(engine.load_error, OSError)
    with pytest.raises(EngineNotReady):
        engine.forecast(seasonal(50), 5, "daily")
    engine.shutdown()


def test_total_distribution_uses_paths_not_summed_quantiles():
    rng = np.random.default_rng(0)
    paths = rng.normal(10, 3, size=(2000, 30))  # independent steps

    pct = np.array(total_distribution(paths))
    p10_sum_of_quantiles = np.quantile(paths, 0.1, axis=0).sum()

    assert pct.shape == (101,) and np.all(np.diff(pct) >= 0)
    assert pct[50] == pytest.approx(300, rel=0.01)
    # Summing per-step P10s understates the P10 of the total (variance doesn't add linearly).
    assert pct[10] > p10_sum_of_quantiles + 20


def test_step_exceedance_grid_shape():
    grid = np.array(step_exceedance_grid(np.random.default_rng(0).normal(size=(100, 12))))
    assert grid.shape == (99, 12)
    assert np.all(np.diff(grid, axis=0) >= 0)


def test_total_distribution_mean_aggregation():
    paths = np.random.default_rng(1).normal(10, 3, size=(500, 12))
    mean = np.array(total_distribution(paths, "mean"))
    total = np.array(total_distribution(paths, "sum"))
    np.testing.assert_allclose(mean, total / 12)
    with pytest.raises(ValueError, match="aggregation"):
        total_distribution(paths, "median")


def test_yug_commit_is_the_pinned_git_commit():
    commit = yug_commit()
    pyproject = (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text("utf-8")
    assert commit and len(commit) == 40 and commit in pyproject
