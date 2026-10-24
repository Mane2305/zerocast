# ZeroCast — Product Spec (Phase 1)

> Placeholder name. Do not use "Yug" or "Birla" in the product name, logo or domain.

## One line

Bring your business time-series data and get an honest, zero-shot forecast in seconds —
scenarios, risks, and a review of last year's surprises — powered by the Yug foundation
model, with no training and no data scientist.

## Who it is for

Small and mid-size businesses and analysts in **retail and manufacturing** (two of the
sectors Yug was launched for) who have sales/dispatch history but no ML team.

## Design principles (from our research — see YUG_NOTES.md)

1. **Sales-only is the default.** In our tests, Yug's covariate path was less accurate than
   univariate in steps 1–64 on all three datasets. Factors are an optional check, never the default.
2. **Never promise what the model can't do.** No "what if I run a promo next week" — Yug cannot
   see future covariate values for the block it forecasts.
3. **Use the whole P10–P90 distribution**, not just P90.
4. **Every number is traceable**: show where it came from (model, quantile, data period).
5. **Nothing heavy runs until the user clicks Run** (pattern from enterprise planning tools).
6. **Honest about limits**: show data-quality warnings, model limits and licence on screen.

## Pages

Priority: **P0** = must ship in Phase 1, **P1** = ship if time allows, **P2** = later.

### 1. Connect data (P0)
- Three doors:
  - **Try a demo** → Retail (Favorita store sales, daily) · Manufacturing (India cement production
    index, monthly). Demo results are **precomputed** and load instantly.
  - **Bring a file** → CSV / Excel / Parquet in the universal template (below). Shrunk and
    converted to Parquet **in the browser** with DuckDB-WASM, then uploaded.
  - **Connect a database** → shown as "coming soon" (P2).
- Downloadable template + example file.
- Column mapping screen: app guesses `date`, `series_id`, `target`, extra columns; user confirms.
- Limits shown **upfront**: raw file ≤ ~1 GB (browser), uploaded Parquet ≤ 50 MB,
  ≥ 30 points per series, ≤ 10 factor columns, horizon ≤ 256 steps, ≤ 100 series per forecast run.

### 2. Data health (P0)
- Problem tabs with counts, each tab filters a table: `Missing dates · Duplicates · Negative values ·
  Non-finite values · Too short · Constant series`.
- Quantified warning banners: "6 missing days (0.8%) filled as blanks".
- Detected frequency (hourly/daily/weekly/monthly) + history length per series.
- "Ready to forecast" summary card.

### 3. Forecast (P0)
- Parameters bar → **Run**: series picker (multi), horizon, service level.
- Empty state with 3 numbered steps before first run.
- Fan chart: history, **same period last year**, P50 line, P30–P70 and P10–P90 bands.
- Badge: "Generated in 0.3 s · zero-shot · no training · CPU".
- **Scenario cards** for the horizon total: Pessimistic (P10) · Expected (P50) · Optimistic (P90).
- **Plan card**: "To be X% sure you won't run short over the next N steps, plan for Y."
  Service level slider 50–90% (Yug's native range; no extrapolation in Phase 1).
- **Target probability**: user enters a target total → "about 22% chance of reaching it".
- **Capacity risk**: user enters a capacity per step → "about 15% chance demand exceeds it on step k".
- Export CSV.

> Totals (weekly/monthly sums) must be computed from **sample paths**, never by summing quantiles.

### 4. Portfolio risk (P0)
One row per series, sortable table:
- **Uncertainty score** = (P90 − P10) / P50 over the horizon → "±8% predictable" … "±45% volatile".
- **Risk direction**: ⬆ upside (P90−P50 ≫ P50−P10) / ⬇ downside / ↔ balanced.
- **Trust horizon**: first step where relative band width exceeds a threshold → "reliable ~3 weeks".
- Click a row → Forecast page for that series.

### 5. Year in review (P1)
- Replays the last 12 months (or last N periods): at each origin, forecast using only data
  before it; compare with what actually happened.
- **Biggest positive surprises** and **biggest misses**, ranked by size (show top 5 each, not
  every band breach — ~1 in 5 periods falls outside P10–P90 by chance).
- Auto-match to a holiday/festival calendar (country chosen by user; `holidays` package).
- "No known event — what happened?" → user can annotate (stored per dataset).
- Optional ₹ impact if the dataset has a price/revenue column.
- Insight: a recurring festival that was **as big as expected** is reported as such, not as a surprise.

### 6. Factor check (P1)
Two lenses per user-supplied factor — never present one as the other:
- **Lens 1 — Related to your sales?** Simple, transparent statistics on de-trended,
  de-seasonalised data, lags 0..k. Language: "related to", never "causes".
- **Lens 2 — Helps Yug forecast?** Backtest sales-only vs sales + this factor (horizon ≤ 64).
- Result table: Factor · Related? · Helps Yug? · What it means.
  E.g. "Real driver, but Yug doesn't use it well yet — track it separately."

### 7. Under the hood (P0)
- Model card summary (Yug, 271.8M params, P10–P90, context 2048, CC-BY-NC weights).
- Live latency stats for this deployment.
- Link to our covariate research write-up and GitHub issue.
- Known limits in plain language.

## Universal data template (long format)

| column | required | notes |
|---|---|---|
| `date` | yes | ISO `YYYY-MM-DD` (or `YYYY-MM-DD HH:MM` for sub-daily) |
| `series_id` | yes | what is forecast separately: product, store, plant, product×store |
| `target` | yes | number to forecast (units, tonnes, MW, ₹…) |
| any other column | no | treated as a factor (covariate). Numeric only. |

Rules: one row per series per date · blanks for unknown (never 0 for unknown) · plain numbers
(no commas, no ₹) · evenly spaced dates.

## Out of scope for Phase 1
Database connector · auth/multi-user · promo what-if · prices/elasticity · P95/P99 (needs a
calibration layer) · fine-tuning · payments (weights are non-commercial).
