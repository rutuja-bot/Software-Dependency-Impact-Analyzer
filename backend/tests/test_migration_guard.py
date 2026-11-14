import os
import pytest
from unittest.mock import patch

from app.db.guard import validate_db_target, resolve_migration_target, DatabaseTargetError
from app.db.session import get_engine
from app.core.config import settings

APPROVED_STAGING_HOST = "ep-red-resonance-ao0iqllr-pooler.c-2.ap-southeast-1.aws.neon.tech"
APPROVED_PRODUCTION_HOST = "ep-summer-grass-b2c3d4e5-pooler.us-east-2.aws.neon.tech"

def test_missing_or_empty_url():
    with pytest.raises(DatabaseTargetError, match="missing or empty"):
        validate_db_target(None)
    with pytest.raises(DatabaseTargetError, match="missing or empty"):
        validate_db_target("")
    with pytest.raises(DatabaseTargetError, match="missing or empty"):
        validate_db_target("   ")

def test_placeholder_url_rejected():
    with pytest.raises(DatabaseTargetError, match="Placeholder database URL detected"):
        validate_db_target("driver://user:pass@localhost/dbname")
    with pytest.raises(DatabaseTargetError, match="Placeholder database URL detected"):
        validate_db_target("postgresql://user:pass@localhost/dbname")

def test_malformed_url_rejected():
    with pytest.raises(DatabaseTargetError, match="Unsupported database scheme"):
        validate_db_target("mysql://user:pass@remotehost:3306/db")
    with pytest.raises(DatabaseTargetError, match="missing database name"):
        validate_db_target("postgresql://user:pass@remotehost:5432/")

def test_staging_guard_requires_approved_staging_host():
    url = f"postgresql://analyst_user:dummy_pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="APPROVED_STAGING_HOST is not configured"):
        validate_db_target(url, environment="staging", approved_host=None)

