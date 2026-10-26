"""Alembic environment. Uses the connection passed by app.db.migrate, else ZC_DB_URL."""

from alembic import context

from app.config import get_settings
from app.db import Base, make_engine

target_metadata = Base.metadata


def run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get("connection")
if connection is not None:
    run(connection)
else:
    engine = make_engine(get_settings().db_url)
    with engine.connect() as conn:
        run(conn)
    engine.dispose()
