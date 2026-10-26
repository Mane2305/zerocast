"""SQLAlchemy engine, session factory and table definitions. Schema changes go through
Alembic migrations (backend/migrations); `init_db` applies them on startup."""

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    inspect,
)
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class DatasetRow(Base):
    __tablename__ = "datasets"

    dataset_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    storage_key: Mapped[str] = mapped_column(String(512))
    holiday_country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # Frequency, series summaries and health report; shape owned by the datasets service.
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class JobRow(Base):
    __tablename__ = "jobs"

    job_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Hash of (job_type, params): an identical request reuses the job instead of rerunning it.
    cache_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)


class SeriesForecastRow(Base):
    """One item's forecast for (dataset, item, horizon, seed). Datasets never change after
    upload and forecasts are seeded, so a stored result is always valid."""

    __tablename__ = "series_forecasts"

    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(64), index=True)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AnnotationRow(Base):
    __tablename__ = "annotations"
    __table_args__ = (UniqueConstraint("dataset_id", "series_id", "date"),)

    annotation_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(64), index=True)
    series_id: Mapped[str] = mapped_column(String(255))
    date: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


def normalize_url(db_url: str) -> URL:
    """Neon/Heroku-style `postgres://` or `postgresql://` URLs use the psycopg 3 driver."""
    url = make_url(db_url.replace("postgres://", "postgresql://", 1))
    if url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    return url


def make_engine(db_url: str) -> Engine:
    url = normalize_url(db_url)
    connect_args: dict = {}
    options: dict = {}
    if url.get_backend_name() == "sqlite":
        # FastAPI serves requests from a thread pool; the job worker is another thread.
        connect_args["check_same_thread"] = False
        if url.database and url.database != ":memory:":
            Path(url.database).parent.mkdir(parents=True, exist_ok=True)
    else:
        # Neon closes idle connections and its pooler (PgBouncer, transaction mode) does not
        # support server-side prepared statements.
        options["pool_pre_ping"] = True
        if url.drivername == "postgresql+psycopg":
            connect_args["prepare_threshold"] = None
    return create_engine(url, connect_args=connect_args, **options)


def migrate(engine: Engine) -> None:
    """Upgrade the schema to the latest Alembic revision. A database created before
    migrations existed (tables but no alembic_version) is stamped as the initial revision."""
    from alembic import command
    from alembic.config import Config

    config = Config()
    config.set_main_option("script_location", MIGRATIONS.as_posix())
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        tables = set(inspect(connection).get_table_names())
        if "datasets" in tables and "alembic_version" not in tables:
            command.stamp(config, "0001")
        command.upgrade(config, "head")


def init_db(engine: Engine) -> sessionmaker:
    migrate(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
