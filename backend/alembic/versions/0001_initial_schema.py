"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Projects Table
    op.create_table(
        'projects',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('ecosystem', sa.String(length=64), nullable=False, server_default='npm'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', 'ecosystem', name='uq_project_name_ecosystem')
    )
    op.create_index('ix_projects_name', 'projects', ['name'])
    op.create_index('ix_projects_ecosystem', 'projects', ['ecosystem'])
    op.create_index('ix_project_name_ecosystem', 'projects', ['name', 'ecosystem'])

    # 2. Packages Table
    op.create_table(
        'packages',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('ecosystem', sa.String(length=64), nullable=False, server_default='npm'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', 'ecosystem', name='uq_package_name_ecosystem')
    )
    op.create_index('ix_packages_name', 'packages', ['name'])
    op.create_index('ix_packages_ecosystem', 'packages', ['ecosystem'])
    op.create_index('ix_package_name_ecosystem', 'packages', ['name', 'ecosystem'])

    # 3. Analysis Runs Table
    op.create_table(
        'analysis_runs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('project_version', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='completed'),
        sa.Column('total_packages', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('direct_dependencies_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('transitive_dependencies_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_dependency_edges', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('has_cycles', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('cycle_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_dag', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('topological_order', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=True),
        sa.Column('cycle_details', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=True),
        sa.Column('manifest_metadata', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=True),
        sa.Column('error_summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_analysis_runs_project_id', 'analysis_runs', ['project_id'])
    op.create_index('ix_analysis_runs_status', 'analysis_runs', ['status'])
    op.create_index('ix_analysis_runs_created_at', 'analysis_runs', ['created_at'])
    op.create_index('ix_analysis_project_created', 'analysis_runs', ['project_id', 'created_at'])

    # 4. Graph Snapshots Table
    op.create_table(
        'graph_snapshots',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('analysis_id', sa.String(length=36), nullable=False),
        sa.Column('nodes', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False),
        sa.Column('edges', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['analysis_id'], ['analysis_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('analysis_id')
    )
    op.create_index('ix_graph_snapshots_analysis_id', 'graph_snapshots', ['analysis_id'])

    # 5. Vulnerability Findings Table
    op.create_table(
        'vulnerability_findings',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('analysis_id', sa.String(length=36), nullable=False),
        sa.Column('package_name', sa.String(length=255), nullable=False),
        sa.Column('package_version', sa.String(length=64), nullable=True),
        sa.Column('vuln_id', sa.String(length=128), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('severity', sa.String(length=128), nullable=True),
        sa.Column('fixed_versions', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=True),
        sa.Column('references', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=True),
        sa.Column('scan_status', sa.String(length=32), nullable=False, server_default='vulnerable'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['analysis_id'], ['analysis_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_vulnerability_findings_analysis_id', 'vulnerability_findings', ['analysis_id'])
    op.create_index('ix_vulnerability_findings_package_name', 'vulnerability_findings', ['package_name'])
    op.create_index('ix_vuln_analysis_package', 'vulnerability_findings', ['analysis_id', 'package_name'])
    op.create_index('ix_vuln_identifier', 'vulnerability_findings', ['vuln_id'])

    # 6. Freshness Records Table
    op.create_table(
        'freshness_records',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('analysis_id', sa.String(length=36), nullable=False),
        sa.Column('package_name', sa.String(length=255), nullable=False),
        sa.Column('installed_version', sa.String(length=64), nullable=True),
        sa.Column('release_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('libyear', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='scored'),
        sa.Column('reason_unscored', sa.Text(), nullable=True),
        sa.Column('project_total_libyear', sa.Float(), nullable=True),
        sa.Column('project_average_libyear', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['analysis_id'], ['analysis_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_freshness_records_analysis_id', 'freshness_records', ['analysis_id'])
    op.create_index('ix_freshness_records_package_name', 'freshness_records', ['package_name'])
    op.create_index('ix_freshness_analysis_package', 'freshness_records', ['analysis_id', 'package_name'])

    # 7. Simulation Runs Table
    op.create_table(
        'simulation_runs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('baseline_analysis_id', sa.String(length=36), nullable=False),
        sa.Column('operation', sa.String(length=32), nullable=False),
        sa.Column('target_package', sa.String(length=255), nullable=False),
        sa.Column('source_package', sa.String(length=255), nullable=True),
        sa.Column('version', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='completed'),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('diff', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False),
        sa.Column('cycle_diff', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False),
        sa.Column('impact_diff', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False),
        sa.Column('simulated_stats', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False),
        sa.Column('warnings', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['baseline_analysis_id'], ['analysis_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_simulation_runs_project_id', 'simulation_runs', ['project_id'])
    op.create_index('ix_simulation_runs_baseline_analysis_id', 'simulation_runs', ['baseline_analysis_id'])
    op.create_index('ix_simulation_runs_created_at', 'simulation_runs', ['created_at'])
    op.create_index('ix_simulation_baseline', 'simulation_runs', ['baseline_analysis_id'])
    op.create_index('ix_simulation_project_created', 'simulation_runs', ['project_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('simulation_runs')
    op.drop_table('freshness_records')
    op.drop_table('vulnerability_findings')
    op.drop_table('graph_snapshots')
    op.drop_table('analysis_runs')
    op.drop_table('packages')
    op.drop_table('projects')
