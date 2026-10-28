# F11 Accuracy review

Real saved demo JSON supplies the main [desktop](desktop.png), [390px mobile](mobile.png), and [dark mobile](mobile-dark.png) reports. KPI tiles use the API's pooled metrics, while both charts use the selected item's own data. Scores are never averaged from the visible table.

Browser-only contract fixtures cover [before Run](before-run.png), [running](running.png), [completed API result](api-result.png), [backend unreachable](backend-unreachable.png), [failed job](job-failed.png), [mismatched items](job-mismatch.png), and [wrong job type](job-wrong-type.png). These are test states, not actual backend model runs.

Saved-data fixtures cover [unavailable file](error.png), [invalid arrays](invalid.png), [empty result](empty.png), and [missing benchmark](no-baseline.png). Optional benchmark percentages remain unavailable rather than being reconstructed.

Run `npm run verify:accuracy` with the local frontend at port 3000. Use `VERIFY_URL` for a different URL and `VERIFY_DEMO_MODE=1` for an API-free production build. The latter skips live-job fixtures. Also run `npm run test:accuracy`, `npm run lint`, `npm run typecheck`, and `npm run build`.
