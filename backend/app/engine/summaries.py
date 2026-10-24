"""Distributions computed from sample paths (never from summed quantiles)."""

import numpy as np

TOTAL_PERCENTILES = np.arange(101)
STEP_PERCENTILES = np.arange(1, 100)


def total_distribution(paths: np.ndarray, aggregation: str = "sum") -> list[float]:
    """Percentiles 0..100 of the horizon total (or mean, for non-additive data).

    ``paths`` is (num_samples, horizon).
    """
    values = paths.astype(np.float64)
    if aggregation == "sum":
        per_path = values.sum(axis=1)
    elif aggregation == "mean":
        per_path = values.mean(axis=1)
    else:
        raise ValueError(f"unknown aggregation {aggregation!r}")
    return np.percentile(per_path, TOTAL_PERCENTILES).tolist()


def step_exceedance_grid(paths: np.ndarray) -> list[list[float]]:
    """Per-step percentiles 1..99, shape [99][horizon], for capacity-risk lookups."""
    return np.percentile(paths.astype(np.float64), STEP_PERCENTILES, axis=0).tolist()
