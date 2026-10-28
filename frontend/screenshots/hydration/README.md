# Forecast hydration fix

The sidebar and demo Forecast page share a query cache. If the sidebar fills it before the page's streamed boundary hydrates, the browser could render results against server-rendered loading HTML. The page now uses a server snapshot for its first hydration render, then shows the cached result immediately after hydration. No data fields or forecast calculations change.

Verify with `node scripts/verify-hydration.mjs` while the frontend runs on port 3000. Checks cover layout-warmed cache navigation, five retail reloads, persisted item/service-level preferences, manufacturing, mobile, and hydration errors reported through console or page errors. This is a timing-sensitive regression; the original mismatch was recorded in the Next development log and supplied browser trace.

[Desktop](desktop.png) · [Mobile at 390px](mobile.png).
