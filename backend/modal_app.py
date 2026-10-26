"""Modal deployment (docs/version2/DEPLOY.md): the FastAPI app with the Yug model, one container.

    cd backend
    uv run --group deploy modal run modal_app.py::download_weights   # once: weights → Volume
    uv run --group deploy modal deploy modal_app.py                  # prints the endpoint URL

Needs a Modal secret named `zerocast` holding ZC_DB_URL (Neon) and ZC_CORS_ORIGINS
(the Vercel domain, JSON list), and optionally HF_TOKEN. See backend/README.md "Deploy (B14)".
"""

from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
WEIGHTS_DIR = "/data/hf"
UPLOADS_DIR = "/data/uploads"

weights = modal.Volume.from_name("zerocast-weights", create_if_missing=True)
uploads = modal.Volume.from_name("zerocast-uploads", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")  # yug is pinned to a git commit in pyproject.toml / uv.lock
    .uv_sync(str(HERE), extra_options="--no-dev")
    .env(
        {
            "HF_HOME": WEIGHTS_DIR,
            "ZC_ENV": "prod",
            "ZC_DEVICE": "cpu",
            "ZC_STORAGE_DIR": UPLOADS_DIR,
        }
    )
    .add_local_python_source("app")
    .add_local_dir(HERE / "migrations", "/root/migrations")
)

app = modal.App("zerocast", image=image)
secrets = [modal.Secret.from_name("zerocast")]
volumes = {WEIGHTS_DIR: weights, UPLOADS_DIR: uploads}


@app.function(volumes=volumes, secrets=secrets, timeout=1800)
def download_weights() -> None:
    """Download the weights into the Volume once, so cold starts only read them."""
    from app.config import get_settings
    from app.engine.yug_engine import load_pipeline

    settings = get_settings()
    load_pipeline(settings.model_id, "cpu", settings.model_revision)
    weights.commit()


@app.function(
    volumes=volumes,
    secrets=secrets,
    cpu=2,
    memory=4096,
    min_containers=0,
    # One container only: jobs run on an in-process worker and the Yug pipeline must never
    # be called from two places at once (CLAUDE.md rule 6, DECISIONS #10).
    max_containers=1,
    # Stay up between polls so a running job is not cut off; a job longer than this with no
    # requests at all can still be lost on scale-down (it is then marked failed on restart).
    scaledown_window=900,
    timeout=3600,
)
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def api():
    from app.main import create_app

    return create_app()
