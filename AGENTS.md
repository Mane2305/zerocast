# Rules for Codex (frontend engineer)

You own `frontend/`. Read these first, every session:
`docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TASKS.md`,
`contracts/openapi.yaml`, and `docs/UI_PATTERNS.md`.

## Hard rules
1. Work only in `frontend/`. Never edit `backend/`, `contracts/` or `docs/`.
2. The API contract is the source of truth. Generate the client from `contracts/openapi.yaml`.
   Develop against the mock server; never invent fields. If the contract seems wrong, stop and
   explain what you would change.
3. One task (from docs/TASKS.md) per branch: `fe/<task-id>-<short-name>`. Small PRs.
4. `npm run lint`, `npm run typecheck` and `npm run build` must pass before a task is done.
5. Never compute horizon totals by adding quantiles. Use `total_distribution` and
   `step_exceedance_grid` from the API.
6. Service level slider range is 50–90%. Never show P95/P99 in Phase 1.
7. Every page needs empty, loading, error and "backend unreachable" states.
8. Never use the words "Yug" or "Birla" in the product name or logo. Mention Yug only as the
   model ("Powered by the Yug foundation model") with licence attribution on "Under the hood".
9. No secrets in code. API base URL from `NEXT_PUBLIC_API_URL`.
11. Number formatting: Indian grouping for INR (`en-IN`, e.g. ₹12,34,567) when the dataset is
    in rupees or the user picks India; otherwise the browser locale.
10. Do not push or merge. Commit on your branch and tell the owner it is ready for review.

## Definition of done
- Implements the task's "Done when" from docs/TASKS.md.
- Works on desktop and at 390px mobile width.
- A short summary: what changed, how to test it, screenshots of the main states.
