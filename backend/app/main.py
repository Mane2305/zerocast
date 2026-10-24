"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app import __version__
from app.api import datasets, model
from app.config import Settings, get_settings
from app.db import init_db, make_engine
from app.engine import YugEngine
from app.engine.yug_engine import load_pipeline
from app.errors import install_error_handlers
from app.repository import Repository
from app.schemas import Health
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
        yield
        if app.state.engine is not None and engine is None:
            app.state.engine.shutdown()
        db_engine.dispose()

    app = FastAPI(title="ZeroCast API", version=__version__, lifespan=lifespan)
    install_error_handlers(app)
    app.include_router(datasets.router)
    app.include_router(model.router)

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
