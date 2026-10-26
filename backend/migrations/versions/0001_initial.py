"""Initial tables: datasets, jobs, annotations.

Revision ID: 0001
Revises:
Create Date: 2026-10-27
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "datasets",
        sa.Column("dataset_id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("holiday_country", sa.String(8), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=False),
    )
    op.create_table(
        "jobs",
        sa.Column("job_id", sa.String(64), primary_key=True),
        sa.Column("job_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "annotations",
        sa.Column("annotation_id", sa.String(64), primary_key=True),
        sa.Column("dataset_id", sa.String(64), nullable=False),
        sa.Column("series_id", sa.String(255), nullable=False),
        sa.Column("date", sa.String(32), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("dataset_id", "series_id", "date"),
    )
    op.create_index("ix_annotations_dataset_id", "annotations", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_annotations_dataset_id", table_name="annotations")
    op.drop_table("annotations")
    op.drop_table("jobs")
    op.drop_table("datasets")
