# Yug — what every agent must know

Source: reading `birla-ai-labs/yug` (v0.1.1, main `2ad7da7`, PR #14 `4b1de57`) and our own
experiments. Read this before touching `backend/app/engine/`.

## The model in one paragraph
Decoder-only, patch-based transformer. 271.8M params, d_model 960, 12 layers, 8 heads,
patch length 16, max context 2048 points. Each forward pass emits the next **64 points** at
**9 quantiles (0.1 … 0.9)**. Longer horizons are produced by rollout: sample a 64-point block per
path (default 100 paths), append it, forecast again; the returned band is the empirical quantile
across paths. Normalisation is causal (no future leakage). A frequency embedding
(sec/min/hour/day/week/month/quarter/year/unknown) is a model input.

## Install
Until PR #14 is merged, pin the PR commit:
```
yug @ git+https://github.com/birla-ai-labs/yug@4b1de5776b6650cf0fd88e55943036cb9ddb8709
```
Switch to the released package once #14 is in a release. Weights: Hugging Face `birlaailabs/yug`
(~1.1 GB, float32). Licence: **weights CC-BY-NC 4.0 (non-commercial)**, code Apache-2.0.
Show attribution and the licence on the "Under the hood" page.

## Inputs
- `pipeline.predict(context, prediction_length, freq=..., num_samples=..., seed=...)`.
- Univariate: 1-D array. Covariates: 2-D `(channels, time)`, **target in row 0**.
- Pass **NumPy arrays**, never a pandas DataFrame (issue #13: DataFrames are split per row).
- A `(1, T)` single-channel 2-D array crashes (issue #13) — squeeze to 1-D.
- Replace ±inf with NaN before calling (issue #7: inf is treated as an observed 0).
- Missing values: NaN is fine (masked).
- Frequency strings: use `"h"`, `"D"`, `"W"`, `"M"`, `"Q"`, `"A"`. Do **not** pass `"Y"` or `"ms"`
  (issue #11 maps them to the wrong bucket). Normalise in our code.
- Constant series are short-circuited by Yug (returns the constant).

## Concurrency
`YugPipeline` keeps mutable rollout state on a shared engine (issue #9). **Never** call the same
pipeline from two threads at once. Use a single worker/queue.

## Performance
- `num_samples` drives cost for horizons > 64. For horizon ≤ 64 the univariate path is ~1 forward pass.
- PR #14 makes covariate step 0 a single pass (14.3 s → 0.4 s in our CPU test).

## What we found (our experiment — covariate effectiveness)
1. In `_rollout_multivariate`, after each 64-step block the sampled **target** block is copied into
   every covariate row. On EPF hourly prices this cost ~25–35% WQL in steps 65+. Leaving those
   future covariate positions as **NaN (masked)** matched univariate accuracy and kept the
   10–90% band calibrated. On two smaller tests masking tied with tiling.
2. Supplying **true future covariate values** did not help: cross-attention is causal and each
   block never sees its own covariates.
3. On all three datasets (EPF, cross-market price, rohlik_sales_1D) the covariate path was **less
   accurate than univariate in steps 1–64**.

### Consequences for ZeroCast
- **Default to univariate.** Covariates only inside the Factor check, with horizon ≤ 64.
- If covariates are ever used with horizon > 64, use a masked rollout (our wrapper), not tiling.
- No "future what-if" feature.

## Sample paths (needed for totals)
`predict()` returns quantiles only. Horizon totals (week/month sums, target probability,
scenario totals) must be computed from the **sample paths**, because quantiles do not add.
Our `YugEngine` must reproduce the univariate rollout to keep the paths (mirror PR #14's
`_predict_one` / `_rollout_cached` exactly). This touches private APIs: pin the version and
cover it with a test asserting our per-step quantiles equal `pipeline.predict` for the same seed.

## Open upstream issues to remember
#7 inf as zero · #8 negative target_index · #9 not thread-safe · #10 yug-check disk path ·
#11 Y/ms frequency aliases · #12 GluonTS adapter ignores target_index/lead_time ·
#13 DataFrame split per row / (1,T) crash.
