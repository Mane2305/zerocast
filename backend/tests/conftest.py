from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db import init_db, make_engine
from app.engine import YugEngine
from app.engine.testing import make_tiny_pipeline
from app.main import create_app
from app.repository import Repository

TINY_SAMPLES = 20


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        db_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        storage_dir=tmp_path / "files",
        load_model=False,
        num_samples=TINY_SAMPLES,
    )


@pytest.fixture
def client(settings: Settings):
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def tiny_engine():
    engine = YugEngine(make_tiny_pipeline, num_samples=TINY_SAMPLES, model_name="tiny-yug")
    engine.wait_until_loaded()
    yield engine
    engine.shutdown()


@pytest.fixture
def model_client(settings: Settings, tiny_engine: YugEngine):
    with TestClient(create_app(settings, engine=tiny_engine)) as test_client:
        yield test_client


@pytest.fixture
def session_factory(settings: Settings) -> sessionmaker:
    engine = make_engine(settings.db_url)
    yield init_db(engine)
    engine.dispose()


@pytest.fixture
def repository(session_factory: sessionmaker) -> Repository:
    return Repository(session_factory)
