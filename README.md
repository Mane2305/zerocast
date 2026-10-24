# ZeroCast

Honest zero-shot forecasting for retail and manufacturing data — scenarios, risks and a review
of last year's surprises, with no training and no data scientist.

Powered by the [Yug](https://huggingface.co/birlaailabs/yug) time-series foundation model by
Birla AI Labs. Model weights are licensed CC-BY-NC 4.0 (non-commercial); this project is a
non-commercial demo and is not affiliated with Birla AI Labs.

## Status
Phase 1 (local development) in progress. See `docs/TASKS.md`.

## Docs
- `docs/PRODUCT.md` — what we are building and why
- `docs/ARCHITECTURE.md` — how it fits together (Phase 1 local, Phase 2 Vercel + Modal + Supabase)
- `docs/YUG_NOTES.md` — model constraints and our covariate research findings
- `docs/RESEARCH.md` — our evaluation of Yug's covariate path and how it shaped the product
- `docs/DEPLOY.md` — Phase 2 deployment on free tiers
- `docs/DECISIONS.md` — decision log
- `docs/TASKS.md` — task breakdown
- `docs/UI_PATTERNS.md` — UI patterns
- `docs/PROMPTS.md` — prompts for the coding agents
- `contracts/openapi.yaml` — API contract

## Running locally
Filled in as `backend/` and `frontend/` are built.