def test_staging_guard_rejects_local_database_name():
    url = f"postgresql://analyst_user:dummy_pass@{APPROVED_STAGING_HOST}:5432/dependency_analyzer_dev?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Targeting local development database 'dependency_analyzer_dev' is strictly forbidden"):
        validate_db_target(url, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_staging_guard_rejects_localhost_and_loopback():
    url = "postgresql://postgres:postgres@localhost:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved staging host"):
        validate_db_target(url, environment="staging", approved_host=APPROVED_STAGING_HOST)

    url_ip = f"postgresql://postgres:postgres@127.0.0.1:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved staging host"):
        validate_db_target(url_ip, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_staging_guard_rejects_unapproved_neon_substring_host():
    # Substring contains 'neon', but is not the approved host
    unapproved_urls = [
        "postgresql://user:pass@other-tenant.us-east-2.aws.neon.tech:5432/neondb?sslmode=require",
        "postgresql://user:pass@evil-neon.attacker.com:5432/neondb?sslmode=require",
        "postgresql://user:pass@neon-fake.net:5432/neondb?sslmode=require"
    ]
    for url in unapproved_urls:
        with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved staging host"):
            validate_db_target(url, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_staging_guard_rejects_non_neondb_database_name():
    url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/production_master?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Unauthorized staging database name"):
        validate_db_target(url, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_staging_guard_requires_tls_sslmode():
    no_ssl = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb"
    with pytest.raises(DatabaseTargetError, match="Neon staging requires TLS encryption"):
        validate_db_target(no_ssl, environment="staging", approved_host=APPROVED_STAGING_HOST)

    disabled_ssl = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=disable"
    with pytest.raises(DatabaseTargetError, match="Neon staging requires TLS encryption"):
        validate_db_target(disabled_ssl, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_staging_guard_accepts_valid_neondb_with_tls():
    # Should not throw any exception
    valid_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=require"
    validate_db_target(valid_url, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_development_mode_allows_local_dev_db():
    local_url = "postgresql://postgres:postgres@localhost:5432/dependency_analyzer_dev"
    # Development mode without staging override permits local dev
    validate_db_target(local_url, environment="development", approved_host=None)

def test_production_mode_rejects_local_targets():
    local_url = "postgresql://postgres:postgres@localhost:5432/dependency_analyzer_dev"
    with pytest.raises(DatabaseTargetError, match="cannot be targeted in production"):
        validate_db_target(local_url, environment="production")

def test_invalid_ports_rejected():
    with pytest.raises(DatabaseTargetError, match="invalid port specification|Port could not be cast"):
        validate_db_target(f"postgresql://user:pass@{APPROVED_STAGING_HOST}:abc/neondb?sslmode=require", environment="staging", approved_host=APPROVED_STAGING_HOST)

    with pytest.raises(DatabaseTargetError, match="Port out of range|Invalid database port"):
        validate_db_target(f"postgresql://user:pass@{APPROVED_STAGING_HOST}:99999/neondb?sslmode=require", environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_loopback_subnet_rejected():
    url_subnet = "postgresql://postgres:postgres@127.0.0.5:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved staging host"):
        validate_db_target(url_subnet, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_conflicting_sslmode_params_rejected():
    # If any param is not valid TLS, it must fail closed
    conflicting = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=require&sslmode=disable"
    with pytest.raises(DatabaseTargetError, match="Neon staging requires TLS encryption"):
        validate_db_target(conflicting, environment="staging", approved_host=APPROVED_STAGING_HOST)

def test_approved_host_with_scheme_or_port_normalized():
    # If the user configured the approved host with a port or scheme, it should still match cleanly
    valid_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=require"
    validate_db_target(valid_url, environment="staging", approved_host=f"{APPROVED_STAGING_HOST}:5432")
    validate_db_target(valid_url, environment="staging", approved_host=f"https://{APPROVED_STAGING_HOST}")

def test_case_insensitive_host_matching():
    upper_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST.upper()}:5432/neondb?sslmode=require"
    validate_db_target(upper_url, environment="staging", approved_host=APPROVED_STAGING_HOST.lower())

def test_production_guard_requires_secure_tls():
    # Production without TLS query param must be rejected
    no_ssl = "postgresql://prod_user:secret@ep-prod-instance.neon.tech:5432/neondb"
    with pytest.raises(DatabaseTargetError, match="Production requires secure TLS encryption"):
        validate_db_target(no_ssl, environment="production")

    # Insecure sslmodes must be rejected
    insecure_modes = ["disable", "allow", "prefer"]
    for mode in insecure_modes:
        url = f"postgresql://prod_user:secret@ep-prod-instance.neon.tech:5432/neondb?sslmode={mode}"
        with pytest.raises(DatabaseTargetError, match="Production requires secure TLS encryption"):
            validate_db_target(url, environment="production")

def test_production_guard_accepts_valid_tls_modes():
    valid_modes = ["require", "verify-ca", "verify-full"]
    for mode in valid_modes:
        url = f"postgresql://prod_user:secret@ep-prod-instance.neon.tech:5432/proddb?sslmode={mode}"
        # Should not raise
        validate_db_target(url, environment="production")

def test_production_guard_rejects_conflicting_sslmode():
    conflicting = "postgresql://prod_user:secret@ep-prod-instance.neon.tech:5432/proddb?sslmode=require&sslmode=disable"
    with pytest.raises(DatabaseTargetError, match="Production requires secure TLS encryption"):
        validate_db_target(conflicting, environment="production")

def test_production_guard_rejects_local_db_and_loopback_with_tls():
    # Even if valid TLS is provided, local DB name and loopback must be rejected in production
    local_db_url = "postgresql://prod_user:secret@ep-prod-instance.neon.tech:5432/dependency_analyzer_dev?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="cannot be targeted in production"):
        validate_db_target(local_db_url, environment="production")

    loopback_url = "postgresql://postgres:postgres@127.0.0.1:5432/proddb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="cannot be targeted in production"):
        validate_db_target(loopback_url, environment="production")

def test_migrations_cannot_target_local_dev_db_in_staging_or_production():
    # Staging migration targeting local development db
    staging_local = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/dependency_analyzer_dev?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="strictly forbidden in staging"):
        validate_db_target(staging_local, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=True)

    # Production migration targeting local development db
    prod_local = "postgresql://user:pass@ep-prod-instance.neon.tech:5432/dependency_analyzer_dev?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Production database migrations are strictly prohibited"):
        validate_db_target(prod_local, environment="production", is_migration=True)

    # Migration targeting loopback address in production
    prod_loopback = "postgresql://user:pass@127.0.0.1:5432/proddb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Production database migrations are strictly prohibited"):
        validate_db_target(prod_loopback, environment="production", is_migration=True)

    # Application connections to local db in production
    with pytest.raises(DatabaseTargetError, match="cannot be targeted in production"):
        validate_db_target(prod_local, environment="production", is_migration=False)

def test_sqlite_rejected_in_production_application_connections():
    with pytest.raises(DatabaseTargetError, match="SQLite is strictly prohibited in production application connections"):
        validate_db_target("sqlite:///production.db", environment="production", is_migration=False)

    with pytest.raises(DatabaseTargetError, match="SQLite is strictly prohibited in production application connections"):
        validate_db_target("sqlite:///:memory:", environment="production", is_migration=False)

    with pytest.raises(DatabaseTargetError, match="SQLite is strictly prohibited in production application connections"):
        validate_db_target("sqlite:///production.db", environment="production", is_migration=True)

def test_sqlite_available_for_development_and_tests():
    # Development application connections
    validate_db_target("sqlite:///dev.db", environment="development", is_migration=False)
    validate_db_target("sqlite:///:memory:", environment="development", is_migration=False)

    # Unit tests and test environment
    validate_db_target("sqlite:///:memory:", environment="test", is_migration=False)
    validate_db_target("sqlite:///test.db", environment=None, is_migration=False)

    # Local development migrations with SQLite
    validate_db_target("sqlite:///dev.db", environment="development", is_migration=True)

def test_production_migrations_strictly_blocked():
    valid_prod_url = "postgresql://prod_user:secret@ep-prod-instance.neon.tech:5432/proddb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Production database migrations are strictly prohibited"):
        validate_db_target(valid_prod_url, environment="production", is_migration=True)

def test_staging_migrations_fail_if_authorization_flags_missing():
    valid_staging_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=require"

    # Missing STAGING_MIGRATION flag
    with pytest.raises(DatabaseTargetError, match="STAGING_MIGRATION=true is required to execute migrations against staging"):
        validate_db_target(valid_staging_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=False)

    # Missing APPROVED_STAGING_HOST
    with pytest.raises(DatabaseTargetError, match="APPROVED_STAGING_HOST is not configured"):
        validate_db_target(valid_staging_url, environment="staging", approved_host=None, is_migration=True, staging_migration=True)

    with pytest.raises(DatabaseTargetError, match="APPROVED_STAGING_HOST is not configured"):
        validate_db_target(valid_staging_url, environment="staging", approved_host="   ", is_migration=True, staging_migration=True)

def test_staging_migrations_reject_incorrect_hostname():
    unauthorized_url = "postgresql://user:pass@unauthorized-tenant.neon.tech:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved staging host"):
        validate_db_target(unauthorized_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=True)

