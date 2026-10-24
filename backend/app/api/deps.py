from fastapi import Request

from app.config import Settings
from app.engine import YugEngine
from app.errors import ApiError
from app.repository import Repository
from app.storage import Storage


def get_repository(request: Request) -> Repository:
    return request.app.state.repository


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_engine(request: Request) -> YugEngine:
    """The loaded model engine, or 503 while it is loading / disabled / failed."""
    engine = request.app.state.engine
    if engine is None:
        raise ApiError(503, "model_disabled", "Model loading is disabled (ZC_LOAD_MODEL=false)")
    if engine.load_error is not None:
        raise ApiError(503, "model_failed", f"Model failed to load: {engine.load_error}")
    if not engine.loaded:
        raise ApiError(503, "model_loading", "Model is still loading; try again shortly")
    return engine
