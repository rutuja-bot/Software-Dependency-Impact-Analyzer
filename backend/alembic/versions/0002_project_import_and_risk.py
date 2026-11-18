"""project_import_and_risk

Revision ID: 0002_project_import_and_risk
Revises: 0001_initial_schema
Create Date: 2026-11-18 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0002_project_import_and_risk'
down_revision: Union[str, None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

JsonType = sa.JSON().with_variant(postgresql.JSONB(), 'postgresql')

def upgrade() -> None:
    # 1. Projects metadata columns
    op.add_column('projects', sa.Column('import_source', sa.String(length=32), nullable=True, server_default='manifest_upload'))
    op.add_column('projects', sa.Column('repository_url', sa.String(length=512), nullable=True))
    op.add_column('projects', sa.Column('default_branch', sa.String(length=128), nullable=True))

    # 2. Analysis runs import metadata and risk columns
    op.add_column('analysis_runs', sa.Column('import_source', sa.String(length=32), nullable=True, server_default='manifest_upload'))
    op.add_column('analysis_runs', sa.Column('repository_url', sa.String(length=512), nullable=True))
    op.add_column('analysis_runs', sa.Column('branch_name', sa.String(length=128), nullable=True))
    op.add_column('analysis_runs', sa.Column('commit_sha', sa.String(length=64), nullable=True))
    op.add_column('analysis_runs', sa.Column('risk_score', sa.Float(), nullable=True))
    op.add_column('analysis_runs', sa.Column('risk_category', sa.String(length=32), nullable=True))
    op.add_column('analysis_runs', sa.Column('risk_factors', JsonType, nullable=True))

def downgrade() -> None:
    op.drop_column('analysis_runs', 'risk_factors')
    op.drop_column('analysis_runs', 'risk_category')
    op.drop_column('analysis_runs', 'risk_score')
    op.drop_column('analysis_runs', 'commit_sha')
    op.drop_column('analysis_runs', 'branch_name')
    op.drop_column('analysis_runs', 'repository_url')
    op.drop_column('analysis_runs', 'import_source')

    op.drop_column('projects', 'default_branch')
    op.drop_column('projects', 'repository_url')
    op.drop_column('projects', 'import_source')
