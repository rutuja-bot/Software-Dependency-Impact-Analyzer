import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Index,
    UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.db.session import Base

# Cross-dialect JSON column type: use JSON (which resolves to JSONB on PG and JSON on SQLite/others)
JsonType = JSON().with_variant(JSONB, "postgresql")

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def generate_uuid() -> str:
    return str(uuid.uuid4())


class Project(Base):
    """
    Represents an inspected software repository or service.
    """
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, index=True)
    ecosystem = Column(String(64), nullable=False, default="npm", index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships with cascade delete
    analyses = relationship("AnalysisRun", back_populates="project", cascade="all, delete-orphan", order_by="desc(AnalysisRun.created_at)")
    simulations = relationship("SimulationRun", back_populates="project", cascade="all, delete-orphan", order_by="desc(SimulationRun.created_at)")

    __table_args__ = (
        UniqueConstraint("name", "ecosystem", name="uq_project_name_ecosystem"),
        Index("ix_project_name_ecosystem", "name", "ecosystem"),
    )


class Package(Base):
    """
    Represents a unique package identity in a specific ecosystem.
    Prevents duplicate package identity records.
    """
    __tablename__ = "packages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, index=True)
    ecosystem = Column(String(64), nullable=False, default="npm", index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("name", "ecosystem", name="uq_package_name_ecosystem"),
        Index("ix_package_name_ecosystem", "name", "ecosystem"),
    )


class AnalysisRun(Base):
    """
    Represents a full manifest analysis run for a project.
    Stores reproducibility metadata, graph summary metrics, and links to snapshots and findings.
    """
    __tablename__ = "analysis_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    project_version = Column(String(64), nullable=True)
    status = Column(String(32), nullable=False, default="completed", index=True)  # completed, failed, partial
    
    # Graph statistical summary
    total_packages = Column(Integer, nullable=False, default=0)
    direct_dependencies_count = Column(Integer, nullable=False, default=0)
    transitive_dependencies_count = Column(Integer, nullable=False, default=0)
    total_dependency_edges = Column(Integer, nullable=False, default=0)
    has_cycles = Column(Boolean, nullable=False, default=False)
    cycle_count = Column(Integer, nullable=False, default=0)
    is_dag = Column(Boolean, nullable=False, default=True)

    # Topological order and cycle details (structured JSON)
    topological_order = Column(JsonType, nullable=True)
    cycle_details = Column(JsonType, nullable=True)

    # Manifest input metadata (for historical reproducibility)
    manifest_metadata = Column(JsonType, nullable=True)
    error_summary = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    # Relationships
    project = relationship("Project", back_populates="analyses")
    graph_snapshot = relationship("GraphSnapshot", back_populates="analysis", uselist=False, cascade="all, delete-orphan")
    vulnerabilities = relationship("VulnerabilityFinding", back_populates="analysis", cascade="all, delete-orphan")
    freshness_results = relationship("FreshnessRecord", back_populates="analysis", cascade="all, delete-orphan")
    simulations = relationship("SimulationRun", back_populates="baseline_analysis", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_analysis_project_created", "project_id", "created_at"),
    )


class GraphSnapshot(Base):
    """
    Persists reproducible directed graph snapshots (nodes, edges, hop depths).
    Enforces convention: A -> B means A depends on B.
    """
    __tablename__ = "graph_snapshots"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    analysis_id = Column(String(36), ForeignKey("analysis_runs.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    # Node array: [{id, name, version, is_root, dep_type, depth}, ...]
    nodes = Column(JsonType, nullable=False)
    # Edge array: [{source, target, version_constraint, relation}, ...]
    edges = Column(JsonType, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    analysis = relationship("AnalysisRun", back_populates="graph_snapshot")


class VulnerabilityFinding(Base):
    """
    Stores individual vulnerability findings identified from the OSV database for an analysis.
    """
    __tablename__ = "vulnerability_findings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    analysis_id = Column(String(36), ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    package_name = Column(String(255), nullable=False, index=True)
    package_version = Column(String(64), nullable=True)
    
    # OSV finding attributes
    vuln_id = Column(String(128), nullable=False, index=True)  # e.g., GHSA-..., CVE-...
    summary = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    severity = Column(String(128), nullable=True)
    fixed_versions = Column(JsonType, nullable=True)  # Array of fixed version strings
    references = Column(JsonType, nullable=True)      # Array of {type, url}
    
    # Finding status: vulnerable, clean, error, unresolved
    scan_status = Column(String(32), nullable=False, default="vulnerable")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    analysis = relationship("AnalysisRun", back_populates="vulnerabilities")

    __table_args__ = (
        Index("ix_vuln_analysis_package", "analysis_id", "package_name"),
        Index("ix_vuln_identifier", "vuln_id"),
    )


class FreshnessRecord(Base):
    """
    Stores package freshness evaluation and project-level LibYear scores for an analysis.
    """
    __tablename__ = "freshness_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    analysis_id = Column(String(36), ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    package_name = Column(String(255), nullable=False, index=True)
    installed_version = Column(String(64), nullable=True)
    
    release_date = Column(DateTime(timezone=True), nullable=True)
    libyear = Column(Float, nullable=True)
    status = Column(String(32), nullable=False, default="scored")  # scored, unscored
    reason_unscored = Column(Text, nullable=True)

    # Project-level aggregations recorded at time of analysis
    project_total_libyear = Column(Float, nullable=True)
    project_average_libyear = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    analysis = relationship("AnalysisRun", back_populates="freshness_results")

    __table_args__ = (
        Index("ix_freshness_analysis_package", "analysis_id", "package_name"),
    )


class SimulationRun(Base):
    """
    Stores What-If dependency change simulation executions.
    Completely isolated from baseline snapshots; never mutates baseline analyses.
    """
    __tablename__ = "simulation_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    baseline_analysis_id = Column(String(36), ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False, index=True)

    operation = Column(String(32), nullable=False)  # add, remove, upgrade
    target_package = Column(String(255), nullable=False)
    source_package = Column(String(255), nullable=True)
    version = Column(String(64), nullable=True)

    status = Column(String(32), nullable=False, default="completed")  # completed, rejected, failed
    message = Column(Text, nullable=True)

    # Simulation delta diff and impact metrics (JSON)
    diff = Column(JsonType, nullable=False)
    cycle_diff = Column(JsonType, nullable=False)
    impact_diff = Column(JsonType, nullable=False)
    simulated_stats = Column(JsonType, nullable=False)
    warnings = Column(JsonType, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    project = relationship("Project", back_populates="simulations")
    baseline_analysis = relationship("AnalysisRun", back_populates="simulations")

    __table_args__ = (
        Index("ix_simulation_baseline", "baseline_analysis_id"),
        Index("ix_simulation_project_created", "project_id", "created_at"),
    )
