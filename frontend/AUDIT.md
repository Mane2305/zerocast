# Frontend readiness audit

## Scope and evidence

Reviewed the repository's product, architecture, decisions, task, API-contract, and UI-pattern documents; the App Router page tree; shared shell and styles; upload mapping and browser-side conversion; route loading/error boundaries; and the existing mobile/desktop screenshots under `screenshots/decision-studio/` and `screenshots/remaining/`.

The existing screenshots show that the current shell and upload flow adapt to 390px and that horizontal preview scrolling is contained. They do not cover the requested 320px–2560px range, every route, extreme input sizes, RTL, or all states. Those conditions remain unverified in this audit; the screenshot evidence is not a substitute for those checks.

## Prioritized findings

1. **High-field-count mapping is difficult to use.** The wide-layout item picker and long-layout hierarchy picker render every source column as a checkbox in one wrapping list. There is no search, selected/available count, or bounded scroll region. A file with 60–200 columns therefore makes the mapping step long and hard to scan, especially on mobile. The preview renders every column too, with horizontal scrolling but no clear column count or scroll cue. Existing wide-file evidence covers only a few columns.
2. **Large-file responsiveness is only partly evidenced.** Parsing and conversion run in browser workers, and the app enforces source/prepared size limits. Progress is communicated as changing status text; no percentage is available for parsing/conversion, and there is no evidence for the brief's 100k-row/100+column case. Large-file performance and cancellation recovery need a dedicated stress pass.
3. **The existing responsive evidence is narrow.** Screenshots cover desktop and 390px layouts for selected pages. The 360px, 768px, 1280px, and 1920px+ breakpoints, all routes, and route-by-route light/dark behavior have not been visually audited here.
4. **The requested production bar exceeds the documented frontend task scope.** The current frontend has route-level loading/error/not-found states, a theme toggle, a typed API client, and separate chart/table views. The pasted brief's 100k-row/200-column virtualized table, per-widget boundaries, broad offline/stale/partial states, and full onboarding wizard are not present as one shared implementation. These should be handled as separate scoped tasks after the upload and page-overflow issues are addressed.

## Design direction

Use the Stripe reference for dense analytics hierarchy and the Airtable reference for legible data-workflow patterns. Keep ZeroCast's existing green brand, current routes, and decision-studio shell; borrow interaction and spacing patterns only, not another product's visual identity.

## First implementation slice

Harden the F3 upload flow for wide datasets: searchable column pickers, clear selected counts, bounded/keyboard-scrollable options, and an explicit preview scroll affordance. Keep the generated API contract and conversion semantics unchanged. Follow-on responsive and performance audits should be separate reviewable slices.

## Phase 1 changes and verification

- Added search, selected/available counts, a 120-option visible window, and a bounded keyboard-scrollable checkbox list for item, hierarchy-ID, and driver columns. Driver selection stops at the existing 10-driver limit.
- Made the preview's column count and horizontal-scroll behavior explicit, added full-value hover titles for clipped cells, and allowed upload fieldsets to shrink so the preview's width stays inside its own scroller.
- A generated local CSV with 130 item columns and 40 daily rows was inspected and converted. The prepared result contained 5,200 rows and 130 items. The preview remained in a 287px container at a 360px viewport while retaining a 12,505px horizontal scroll area; the page itself stayed within the viewport.
- Checked document width on 11 routes (`/`, data, upload, forecast, portfolio, accuracy, review, factors, data health, model/method, and research) at 360px, 768px, 1280px, and 1920px in both themes: 88 checks, no horizontal page overflow. The upload page also stayed within the viewport at 320px.
- `npm run lint`, `npm run typecheck`, and `npm run build` passed. npm emitted an existing Node engine warning for the Prism mock-server packages (they request Node >=24.18; this environment has 24.14.1) and Next.js warned that it ignores a parent `package-lock.json` outside the repository.

The 100k-row case, RTL, malformed/duplicate headers, API failures during upload, assistive-technology behavior, Lighthouse, and complete before/after screenshots are still unverified. This slice improves wide-file mapping and overflow; it does not satisfy the entire production-readiness brief.

## Phase 2: large Data Health reports

- The Data Health table now renders 50 rows per page, with previous/next controls and a visible range. Search, status, health-check tabs, and sorting return the user to the first page. Export still includes every row matching the current filters.
- Search uses a deferred value, and affected-item matching uses a memoized set to avoid repeated linear array lookups for every row.
- Verified with a synthetic 130-item API report: pages contained 50, 50, and 30 rows; searching found the final item; the 320px page had no horizontal overflow.
- This does not prove the 100k-item case; client filtering and sorting still process the full supplied list.
