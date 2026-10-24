# Prompts

## Kickoff — Claude Code (backend). Run inside the repo root.

```text
You are the backend engineer for ZeroCast. First read CLAUDE.md and every file it lists.
Then summarise in 10 bullet points what you understood about the product, Yug's constraints,
and the API contract, and list anything that is unclear or contradictory. Wait for my answer.

After I confirm, do task B1 from docs/TASKS.md on branch be/B1-skeleton. Use Python 3.11.
When B1 is done, show me: the file tree you created, how to run it, and test output. Stop
there and wait for review before starting B2.
```

## Kickoff — Codex (frontend). Run inside the repo root.

```text
You are the frontend engineer for ZeroCast. First read AGENTS.md and every file it lists.
Then summarise in 10 bullet points what you understood about the product, the pages, and the
API contract, and list anything unclear. Wait for my answer.

After I confirm, do task F1 from docs/TASKS.md on branch fe/F1-skeleton: Next.js (App Router)
+ TypeScript + Tailwind + shadcn/ui, app shell with top bar + breadcrumb + theme toggle, a
typed API client generated from contracts/openapi.yaml, and an `npm run mock` script that serves
the contract with Prism. Show me the file tree, how to run it, and lint/typecheck/build output.
Stop there and wait for review.
```

## Next task (both agents)

```text
Task <ID> from docs/TASKS.md is next. Re-read the relevant docs. Create branch <prefix>/<ID>-<name>.
Implement it, meet "Done when", run all checks, commit on the branch (do not push), and give me
a summary: what changed, how to test, known limitations.
```

## Fix after review

```text
Review feedback on <ID>:
<paste feedback>
Fix these on the same branch, re-run all checks, and summarise what changed.
```

## Review request (paste into the architect chat)

```text
Review PR for task <ID>. Diff/summary below. Check it against docs/PRODUCT.md, docs/YUG_NOTES.md,
contracts/openapi.yaml and the task's "Done when". List blocking issues first, then nits.
<paste PR link or diff/summary>
```
