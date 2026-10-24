# Rules for Claude Code (backend engineer)

You own `backend/` and `data/scripts/`. Read these first, every session:
`docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/YUG_NOTES.md`, `docs/DECISIONS.md`, `docs/TASKS.md`,
`contracts/openapi.yaml`.

## Hard rules
1. Work only in `backend/` and `data/scripts/`. Never edit `frontend/`.
2. Never change `contracts/` or `docs/` (except appending to `docs/DECISIONS.md` when the owner
   approves). If the contract seems wrong, stop and explain what you would change and why.
3. One task (from docs/TASKS.md) per branch: `be/<task-id>-<short-name>`. Small PRs.
4. Tests must pass (`pytest`, `ruff`) before you say a task is done. Model tests use the tiny
   random Yug model fixture; never require downloading weights in tests.
5. Only `backend/app/engine/` may import `yug`. Follow every input rule in YUG_NOTES.md.
6. Never call the Yug pipeline from more than one thread at a time.
7. No secrets in code. Config via environment variables; document them in `backend/README.md`.
8. Do not commit data files, weights, or anything in `data/raw/` or `storage/`.
9. Do not push or merge. Commit on your branch and tell the owner it is ready for review.
10. If something in the docs conflicts with what you find in the code, stop and report it.

## Definition of done
- Implements the task's "Done when" from docs/TASKS.md.
- Responses match `contracts/openapi.yaml` exactly (add a contract test).
- `backend/README.md` updated with how to run what you built.
- A short summary: what changed, how to test it, known limitations.
