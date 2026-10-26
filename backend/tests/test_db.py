from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.orm import sessionmaker

from app.db import Base, init_db, make_engine, normalize_url
from app.repository import DatasetRecord, Repository


def test_migrations_match_the_models(tmp_path):
    engine = make_engine(f"sqlite:///{(tmp_path / 'm.db').as_posix()}")
    init_db(engine)

    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)

    assert diff == []
    engine.dispose()


def test_migrating_twice_is_a_no_op(tmp_path):
    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    for _ in range(2):
        engine = make_engine(url)
        init_db(engine)
        engine.dispose()


def test_database_created_before_migrations_is_stamped_and_kept(tmp_path):
    engine = make_engine(f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    Base.metadata.create_all(engine)  # how B1-B13 created tables
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    old = Repository(sessions).add_dataset(DatasetRecord(name="old", storage_key="k"))

    repository = Repository(init_db(engine))

    assert "alembic_version" in inspect(engine).get_table_names()
    assert repository.get_dataset(old.dataset_id).name == "old"
    engine.dispose()


def test_postgres_urls_use_psycopg3():
    neon = "postgresql://user:pw@ep-x-pooler.eu-central-1.aws.neon.tech/zerocast?sslmode=require"
    url = normalize_url(neon)
    assert url.drivername == "postgresql+psycopg"
    assert url.query["sslmode"] == "require" and url.host.endswith("neon.tech")
    assert normalize_url("postgres://u:p@h/db").drivername == "postgresql+psycopg"
    assert normalize_url("sqlite:///x.db").drivername == "sqlite"


def test_postgres_engine_options():
    engine = make_engine("postgresql://u:p@localhost:5432/db")
    assert engine.pool._pre_ping is True
    assert engine.dialect.driver == "psycopg"
    engine.dispose()
