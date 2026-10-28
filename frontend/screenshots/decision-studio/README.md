# Decision Studio v2 review

Main screenshots show the real precomputed demo JSON. Before images were captured before this task. Data quality compares the same report route; Data sources is the new workspace entry.

| Page | Before, desktop | After, desktop | Before, 390px | After, 390px |
|---|---|---|---|---|
| Forecast | [Before](before-forecast-desktop.png) | [After](after-forecast-desktop.png) | [Before](before-forecast-mobile.png) | [After](after-forecast-mobile.png) |
| Portfolio | [Before](before-portfolio-desktop.png) | [After](after-portfolio-desktop.png) | [Before](before-portfolio-mobile.png) | [After](after-portfolio-mobile.png) |
| Data quality | [Before](before-data-desktop.png) | [After](after-data-quality-desktop.png) | [Before](before-data-mobile.png) | [After](after-data-quality-mobile.png) |

Additional states: [Data sources](after-data-desktop.png), [Data sources on mobile](after-data-mobile.png), [dark mobile](after-dark-mobile.png), [demo error](error.png).

[API workspace](api-workspace.png) uses browser-only contract fixtures to test the explicit Run interaction. It is test evidence, not an actual backend model run. All other after images were refreshed against the production build with `NEXT_PUBLIC_API_URL` unset; the smoke test asserted zero API requests.

Checks: lint, typecheck, production build, forecast/probability and formatting unit tests, v2 browser suite on the configured-API dev build and API-free production build. The forecast now reads WAPE, range accuracy, and the last-backtest overlay from the refreshed producer's `accuracy.json`; missing accuracy files leave those features hidden. The dedicated Accuracy page remains a separate task.
