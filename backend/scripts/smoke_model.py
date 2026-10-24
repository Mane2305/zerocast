"""Manual check with the real Yug weights (downloads ~1.1 GB on first run).

uv run python -m scripts.smoke_model
"""

import time

import numpy as np

from app.config import get_settings
from app.engine.summaries import total_distribution
from app.main import build_engine


def main() -> None:
    settings = get_settings()
    started = time.perf_counter()
    engine = build_engine(settings.model_copy(update={"load_model": True}))
    engine.wait_until_loaded()
    print(f"loaded {settings.model_id} in {time.perf_counter() - started:.1f} s")

    t = np.arange(730)
    context = 100 + 20 * np.sin(2 * np.pi * t / 7) + 0.05 * t
    for horizon in (28, 256):
        out = engine.forecast(context, horizon, "daily", seed=0)
        total = total_distribution(out.paths)
        print(
            f"horizon {horizon:>3}: {out.latency_ms:7.0f} ms | "
            f"P50 step1={out.quantiles[4, 0]:.1f} | total P10/P50/P90 = "
            f"{total[10]:.0f}/{total[50]:.0f}/{total[90]:.0f}"
        )
    print("info:", {k: v for k, v in engine.info().items() if k != "quantile_levels"})
    engine.shutdown()


if __name__ == "__main__":
    main()