def test_staging_migrations_reject_incorrect_database_names_and_insecure_tls():
    # Incorrect database name
    wrong_db_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/otherdb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Unauthorized staging database name"):
        validate_db_target(wrong_db_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=True)

    # Local development database name in staging migration
    local_dev_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/dependency_analyzer?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="strictly forbidden in staging"):
        validate_db_target(local_dev_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=True)

    # Insecure TLS in staging migration
    no_tls_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb"
    with pytest.raises(DatabaseTargetError, match="Neon staging requires TLS encryption"):
        validate_db_target(no_tls_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=True)

    disabled_tls_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=disable"
    with pytest.raises(DatabaseTargetError, match="Neon staging requires TLS encryption"):
        validate_db_target(disabled_tls_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=True)

def test_correctly_authorized_staging_migrations_pass():
    valid_staging_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/neondb?sslmode=require"
    # Parameter explicit
    validate_db_target(valid_staging_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True, staging_migration=True)

    # Environment variable based
    with patch.dict(os.environ, {"STAGING_MIGRATION": "1"}):
        validate_db_target(valid_staging_url, environment="staging", approved_host=APPROVED_STAGING_HOST, is_migration=True)

def test_staging_and_production_reject_both_dev_database_names():
    dev_names = ["dependency_analyzer", "dependency_analyzer_dev"]
    for db in dev_names:
        # Staging
        staging_url = f"postgresql://user:pass@{APPROVED_STAGING_HOST}:5432/{db}?sslmode=require"
        with pytest.raises(DatabaseTargetError, match="strictly forbidden in staging"):
            validate_db_target(staging_url, environment="staging", approved_host=APPROVED_STAGING_HOST)

        # Production
        prod_url = f"postgresql://user:pass@ep-prod-instance.neon.tech:5432/{db}?sslmode=require"
        with pytest.raises(DatabaseTargetError, match="cannot be targeted in production"):
            validate_db_target(prod_url, environment="production")

