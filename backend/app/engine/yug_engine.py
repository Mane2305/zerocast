"""YugEngine: loads the model once and runs every call on a single worker thread.

Why a single worker: YugPipeline keeps mutable rollout state on a shared engine (upstream
issue #9), so it must never be called from two threads at once. Every model call — including
loading — runs on one dedicated thread; callers block on (or await) a Future.

Why we reproduce the rollout: ``pipeline.predict`` returns quantiles only, but horizon totals
need the sample paths (quantiles do not add). ``_sample_paths`` mirrors the univariate branch of
``YugPipeline._predict_one`` at the pinned commit (PR #14, 4b1de57) and calls its private
``_rollout_cached``. tests/test_engine.py asserts our quantiles equal ``pipeline.predict`` for
the same seed, so an upstream change that breaks this fails loudly.
"""

import json
import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, distribution
from typing import Any, TypeVar

import numpy as np
import torch
from yug import YugPipeline
from yug.pipeline import _unit_scale_affine
from yug.utils import normalize_freq, pad_to_patch_multiple

logger = logging.getLogger(__name__)

T = TypeVar("T")

MODEL_LICENSE = "CC-BY-NC-4.0 (weights)"
LATENCY_WINDOW = 500

# Our frequency names → strings Yug buckets correctly. Never "Y" or "ms" (issue #11).
YUG_FREQ = {
    "hourly": "h",
    "daily": "D",
    "weekly": "W",
    "monthly": "M",
    "quarterly": "Q",
    "yearly": "A",
    "unknown": "U",
}


COVARIATE_MAX_HORIZON = 64


class EngineNotReady(RuntimeError):
    """The model is still loading, failed to load, or loading is disabled."""


@dataclass
class ForecastOutput:
    quantiles: np.ndarray  # (n_quantiles, horizon), float32
    paths: np.ndarray  # (num_samples, horizon), float32
    latency_ms: float


def sanitize_context(context: Any) -> np.ndarray:
    """Apply the YUG_NOTES input rules: NumPy only, 1-D, float32, ±inf → NaN."""
    if hasattr(context, "to_numpy"):  # pandas objects are split per row (issue #13)
        context = context.to_numpy()
    array = np.asarray(context, dtype=np.float32)
    if array.ndim == 2 and array.shape[0] == 1:  # (1, T) crashes (issue #13)
        array = array[0]
    if array.ndim != 1:
        raise ValueError(f"univariate context must be 1-D, got shape {array.shape}")
    if array.size == 0:
        raise ValueError("context is empty")
    array = array.copy()
    array[np.isinf(array)] = np.nan  # inf would be read as an observed 0 (issue #7)
    return array


def sanitize_covariate_stack(target: Any, covariates: Any) -> np.ndarray:
    """``(1 + n_covariates, T)`` float32 stack, target in row 0, ±inf → NaN."""
    row0 = sanitize_context(target)
    cov = np.asarray(getattr(covariates, "to_numpy", lambda: covariates)(), dtype=np.float32)
    if cov.ndim == 1:
        cov = cov[None, :]
    if cov.ndim != 2 or cov.shape[1] != row0.shape[0] or cov.shape[0] < 1:
        raise ValueError(
            f"covariates must be (n, {row0.shape[0]}) aligned with the target, got {cov.shape}"
        )
    stack = np.vstack([row0[None, :], cov]).astype(np.float32)
    stack[np.isinf(stack)] = np.nan
    return stack


