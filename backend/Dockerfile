# Hugging Face Docker Space (free "CPU basic": 2 vCPU, 16 GB RAM). See README "Deploy: Hugging Face
# Spaces". Built by Hugging Face from the files `scripts/deploy_hf_space.py` uploads.
FROM python:3.11-slim

# git: yug is pinned to a git commit in uv.lock.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv

# Spaces run the container as user 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    HF_HOME=/home/user/hf \
    UV_PROJECT_ENVIRONMENT=/home/user/venv \
    UV_LINK_MODE=copy \
    PATH=/home/user/venv/bin:$PATH
RUN mkdir -p /home/user/app
WORKDIR /home/user/app

COPY --chown=user pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Weights baked into the image (before the app code, so code changes reuse this layer):
# a restart after the Space sleeps reads them from disk instead of downloading 1.1 GB.
ARG ZC_MODEL_ID=birlaailabs/yug
RUN python -c "from huggingface_hub import snapshot_download; \
snapshot_download('${ZC_MODEL_ID}', allow_patterns=['config.json', 'model.safetensors'])"

COPY --chown=user alembic.ini ./
COPY --chown=user migrations ./migrations
COPY --chown=user app ./app

# ZC_DB_URL (Neon) is a Space secret and ZC_CORS_ORIGINS a Space variable, set in the Space
# settings. Uploaded files live on the container disk and are lost when the Space restarts.
ENV ZC_ENV=prod \
    ZC_DEVICE=cpu \
    ZC_MODEL_ID=${ZC_MODEL_ID} \
    ZC_STORAGE_DIR=/home/user/uploads \
    ZC_TORCH_THREADS=2 \
    OMP_NUM_THREADS=2 \
    HF_HUB_OFFLINE=1

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
