# Requested forecast visualization inputs

**v0.2 update:** The producer has now added `SeriesForecast.sample_paths` and `AccuracyResult.series[].backtest` in `accuracy.json`. The v2 forecast uses those contract fields, including WAPE and observed range accuracy. The overlay shows the last supplied horizon, preserves null actuals, and marks actuals outside the supplied backtest range. The `ReviewResult.backtest_points` proposal below is superseded and is not read by the v2 UI. F11 now supplies the dedicated Accuracy page and explicit live accuracy-job workflow.

## Earlier proposal

The owner approved genuine sample paths and full backtest points, then explicitly retained frontend-only scope. This document proposes the producer additions; it does not claim that they already exist in the current contract. Only the contract owner edits `contracts/openapi.yaml`.

- Optional `SeriesForecast.sample_paths`: `number[][]`, shape `[path][forecast step]`, up to 100 genuine model sample paths, finite and aligned with the same series' `dates`. Do not generate paths in the frontend or reconstruct them from quantiles.
- Optional `ReviewResult.series[].backtest_points`: full dated replay points, each with `date`, `actual`, `expected_p50`, and optional `expected_p10` / `expected_p90`. Keep ranked `positive_surprises` / `misses` separate, and preserve `band_coverage` as observed coverage across the supplied review period.
- Static demos should include these fields in the existing `forecast.json` and `review.json`; all paths and points must belong to the indicated series. Opening a demo must not trigger inference.

Until supplied and valid, the corresponding visualization stays unavailable. The UI labels the actual path count, never an invented “100”. Live forecast workspaces reuse only a review-job ID that this browser session recorded while submitting a review for the same dataset; the API has no latest-review endpoint. No unrelated cached review job is selected, and no review job is started automatically.
