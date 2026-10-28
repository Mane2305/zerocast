"""Modal deployment (docs/version2/DEPLOY.md): the FastAPI app with the Yug model, one container.

    cd backend
    uv run --group deploy modal run modal_app.py::download_weights   # once: weights → Volume
    uv run --group deploy modal deploy modal_app.py                  # prints the endpoint URL

Needs a Modal secret named `zerocast` (or the name in ZC_MODAL_SECRET at deploy time) holding
ZC_DB_URL (Neon) and ZC_CORS_ORIGINS (the Vercel domain, JSON list), and optionally HF_TOKEN.
See backend/README.md "Deploy (B14)".

Fast cold starts (B15):
- Memory snapshot: imports, weight loading and a warm-up forecast run once in
  `@modal.enter(snap=True)`; later cold starts restore that memory instead of redoing them.
  The model is on CPU, so the loaded weights are part of the snapshot.
- Threads (the job worker, the model worker) are started only after the restore
  (`snap=False`), since a snapshot cannot carry running threads.
- Weights load with HF_HUB_OFFLINE=1 from the Volume: no Hugging Face network checks.
- ZC_TORCH_THREADS=4: the container sees the host's CPU count, and too many threads is slower.
- Keep-warm schedule (opt-in): deploy with ZC_KEEP_WARM=1 to keep one container up on weekdays
  10:00-18:00 IST (~$1/day). Off by default, so the container runs only while it is used.
"""

import os
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
WEIGHTS_DIR = "/data/hf"
UPLOADS_DIR = "/data/uploads"
APP_NAME = "zerocast"
TIMEZONE = "Asia/Kolkata"
VERCEL_ORIGINS = "https://zerocast(-[a-z0-9-]+)?[.]vercel[.]app"

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
            # cpu=2 below is 2 physical cores = 4 vCPU.
            "ZC_TORCH_THREADS": "4",
            "OMP_NUM_THREADS": "4",
            # Every Vercel deployment of the `zerocast` project (production, preview, branch).
            "ZC_CORS_ORIGIN_REGEX": VERCEL_ORIGINS,
        }
    )
    .add_local_python_source("app")
    .add_local_dir(HERE / "migrations", "/root/migrations")
)

app = modal.App(APP_NAME, image=image)
secrets = [modal.Secret.from_name(os.environ.get("ZC_MODAL_SECRET", "zerocast"))]
volumes = {WEIGHTS_DIR: weights, UPLOADS_DIR: uploads}


@app.function(volumes=volumes, secrets=secrets, timeout=1800)
def download_weights() -> None:
    """Download the weights into the Volume once, so cold starts only read them."""
    from app.config import get_settings
    from app.engine.yug_engine import load_pipeline

    settings = get_settings()
    load_pipeline(settings.model_id, "cpu", settings.model_revision)
    weights.commit()


@app.cls(
    volumes=volumes,
    secrets=secrets,
    cpu=2,
    memory=4096,
    min_containers=0,
    # One container only: jobs run on an in-process worker and the Yug pipeline must never
    # be called from two places at once (CLAUDE.md rule 6, DECISIONS #10).
    max_containers=1,
    # Idle minutes before shutdown (billed). Clients poll running jobs every few seconds,
    # which keeps the container up, so 5 min is enough and keeps the bill low.
    scaledown_window=int(os.environ.get("ZC_SCALEDOWN_SECONDS", "300")),
    timeout=3600,
    enable_memory_snapshot=True,
)
@modal.concurrent(max_inputs=50)
class Api:
    @modal.enter(snap=True)
    def load_model(self) -> None:
        """Captured in the snapshot: imports, weights in memory, one warm-up forecast."""
        os.environ["HF_HUB_OFFLINE"] = "1"  # read before huggingface_hub is imported
        import torch

        from app.config import get_settings
        from app.engine.yug_engine import load_pipeline, warm_up

        settings = get_settings()
        torch.set_num_threads(settings.torch_threads or 4)
        self.pipeline = load_pipeline(settings.model_id, "cpu", settings.model_revision)
        warm_up(self.pipeline, settings.num_samples)

    @modal.enter(snap=False)
    def start(self) -> None:
        """After restore: threads, the database connection and the FastAPI app."""
        import torch

        from app.config import get_settings
        from app.engine import YugEngine
        from app.main import create_app

        settings = get_settings()
        torch.set_num_threads(settings.torch_threads or 4)
        engine = YugEngine(
            lambda: self.pipeline,  # already loaded: the worker thread just takes it
            num_samples=settings.num_samples,
            model_name=settings.model_id,
            revision=settings.model_revision,
            torch_threads=settings.torch_threads,
        )
        self.web = create_app(settings, engine=engine)

    @modal.asgi_app()
    def api(self):
        return self.web


def _set_min_containers(count: int) -> None:
    modal.Cls.from_name(APP_NAME, "Api")().update_autoscaler(min_containers=count)


if os.environ.get("ZC_KEEP_WARM") == "1":  # read at deploy time, see the module docstring

    @app.function(schedule=modal.Cron("0 10 * * 1-5", timezone=TIMEZONE))
    def keep_warm() -> None:
        """Working hours: one container always up, so nobody waits for a cold start
        (about $0.13/h for 2 cores + 4 GiB: ~$22/month for 8 h on weekdays)."""
        _set_min_containers(1)

    @app.function(schedule=modal.Cron("0 18 * * 1-5", timezone=TIMEZONE))
    def allow_scale_to_zero() -> None:
        _set_min_containers(0)
