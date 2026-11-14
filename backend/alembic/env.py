import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.config import settings
from app.db.session import Base
from app.db.guard import validate_db_target, resolve_migration_target
import app.db.models  # Load all models into Base.metadata

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target metadata for 'autogenerate' support
target_metadata = Base.metadata

def get_url():
    # Strict resolution: Never fallback to alembic.ini placeholder
    url = settings.DATABASE_URL
    if not url or not url.strip():
        raise RuntimeError(
            "Alembic migration stopped: DATABASE_URL is not configured. "
            "Falling back to the alembic.ini placeholder is strictly disabled."
        )

    # Validate against migration safety guard
    approved_host = os.getenv("APPROVED_STAGING_HOST")
    staging_migration = os.getenv("STAGING_MIGRATION", "").lower() in ("1", "true", "yes")
    env_name = getattr(settings, "ENVIRONMENT", "development")

    target_env = resolve_migration_target(
        settings_env=env_name,
        approved_host=approved_host,
        staging_migration=staging_migration
    )

    if target_env == "production":
        raise RuntimeError(
            "Alembic migration stopped: Production database migrations are strictly prohibited. "
            "Under the current deployment policy, migrations may only be executed against an authorized staging database."
        )

    validate_db_target(
        url=url,
        environment=target_env,
        approved_host=approved_host,
        is_migration=True,
        staging_migration=staging_migration
    )
    return url

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
