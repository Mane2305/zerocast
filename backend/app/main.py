"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app import __version__
from app.config import Settings, get_settings
from app.db import init_db, make_engine
from app.repository import Repository
from app.schemas import Health
from app.storage import make_storage


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = make_engine(settings.db_url)
        app.state.settings = settings
        app.state.repository = Repository(init_db(engine))
        app.state.storage = make_storage(settings)
        app.state.model_loaded = False  # Set by the Yug engine (task B2).
        yield
        engine.dispose()

    app = FastAPI(title="ZeroCast API", version=__version__, lifespan=lifespan)

    @app.get("/health", response_model=Health, response_model_exclude_none=True)
    def health(request: Request) -> Health:
        return Health(
            status="ok",
            model_loaded=request.app.state.model_loaded,
            device=request.app.state.settings.device,
            version=__version__,
        )

    return app


app = create_app()