def test_production_guard_rejects_conflicting_staging_configuration():
    valid_prod_url = "postgresql://user:pass@ep-prod-instance.neon.tech:5432/proddb?sslmode=require"

    # Conflicting APPROVED_STAGING_HOST in production
    with pytest.raises(DatabaseTargetError, match="Configuration conflict: Staging settings.*APPROVED_STAGING_HOST"):
        validate_db_target(valid_prod_url, environment="production", approved_host=APPROVED_STAGING_HOST)

    # Conflicting STAGING_MIGRATION in production
    with patch.dict(os.environ, {"STAGING_MIGRATION": "1"}):
        with pytest.raises(DatabaseTargetError, match="Configuration conflict: Staging settings.*STAGING_MIGRATION"):
            validate_db_target(valid_prod_url, environment="production")

def test_resolve_migration_target_fail_closed_hierarchy():
    # Production is immutable and cannot be reclassified as staging
    assert resolve_migration_target("production") == "production"

    # Production rejects conflicting APPROVED_STAGING_HOST
    with pytest.raises(RuntimeError, match="Configuration conflict detected.*APPROVED_STAGING_HOST"):
        resolve_migration_target("production", approved_host=APPROVED_STAGING_HOST)

    # Production rejects conflicting STAGING_MIGRATION
    with pytest.raises(RuntimeError, match="Configuration conflict detected.*STAGING_MIGRATION"):
        resolve_migration_target("production", staging_migration=True)

    # Staging explicit classification
    assert resolve_migration_target("staging") == "staging"
    assert resolve_migration_target("development", staging_migration=True) == "staging"
    assert resolve_migration_target("development", approved_host=APPROVED_STAGING_HOST) == "staging"

    # Default development
    assert resolve_migration_target("development") == "development"
    assert resolve_migration_target(None) == "development"

def test_authorized_production_migrations_pass():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"

    # Explicit parameters
    validate_db_target(
        valid_prod_url,
        environment="production",
        approved_production_host=APPROVED_PRODUCTION_HOST,
        is_migration=True,
        production_migration=True
    )

    # Via environment variables
    with patch.dict(os.environ, {
        "PRODUCTION_MIGRATION": "true",
        "APPROVED_PRODUCTION_HOST": APPROVED_PRODUCTION_HOST
    }):
        validate_db_target(valid_prod_url, environment="production", is_migration=True)

    # Host normalization (with https scheme and port)
    validate_db_target(
        valid_prod_url,
        environment="production",
        approved_production_host=f"https://{APPROVED_PRODUCTION_HOST}:5432",
        is_migration=True,
        production_migration=True
    )

    # Case insensitive matching
    upper_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST.upper()}:5432/neondb?sslmode=require"
    validate_db_target(
        upper_url,
        environment="production",
        approved_production_host=APPROVED_PRODUCTION_HOST.lower(),
        is_migration=True,
        production_migration=True
    )

