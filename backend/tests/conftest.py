from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db import init_db, make_engine
from app.main import create_app
from app.repository import Repository


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        db_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        storage_dir=tmp_path / "files",
    )


@pytest.fixture
def client(settings: Settings):
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def session_factory(settings: Settings) -> sessionmaker:
    engine = make_engine(settings.db_url)
    yield init_db(engine)
    engine.dispose()


@pytest.fixture
def repository(session_factory: sessionmaker) -> Repository:
    return Repository(session_factory)
