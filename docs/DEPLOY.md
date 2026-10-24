# Phase 2: deploy on free tiers

Start only after Phase 1 sign-off (TASKS I4). Check each provider's current free-tier terms
before relying on them; they change often.

## Services
| Part | Service | Free tier notes |
|---|---|---|
| Frontend | Vercel (Hobby) | Personal, non-commercial projects |
| API + model | Modal (Starter) | ~$30/month free credits; reported to need no card (verify at sign-up). Don't add a card, so overruns pause instead of billing |
| Database + files | Supabase (Free) | 500 MB Postgres, 1 GB storage; **pauses after ~1 week idle** |
| CI + keep-alive | GitHub Actions | Free for public repos |

Not usable for Yug: Railway free (0.5 GB RAM), Hugging Face Spaces (Gradio/Docker Spaces now need
a paid plan for new accounts). Backup: Oracle Cloud Always Free (2 ARM CPUs, 12 GB RAM; more
setup; idle instances can be reclaimed).

## Steps
1. **Supabase:** create project → run migrations → create a storage bucket for datasets.
2. **Backend adapters:** `ZC_ENV=prod`, Postgres URL, Supabase storage, Modal JobRunner
   (`spawn` per job, job rows in Postgres). No other code changes.
3. **Modal:** one web endpoint (FastAPI app) + one GPU-free CPU function holding the model.
   Bake weights into the image or a Modal Volume so cold starts don't re-download 1.1 GB.
   Set container memory ≥ 4 GB. Scale to zero when idle.
4. **Vercel:** set `NEXT_PUBLIC_API_URL` to the Modal endpoint; demos stay static JSON.
5. **Cold starts:** first request after idle takes seconds. Show "Waking up the model (~20 s)";
   call `/health` on page load to warm it.
6. **Keep-alive:** weekly GitHub Action that queries Supabase so the free project doesn't pause.
7. **Uploads in prod:** browser uploads Parquet straight to Supabase Storage with a signed URL;
   backend only receives the object key.
8. **Limits:** keep PRODUCT.md limits; add simple per-IP rate limiting on job endpoints.
9. **Footer:** non-commercial notice + Yug CC-BY-NC attribution + "not affiliated with Birla AI Labs".