def test_production_migrations_fail_if_authorization_flags_missing():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"

    # Missing production_migration flag (blocked by default)
    with pytest.raises(DatabaseTargetError, match="Production database migrations are strictly prohibited by default"):
        validate_db_target(
            valid_prod_url,
            environment="production",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True,
            production_migration=False
        )

    # Missing APPROVED_PRODUCTION_HOST
    with pytest.raises(DatabaseTargetError, match="APPROVED_PRODUCTION_HOST is not configured"):
        validate_db_target(
            valid_prod_url,
            environment="production",
            approved_production_host=None,
            is_migration=True,
            production_migration=True
        )

    with pytest.raises(DatabaseTargetError, match="APPROVED_PRODUCTION_HOST is not configured"):
        validate_db_target(
            valid_prod_url,
            environment="production",
            approved_production_host="   ",
            is_migration=True,
            production_migration=True
        )

def test_production_migrations_reject_incorrect_hostname():
    unauthorized_url = "postgresql://prod_user:secret@unauthorized-instance.neon.tech:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved production host"):
        validate_db_target(
            unauthorized_url,
            environment="production",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True,
            production_migration=True
        )

    evil_url = f"postgresql://prod_user:secret@evil-{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved production host"):
        validate_db_target(
            evil_url,
            environment="production",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True,
            production_migration=True
        )

def test_production_migrations_reject_incorrect_database_names():
    # Non-neondb database
    wrong_db_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/otherdb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Unauthorized production database name"):
        validate_db_target(
            wrong_db_url,
            environment="production",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True,
            production_migration=True
        )

    # Local development database names
    for dev_name in ("dependency_analyzer", "dependency_analyzer_dev"):
        dev_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/{dev_name}?sslmode=require"
        with pytest.raises(DatabaseTargetError, match="strictly forbidden"):
            validate_db_target(
                dev_url,
                environment="production",
                approved_production_host=APPROVED_PRODUCTION_HOST,
                is_migration=True,
                production_migration=True
            )

def test_production_migrations_reject_localhost_and_loopback():
    loopback_urls = [
        "postgresql://postgres:postgres@localhost:5432/neondb?sslmode=require",
        "postgresql://postgres:postgres@127.0.0.1:5432/neondb?sslmode=require",
        "postgresql://postgres:postgres@127.0.0.8:5432/neondb?sslmode=require",
        "postgresql://postgres:postgres@0.0.0.0:5432/neondb?sslmode=require",
    ]
    for url in loopback_urls:
        with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved production host|Local loopback address"):
            validate_db_target(
                url,
                environment="production",
                approved_production_host=APPROVED_PRODUCTION_HOST,
                is_migration=True,
                production_migration=True
            )

def test_production_migrations_require_secure_tls():
    # No TLS query parameter
    no_tls_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb"
    with pytest.raises(DatabaseTargetError, match="Neon production requires TLS encryption"):
        validate_db_target(
            no_tls_url,
            environment="production",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True,
            production_migration=True
        )

    # Insecure modes
    for mode in ("disable", "allow", "prefer"):
        insecure_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode={mode}"
        with pytest.raises(DatabaseTargetError, match="Neon production requires TLS encryption"):
            validate_db_target(
                insecure_url,
                environment="production",
                approved_production_host=APPROVED_PRODUCTION_HOST,
                is_migration=True,
                production_migration=True
            )

    # Conflicting modes
    conflicting_tls_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require&sslmode=disable"
    with pytest.raises(DatabaseTargetError, match="Neon production requires TLS encryption"):
        validate_db_target(
            conflicting_tls_url,
            environment="production",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True,
            production_migration=True
        )

