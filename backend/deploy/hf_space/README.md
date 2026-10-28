---
title: ZeroCast API
emoji: 📈
colorFrom: blue
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: ZeroCast forecasting API (FastAPI + Yug model)
---

# ZeroCast API

Backend of ZeroCast: honest zero-shot forecasting with the Yug model
([birlaailabs/yug](https://huggingface.co/birlaailabs/yug), CC-BY-NC-4.0, non-commercial use).

- Health: `GET /health` (`model_loaded` turns true a few seconds after start).
- API docs: `/docs`.

This Space is deployed from the `backend/` folder of the ZeroCast repo by
`scripts/deploy_hf_space.py`. Uploaded datasets are stored on the container disk and are lost
when the Space restarts or sleeps (after 48 h without visits).
