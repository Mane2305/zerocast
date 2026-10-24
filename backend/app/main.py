"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app import __version__
from app.api import datasets, jobs, model
from app.config import Settings, get_settings
from app.db import init_db, make_engine
from app.engine import YugEngine
from app.engine.yug_engine import load_pipeline
from app.errors import install_error_handlers
from app.jobs import InProcessJobRunner
from app.repository import Repository
from app.schemas import Health
from app.services.factor_job import make_factor_handler
from app.services.forecast import make_forecast_handler
from app.services.review_job import make_review_handler
from app.storage import make_storage


def build_engine(settings: Settings) -> YugEngine | None:
    if not settings.load_model:
        return None
    return YugEngine(
        lambda: load_pipeline(settings.model_id, settings.device, settings.model_revision),
        num_samples=settings.num_samples,
        model_name=settings.model_id,
        revision=settings.model_revision,
    )


def build_job_runner(app: FastAPI) -> InProcessJobRunner:
    state = app.state

    def engine() -> YugEngine | None:
        return state.engine

    return InProcessJobRunner(
        state.repository,
        {
            "forecast": make_forecast_handler(state.repository, state.storage, engine),
            "review": make_review_handler(state.repository, state.storage, engine),
            "factors": make_factor_handler(state.repository, state.storage, engine),
        },
    )


def create_app(settings: Settings | None = None, engine: YugEngine | None = None) -> FastAPI:
    """``engine`` overrides the one built from settings (tests pass a tiny model)."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db_engine = make_engine(settings.db_url)
        app.state.settings = settings
        app.state.repository = Repository(init_db(db_engine))
        app.state.storage = make_storage(settings)
        # The model loads on the engine's worker thread; the API is up meanwhile.
        app.state.engine = engine if engine is not None else build_engine(settings)
        app.state.jobs = build_job_runner(app)
        yield
        app.state.jobs.shutdown()
        if app.state.engine is not None and engine is None:
            app.state.engine.shutdown()
        db_engine.dispose()

    app = FastAPI(title="ZeroCast API", version=__version__, lifespan=lifespan)
    install_error_handlers(app)
    app.include_router(datasets.router)
    app.include_router(model.router)
    app.include_router(jobs.router)

    @app.get("/health", response_model=Health, response_model_exclude_none=True)
    def health(request: Request) -> Health:
        yug = request.app.state.engine
        loaded = yug is not None and yug.loaded
        return Health(
            status="ok" if loaded else "degraded",
            model_loaded=loaded,
            device=request.app.state.settings.device,
            version=__version__,
        )

    return app


app = create_app()
