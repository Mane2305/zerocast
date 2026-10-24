# Research: how Yug v0.1.1 uses covariates

Done before building ZeroCast, to decide what the app should and should not promise.
Experiment code lives in the yug clone under `experiments/future_covariates/` (not in this repo).
Status: findings shared with the Yug team as a GitHub question (add the issue link here).

## Question
Yug's covariate rollout (`_rollout_multivariate`) copies the sampled **target** block into every
covariate row after each 64-step block ("tiling"). The team documents this as a known limitation.
Does it hurt accuracy, and would real known-future covariate values help?

## Setup
- yug 0.1.1 (main `2ad7da7` + PR #14 `4b1de57`), torch 2.11 (GPU) and 2.14 (CPU), real weights.
- Data: EPF hourly electricity prices FR/BE with day-ahead covariates (full run: 12 origins × 2
  series, 100 samples); cross-market price as covariate (quick run); fev-bench `rohlik_sales_1D`
  (quick run).
- Methods: A univariate · B tiled (current) · C true future covariates · D/D2 wrong-window
  covariates (controls) · E persist last value · F masked (future covariate positions = NaN).
- Metrics: WQL, MASE, 10–90% coverage, per horizon segment; paired bootstrap, FR+BE clustered by date.
- Sanity checks passed: B matched `pipeline.predict` exactly; steps 1–64 identical across methods.

## Findings
1. **Tiling hurts beyond step 64** when covariates don't track the target. On EPF, masking (F)
   reduced WQL by **27% / 26% / 33%** in steps 65–128 / 129–192 / 193–256, matched univariate
   accuracy, and kept the band calibrated (coverage 0.75 vs 0.52).
2. **True future covariate values did not help** more than wrong-window values: cross-attention is
   causal, so each block never sees its own covariates.
3. Where covariates track the target (cross-market price) and on rohlik, masking **tied** with
   tiling (small runs; can't rule out a small loss).
4. **Covariate path was worse than univariate in steps 1–64 on all three datasets:**

| dataset | univariate WQL | covariate WQL |
|---|---|---|
| EPF | 0.103 | 0.121 |
| cross-price | 0.131 | 0.147 |
| rohlik | 0.195 | 0.238 |

## Caveats
Two of three settings are quick runs · FR and BE prices are highly correlated (~46% identical) ·
one season (Jun–Oct 2016) for EPF · masking creates all-missing timesteps, which relies on PR #14's
NaN guard on torch < 2.5.

## What this changed in ZeroCast
- Univariate is the default; factors are an optional check (DECISIONS #2).
- No future what-if feature (DECISIONS #3).
- Factor check uses two lenses, because "doesn't help Yug" ≠ "doesn't matter" (DECISIONS #4).
- If covariates are ever used with horizon > 64, use masking, not tiling.

## Open research ideas (not started)
- **Lead shift:** add a covariate shifted 64 steps earlier so known future values fall inside the
  visible history; test whether Yug uses it zero-shot. The only route for future plans to reach
  the model without retraining.
- **Calibration layer:** conformal correction to validate P10–P90 and extend to P95/P99.
- **Sample paths API:** ask upstream for an option to return trajectories (needed for totals).