def test_conflicting_staging_and_production_settings_rejected():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"

    # Both STAGING_MIGRATION and PRODUCTION_MIGRATION
    with pytest.raises(DatabaseTargetError, match="Configuration conflict: Staging and production settings cannot be set simultaneously"):
        validate_db_target(
            valid_prod_url,
            environment="production",
            staging_migration=True,
            production_migration=True,
            approved_production_host=APPROVED_PRODUCTION_HOST
        )

    # Both APPROVED_STAGING_HOST and APPROVED_PRODUCTION_HOST
    with pytest.raises(DatabaseTargetError, match="Configuration conflict: Staging and production settings cannot be set simultaneously"):
        validate_db_target(
            valid_prod_url,
            environment="production",
            approved_host=APPROVED_STAGING_HOST,
            approved_production_host=APPROVED_PRODUCTION_HOST,
            production_migration=True
        )

    # Environment variable conflicts
    with patch.dict(os.environ, {
        "STAGING_MIGRATION": "true",
        "PRODUCTION_MIGRATION": "true"
    }):
        with pytest.raises(DatabaseTargetError, match="Configuration conflict: Staging and production settings cannot be set simultaneously"):
            validate_db_target(valid_prod_url, environment="production")

    # In resolve_migration_target
    with pytest.raises(RuntimeError, match="Staging and production settings cannot be set simultaneously"):
        resolve_migration_target("development", staging_migration=True, production_migration=True)

    with pytest.raises(RuntimeError, match="Staging and production settings cannot be set simultaneously"):
        resolve_migration_target(
            "development",
            approved_host=APPROVED_STAGING_HOST,
            approved_production_host=APPROVED_PRODUCTION_HOST
        )

def test_staging_authorization_cannot_authorize_production_migration():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"

    # Using staging authorization in production environment is rejected as conflict
    with pytest.raises(DatabaseTargetError, match="Configuration conflict: Staging settings.*cannot be set in a production environment"):
        validate_db_target(
            valid_prod_url,
            environment="production",
            approved_host=APPROVED_STAGING_HOST,
            staging_migration=True,
            is_migration=True
        )

    # Attempting to target production host under staging environment fails hostname check
    with pytest.raises(DatabaseTargetError, match="Target host must exactly match the approved staging host"):
        validate_db_target(
            valid_prod_url,
            environment="staging",
            approved_host=APPROVED_STAGING_HOST,
            staging_migration=True,
            is_migration=True
        )

    # Production settings in staging environment are rejected
    with pytest.raises(DatabaseTargetError, match="Configuration conflict: Production settings.*cannot be set in a staging environment"):
        validate_db_target(
            valid_prod_url,
            environment="staging",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            production_migration=True,
            is_migration=True
        )

def test_dev_env_production_migration_missing_approved_host_fails():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="APPROVED_PRODUCTION_HOST is not configured"):
        validate_db_target(
            valid_prod_url,
            environment="development",
            approved_production_host=None,
            is_migration=True,
            production_migration=True
        )
    with pytest.raises(DatabaseTargetError, match="APPROVED_PRODUCTION_HOST is not configured"):
        validate_db_target(
            valid_prod_url,
            environment="development",
            approved_production_host="   ",
            is_migration=True,
            production_migration=True
        )

def test_dev_env_with_approved_prod_host_missing_production_migration_fails():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="Production database migrations are strictly prohibited by default"):
        validate_db_target(
            valid_prod_url,
            environment="development",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True,
            production_migration=False
        )
    with pytest.raises(DatabaseTargetError, match="Production database migrations are strictly prohibited by default"):
        validate_db_target(
            valid_prod_url,
            environment="development",
            approved_production_host=APPROVED_PRODUCTION_HOST,
            is_migration=True
        )

