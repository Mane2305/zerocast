# Decisions log

Short records of why we chose things. Add new entries at the bottom; never rewrite old ones.

| # | Decision | Why |
|---|---|---|
| 1 | Product = honest zero-shot forecasting for SMB retail/manufacturing; not a copy of Apex | Differentiate on real data onboarding, full use of quantiles, honest limits, year-in-review |
| 2 | Univariate is the default; factors are an optional check | Our experiment: covariate path worse than univariate in steps 1–64 on 3 datasets |
| 3 | No future what-if | Yug cannot see future covariates for the block it forecasts |
| 4 | Factor check uses two lenses (statistics + Yug backtest) | "Doesn't help Yug" ≠ "doesn't matter to the business" |
| 5 | Totals from sample paths, never summed quantiles | Quantiles are not additive |
| 6 | Service level 50–90% only in Phase 1 | Yug outputs P10–P90; P95/P99 needs a calibration layer (later) |
| 7 | Long-format universal template | Same shape as common forecasting tools; easy to export from Excel/ERP |
| 8 | Browser-side shrinking with DuckDB-WASM, upload Parquet | Fast, private (raw data stays local), small uploads |
| 9 | Precompute demo results as static JSON | Instant demos, zero backend cost, no cold starts for reviewers |
| 10 | Single model worker / queue | Upstream issue #9: pipeline not thread-safe |
| 11 | Pin Yug to PR #14 commit | Fast, NaN-safe covariate path; switch to release when merged |
| 12 | Phase 1 local with adapters; Phase 2 Vercel + Modal + Supabase | Free hosting; only adapters/config change |
| 13 | Demo data: Favorita (retail, daily) + India cement index (manufacturing, monthly) | Real, open, matches Yug's launch sectors; check licences before hosting |
| 14 | Product name must not contain "Yug" or "Birla" | Avoid implying affiliation |
| 15 | Keep the upstream research separate from the app; only raise a GitHub question, no PR | Owner's choice; app stays independent |
| 16 | Database connector is P2 ("coming soon") | Keep Phase 1 scope realistic |
| 17 | Sample paths reproduced in our engine (private Yug API, pinned + tested) | `predict()` returns only quantiles; totals need paths |
| 18 | Not building: anomaly early-warning monitor, "second opinion" audit, new-product forecaster | Considered and set aside; may revisit after Phase 1 |
| 19 | Retail demo uses UCI Online Retail II (CC BY 4.0) instead of Favorita | Favorita's Kaggle terms could not be checked; UCI licence is explicit |
| 20 | Datasets carry `additive`; non-additive (index, price) horizons report the MEAN, not the total | A sum of index values is meaningless; `aggregation` makes the switch explicit |
| 21 | Risk metrics use ratios of sums over the horizon (trust horizon on cumulative sums) | Mean of per-step ratios explodes on near-zero steps such as closed days |
