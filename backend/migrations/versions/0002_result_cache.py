"""Result cache: jobs.cache_key and the series_forecasts table.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-27
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("jobs") as batch:
        batch.add_column(sa.Column("cache_key", sa.String(64), nullable=True))
        batch.create_index("ix_jobs_cache_key", ["cache_key"])
    op.create_table(
        "series_forecasts",
        sa.Column("cache_key", sa.String(64), primary_key=True),
        sa.Column("dataset_id", sa.String(64), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_series_forecasts_dataset_id", "series_forecasts", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_series_forecasts_dataset_id", table_name="series_forecasts")
    op.drop_table("series_forecasts")
    with op.batch_alter_table("jobs") as batch:
        batch.drop_index("ix_jobs_cache_key")
        batch.drop_column("cache_key")