class YugEngine:
    def __init__(
        self,
        loader: Callable[[], YugPipeline],
        *,
        num_samples: int,
        model_name: str,
        revision: str | None = None,
    ) -> None:
        self.num_samples = num_samples
        self.model_name = model_name
        self.revision = revision
        self._pipeline: YugPipeline | None = None
        self._load_error: BaseException | None = None
        self._latencies: deque[float] = deque(maxlen=LATENCY_WINDOW)
        self._stats_lock = threading.Lock()
        self._worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="yug-worker")
        self._loaded = self._worker.submit(self._load, loader)

    # ------------------------------------------------------------ lifecycle
    def _load(self, loader: Callable[[], YugPipeline]) -> None:
        started = time.perf_counter()
        try:
            self._pipeline = loader()
        except BaseException as exc:
            self._load_error = exc
            logger.exception("Yug model failed to load")
            raise
        logger.info("Yug model loaded in %.1f s", time.perf_counter() - started)

    def wait_until_loaded(self, timeout: float | None = None) -> None:
        self._loaded.result(timeout)

    @property
    def loaded(self) -> bool:
        return self._pipeline is not None

    @property
    def load_error(self) -> BaseException | None:
        return self._load_error

    def shutdown(self) -> None:
        self._worker.shutdown(wait=True, cancel_futures=True)

    def submit(self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> "Future[T]":
        """Run ``fn(pipeline, *args, **kwargs)`` on the model worker thread."""

        def run() -> T:
            if self._pipeline is None:
                raise EngineNotReady("Model is not loaded") from self._load_error
            return fn(self._pipeline, *args, **kwargs)

        return self._worker.submit(run)

    # ------------------------------------------------------------- forecast
    def forecast(
        self, context: Any, horizon: int, frequency: str, *, seed: int = 0
    ) -> ForecastOutput:
        """Univariate forecast with sample paths. Blocks until the worker is done."""
        return self.submit_forecast(context, horizon, frequency, seed=seed).result()

    def submit_forecast(
        self, context: Any, horizon: int, frequency: str, *, seed: int = 0
    ) -> "Future[ForecastOutput]":
        if horizon < 1:
            raise ValueError(f"horizon must be >= 1, got {horizon}")
        if frequency not in YUG_FREQ:
            raise ValueError(f"unknown frequency {frequency!r}")
        target = sanitize_context(context)
        return self.submit(self._run_forecast, target, horizon, YUG_FREQ[frequency], seed)

    def _run_forecast(
        self, pipeline: YugPipeline, target: np.ndarray, horizon: int, freq: str, seed: int
    ) -> ForecastOutput:
        started = time.perf_counter()
        rng = np.random.default_rng(seed)
        with torch.inference_mode():
            paths = _sample_paths(pipeline, target, freq, horizon, self.num_samples, rng)
        quantiles = np.quantile(paths, pipeline.quantile_levels, axis=0).astype(np.float32)
        if not np.isfinite(quantiles).all():
            raise ValueError("forecast contained non-finite values")
        latency_ms = (time.perf_counter() - started) * 1000.0
        with self._stats_lock:
            self._latencies.append(latency_ms)
        return ForecastOutput(quantiles=quantiles, paths=paths, latency_ms=latency_ms)

    def forecast_with_covariates(
        self, target: Any, covariates: Any, horizon: int, frequency: str, *, seed: int = 0
    ) -> np.ndarray:
        """Quantiles ``(n_quantiles, horizon)`` from Yug's covariate path. Factor check only.

        Restricted to horizon <= one block (64): beyond it Yug tiles the sampled target into
        the covariate rows, which our research found hurts accuracy (YUG_NOTES).
        """
        if frequency not in YUG_FREQ:
            raise ValueError(f"unknown frequency {frequency!r}")
        stack = sanitize_covariate_stack(target, covariates)
        if not 1 <= horizon <= COVARIATE_MAX_HORIZON:
            raise ValueError(f"covariate horizon must be 1..{COVARIATE_MAX_HORIZON}, got {horizon}")

        def run(pipeline: YugPipeline) -> np.ndarray:
            started = time.perf_counter()
            # A bare 2-D array would be read as several univariate series; a list holding the
            # (channels, time) stack is what selects the covariate path.
            values = pipeline.predict(
                [stack], horizon, freq=YUG_FREQ[frequency], num_samples=self.num_samples, seed=seed
            ).values[0]
            with self._stats_lock:
                self._latencies.append((time.perf_counter() - started) * 1000.0)
            return values

        return self.submit(run).result()

    # ----------------------------------------------------------------- info
    def latency_stats(self) -> dict[str, float | int]:
        with self._stats_lock:
            values = np.array(self._latencies, dtype=np.float64)
        if values.size == 0:
            return {"count": 0}
        return {
            "p50": round(float(np.percentile(values, 50)), 2),
            "p95": round(float(np.percentile(values, 95)), 2),
            "count": int(values.size),
        }

    def info(self) -> dict[str, Any]:
        pipeline = self._pipeline
        if pipeline is None:
            raise EngineNotReady("Model is not loaded")
        info: dict[str, Any] = {
            "name": self.model_name,
            "parameters": int(sum(p.numel() for p in pipeline.model.parameters())),
            "quantile_levels": list(pipeline.quantile_levels),
            "max_context": int(pipeline.defaults.context_length or 0),
            "block_size": int(pipeline.config.output_dim),
            "license": MODEL_LICENSE,
            "device": str(pipeline.device),
            "num_samples": self.num_samples,
            "latency_ms": self.latency_stats(),
        }
        code = yug_commit()
        if code:
            info["revision"] = code
        info["weights_revision"] = self.revision
        return info


def yug_commit() -> str | None:
    """Commit of the installed yug package (pinned in pyproject.toml), or its version."""
    try:
        dist = distribution("yug")
    except PackageNotFoundError:
        return None
    direct_url = dist.read_text("direct_url.json")
    if direct_url:
        commit = json.loads(direct_url).get("vcs_info", {}).get("commit_id")
        if commit:
            return commit
    return dist.version


def _sample_paths(
    pipeline: YugPipeline,
    target: np.ndarray,
    freq: str,
    horizon: int,
    n_samples: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Univariate branch of ``YugPipeline._predict_one``, returning the paths.

    Returns ``(n_samples, horizon)`` in the series' own units. ``predict`` turns the same
    paths into its band with ``np.quantile(paths, levels, axis=0)``.
    """
    freq = normalize_freq(freq)
    output_len = pipeline.config.output_dim
    n_steps = -(-horizon // output_len)

    finite = target[np.isfinite(target)]
    if finite.size and not np.ptp(finite) > 0:
        # Constant series: Yug forecasts the constant and still consumes the draws.
        rng.random(n_samples * n_steps)
        return np.full((n_samples, horizon), finite[-1], dtype=np.float32)

    context_length = pipeline.defaults.context_length
    if context_length and target.shape[-1] > context_length:
        target = target[-context_length:]

    affine = _unit_scale_affine(target, float(pipeline.config.eps) ** 0.5)
    if affine is not None:
        offset, gain = affine
        target = ((target - offset) * gain).astype(np.float32)

    patch_len, pad_side = pipeline.config.patch_len, pipeline.defaults.pad_side
    target, _ = pad_to_patch_multiple(target, patch_len, pad_side)
    paths = pipeline._rollout_cached(target, freq, n_steps, n_samples, rng)[:, :horizon]
    if affine is not None:
        offset, gain = affine
        paths = (paths / gain + offset).astype(np.float32)
    return np.ascontiguousarray(paths, dtype=np.float32)


def load_pipeline(model_id: str, device: str, revision: str | None = None) -> YugPipeline:
    return YugPipeline.from_pretrained(model_id, device_map=device, revision=revision)
