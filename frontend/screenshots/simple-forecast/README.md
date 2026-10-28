# Simpler Forecast chart

Default: recorded demand, a base-case forecast (P50), and one shaded low-to-high range (P10–P90). Last year, genuine sample paths, and the full supplied recent backtest are available under **Compare**, initially off. Forecast numbers and the 90-point history window are unchanged; the slider reaches the full supplied history. Blank observations remain gaps.

| View | Before | After |
| --- | --- | --- |
| Desktop | [Before](before-desktop.png) | [After](after-desktop.png) |
| Mobile, 390px | [Before](before-mobile.png) | [After](after-mobile.png) |

[Optional comparisons enabled](comparisons.png).

Verify with the dev server running: `node scripts/verify-simple-forecast.mjs`. This checks retail and manufacturing, the uncluttered default, optional comparison layers, mobile overflow and browser errors. All displayed forecast data comes from the existing real demo JSON.