def test_explicitly_authorized_production_migration_passes_in_both_envs():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"
    # Authorized in production environment
    validate_db_target(
        valid_prod_url,
        environment="production",
        approved_production_host=APPROVED_PRODUCTION_HOST,
        is_migration=True,
        production_migration=True
    )
    # Authorized in development environment
    validate_db_target(
        valid_prod_url,
        environment="development",
        approved_production_host=APPROVED_PRODUCTION_HOST,
        is_migration=True,
        production_migration=True
    )

def test_normal_production_application_connection_without_migration_flags():
    valid_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb?sslmode=require"
    # Connects safely without requiring migration flags or raising DatabaseTargetError
    validate_db_target(
        valid_prod_url,
        environment="production",
        is_migration=False
    )
    # Also with custom production dbname
    custom_prod_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/custom_prod_db?sslmode=require"
    validate_db_target(
        custom_prod_url,
        environment="production",
        is_migration=False
    )
    # But invalid TLS, local dev db, or loopback in production app connection still fail
    no_tls_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/neondb"
    with pytest.raises(DatabaseTargetError, match="Production requires secure TLS encryption"):
        validate_db_target(no_tls_url, environment="production", is_migration=False)

    local_db_url = f"postgresql://prod_user:secret@{APPROVED_PRODUCTION_HOST}:5432/dependency_analyzer_dev?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="cannot be targeted in production"):
        validate_db_target(local_db_url, environment="production", is_migration=False)

    loopback_url = "postgresql://user:pass@127.0.0.1:5432/neondb?sslmode=require"
    with pytest.raises(DatabaseTargetError, match="cannot be targeted in production"):
        validate_db_target(loopback_url, environment="production", is_migration=False)

def test_resolve_migration_target_with_production_migration():
    # Development with production authorization resolves to production
    assert resolve_migration_target("development", production_migration=True) == "production"
    assert resolve_migration_target("development", approved_production_host=APPROVED_PRODUCTION_HOST) == "production"
    assert resolve_migration_target(None, production_migration=True, approved_production_host=APPROVED_PRODUCTION_HOST) == "production"

    # Production without conflicts remains production
    assert resolve_migration_target("production", production_migration=True, approved_production_host=APPROVED_PRODUCTION_HOST) == "production"

    # Rejection of production settings in staging
    with pytest.raises(RuntimeError, match="Production settings.*must not be set in a staging environment"):
        resolve_migration_target("staging", production_migration=True)

    with pytest.raises(RuntimeError, match="Production settings.*must not be set in a staging environment"):
        resolve_migration_target("staging", approved_production_host=APPROVED_PRODUCTION_HOST)

def test_session_get_engine_fails_closed_when_database_url_missing():
    # In production: must raise RuntimeError when DATABASE_URL is missing or empty
    with patch.object(settings, "ENVIRONMENT", "production"), patch.object(settings, "DATABASE_URL", None):
        with pytest.raises(RuntimeError, match="Production environment requires a configured DATABASE_URL"):
            get_engine(db_url=None)

        with pytest.raises(RuntimeError, match="Production environment requires a configured DATABASE_URL"):
            get_engine(db_url="")

    # In staging: must raise RuntimeError when DATABASE_URL is missing or empty
    with patch.object(settings, "ENVIRONMENT", "staging"), patch.object(settings, "DATABASE_URL", None):
        with pytest.raises(RuntimeError, match="Staging environment requires a configured DATABASE_URL"):
            get_engine(db_url=None)

        with pytest.raises(RuntimeError, match="Staging environment requires a configured DATABASE_URL"):
            get_engine(db_url="")

    # In development: returns None safely (permitting local in-memory fallback)
    with patch.object(settings, "ENVIRONMENT", "development"), patch.object(settings, "DATABASE_URL", None):
        engine = get_engine(db_url=None)
        assert engine is None
