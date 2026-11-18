import os
import re
from urllib.parse import urlparse, parse_qs
from typing import Optional, Any

class DatabaseTargetError(ValueError):
    """Raised when a database URL violates deployment targeting safety rules."""
    pass

LOCAL_DEV_DB_NAMES = ("dependency_analyzer_dev", "dependency_analyzer")

# Authorized production database names:
# Supports Neon default ('neondb') as well as explicit Render PostgreSQL production database names
# ('dependency_analyzer_prod', 'dependency_analyzer_production', 'dependency_analyzer_db').
AUTHORIZED_PRODUCTION_DB_NAMES = (
    "neondb",
    "dependency_analyzer_prod",
    "dependency_analyzer_production",
    "dependency_analyzer_db",
)

PLACEHOLDER_SUBSTRINGS = (
    "driver://",
    "user:pass@localhost",
    "localhost/dbname",
    "driver://user:pass@localhost/dbname"
)

# Validation pattern for Render internal PostgreSQL private network hosts:
# Authoritative Render documentation (https://render.com/docs/databases, Blueprint spec)
# and Render PostgreSQL connection strings identify internal database instances using
# the service resource format: dpg-<service-id>-a where <service-id> is alphanumeric
# (typically 8 to 32 characters) with the primary instance node suffix '-a'.
# Arbitrary suffixes (e.g. 'dpg-c12345678-evil') and unverified DNS suffixes are strictly rejected.
RENDER_INTERNAL_HOST_REGEX = re.compile(
    r"^dpg-[a-z0-9]{8,32}-a$",
    re.IGNORECASE
)

def parse_bool_setting(val: Any) -> Optional[bool]:
    """
    Parses boolean or string representation of a boolean.
    Returns:
        - True for True, 1, 1.0, 'true', '1', 'yes', 't', 'y', 'on'
        - False for False, 0, 0.0, 'false', '0', 'no', 'f', 'n', 'off', '',
          other numeric values (e.g. 2, -1, 0.5), unsupported strings,
          and unsupported object types.
        - None for None (unset).
    """
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        if val == 1:
            return True
        if val == 0:
            return False
        return False
    if isinstance(val, str):
        v = val.strip().lower()
        if v in ("true", "1", "yes", "t", "y", "on"):
            return True
        if v in ("false", "0", "no", "f", "n", "off", ""):
            return False
        return False
    return False

def resolve_bool_setting(arg_val: Any, env_var_name: str) -> bool:
    """
    Resolves a boolean setting from an explicit argument or environment variable.
    Explicit arguments (including False, 'false', '0', 'no', '') take strict precedence
    and cannot be overridden by environment variables set to true.
    Environment fallback only occurs when arg_val is unset (None).
    """
    parsed_arg = parse_bool_setting(arg_val)
    if parsed_arg is not None:
        return parsed_arg
    raw_env = os.getenv(env_var_name)
    parsed_env = parse_bool_setting(raw_env)
    return bool(parsed_env)

def is_render_internal_host(hostname: str) -> bool:
    """
    Validates whether a database hostname strictly conforms to Render's internal
    PostgreSQL private network addressing scheme.
    """
    if not hostname or not isinstance(hostname, str):
        return False
    return bool(RENDER_INTERNAL_HOST_REGEX.match(hostname.strip()))

def is_trusted_render_internal_connection(
    hostname: str,
    render_env: Any = None,
    render_internal_sdn: Any = None
) -> bool:
    """
    Evaluates whether a production database connection qualifies as a trusted
    Render internal private network connection without requiring external TLS encryption.

    Requires ALL of the following conditions:
    1. RENDER=true in the runtime environment (Render platform indicator).
    2. RENDER_INTERNAL_SDN=true in application configuration (explicit opt-in).
    3. Hostname strictly matches the verified Render internal PostgreSQL hostname regex.

    Explicit False arguments (e.g. False, 'false', '0', 'no', '') take strict precedence
    and cannot be overridden by environment variables set to true.
    """
    is_render_runtime = resolve_bool_setting(render_env, "RENDER")
    is_sdn_configured = resolve_bool_setting(render_internal_sdn, "RENDER_INTERNAL_SDN")

    if not is_render_runtime or not is_sdn_configured:
        return False

    return is_render_internal_host(hostname)

def resolve_migration_target(
    settings_env: Optional[str],
    approved_host: Optional[str] = None,
    staging_migration: bool = False,
    approved_production_host: Optional[str] = None,
    production_migration: bool = False
) -> str:
    """
    Classifies migration target environment with a strict fail-closed hierarchy.
    Production can NEVER be reclassified as staging.
    Conflicting staging and production configuration raises RuntimeError.
    """
    env_name = (settings_env or "development").lower()

    # Normalize presence of staging vs production flags
    has_staging_conf = bool(staging_migration or (approved_host and approved_host.strip()))
    has_prod_conf = bool(production_migration or (approved_production_host and approved_production_host.strip()))

    # Reject simultaneous staging and production settings
    if has_staging_conf and has_prod_conf:
        conflicts = []
        if staging_migration:
            conflicts.append("STAGING_MIGRATION")
        if approved_host and approved_host.strip():
            conflicts.append("APPROVED_STAGING_HOST")
        if production_migration:
            conflicts.append("PRODUCTION_MIGRATION")
        if approved_production_host and approved_production_host.strip():
            conflicts.append("APPROVED_PRODUCTION_HOST")
        raise RuntimeError(
            f"Alembic migration stopped: Configuration conflict detected. "
            f"Staging and production settings cannot be set simultaneously ({', '.join(conflicts)})."
        )

    if env_name == "production":
        if has_staging_conf:
            conflicting = []
            if approved_host and approved_host.strip():
                conflicting.append("APPROVED_STAGING_HOST")
            if staging_migration:
                conflicting.append("STAGING_MIGRATION")
            raise RuntimeError(
                f"Alembic migration stopped: Configuration conflict detected. "
                f"Staging settings ({', '.join(conflicting)}) must not be set in a production environment."
            )
        return "production"

    if env_name == "staging":
        if has_prod_conf:
            conflicting = []
            if approved_production_host and approved_production_host.strip():
                conflicting.append("APPROVED_PRODUCTION_HOST")
            if production_migration:
                conflicting.append("PRODUCTION_MIGRATION")
            raise RuntimeError(
                f"Alembic migration stopped: Configuration conflict detected. "
                f"Production settings ({', '.join(conflicting)}) must not be set in a staging environment."
            )
        return "staging"

    # Development or unset environment
    if has_prod_conf:
        return "production"
    if has_staging_conf:
        return "staging"
    return "development"

def validate_db_target(
    url: Optional[str],
    environment: Optional[str] = None,
    approved_host: Optional[str] = None,
    is_migration: bool = False,
    staging_migration: Optional[bool] = None,
    approved_production_host: Optional[str] = None,
    production_migration: Optional[bool] = None,
    render_env: Any = None,
    render_internal_sdn: Any = None
) -> None:
    """
    Validates a database connection URL against deployment safety rules.
    This check occurs before creating a SQLAlchemy engine or running Alembic migrations.

    Rules enforced:
    1. Rejects None, empty, or whitespace-only URLs.
    2. Rejects placeholder URLs (e.g. alembic.ini defaults).
    3. Rejects malformed connection strings.
    4. Rejects SQLite in production application connections and migrations.
       Preserves SQLite for local development and unit tests.
    5. In staging mode:
       - Requires STAGING_MIGRATION=true for staging migrations.
       - Rejects 'dependency_analyzer_dev', 'dependency_analyzer', or localhost/loopback.
       - Requires exact approved staging hostname (not substring matching).
       - Requires database name to strictly equal 'neondb'.
       - Requires secure TLS configuration (e.g. sslmode=require, verify-ca, verify-full).
    6. In production mode:
       - Production migrations are strictly prohibited by default.
       - Production migrations require explicit PRODUCTION_MIGRATION=true and APPROVED_PRODUCTION_HOST.
       - Production migrations require exact hostname matching against APPROVED_PRODUCTION_HOST.
       - Production migrations strictly require database name 'neondb'.
       - Production migrations and application connections require secure TLS (sslmode=require, verify-ca, verify-full).
       - Rejects 'dependency_analyzer_dev', 'dependency_analyzer', and localhost/loopback.
       - Rejects conflicting staging configuration (APPROVED_STAGING_HOST, STAGING_MIGRATION).
       - Rejects conflicting production migration configuration in staging.
    7. In development mode:
       - Permits local PostgreSQL or SQLite while still forbidding placeholder URLs.
       - Local development migrations remain separate from staging/production authorization.
    """
    if not url or not url.strip():
        raise DatabaseTargetError(
            "Database URL is missing or empty. A valid database connection string must be configured."
        )

    clean_url = url.strip()

    # Reject known placeholders
    for placeholder in PLACEHOLDER_SUBSTRINGS:
        if placeholder in clean_url:
            raise DatabaseTargetError(
                f"Placeholder database URL detected ('{placeholder}'). "
                "A real, securely configured DATABASE_URL must be provided."
            )

    try:
        parsed = urlparse(clean_url)
        # Validate port if specified
        port = parsed.port
        if port is not None and not (1 <= port <= 65535):
            raise DatabaseTargetError(f"Invalid database port '{port}'. Must be between 1 and 65535.")
    except DatabaseTargetError:
        raise
    except Exception as exc:
        raise DatabaseTargetError(f"Malformed database URL: {exc}") from exc

    if not parsed.scheme:
        raise DatabaseTargetError("Malformed database URL: missing connection scheme.")

    env_lower = (environment or os.getenv("ENVIRONMENT", "development")).lower()

    # Reject SQLite in production application connections and migrations; preserve for dev and tests
    if parsed.scheme.startswith("sqlite"):
        if env_lower == "production":
            raise DatabaseTargetError(
                "SQLite is strictly prohibited in production application connections. "
                "Production requires a secure PostgreSQL database connection."
            )
        if env_lower == "staging" and is_migration:
            raise DatabaseTargetError("SQLite is not supported for staging/production migrations.")
        return

    # Must be postgresql dialect
    if not parsed.scheme.startswith("postgres"):
        raise DatabaseTargetError(
            f"Unsupported database scheme '{parsed.scheme}'. Only PostgreSQL is supported in this application."
        )

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise DatabaseTargetError("Malformed database URL: missing hostname.")

    # Extract database name (path without leading slash)
    dbname = parsed.path.lstrip("/").strip()
    if not dbname:
        raise DatabaseTargetError("Malformed database URL: missing database name.")

    is_staging_migration = (
        staging_migration
        if staging_migration is not None
        else (os.getenv("STAGING_MIGRATION", "").lower() in ("1", "true", "yes"))
    )
    is_production_migration = (
        production_migration
        if production_migration is not None
        else (os.getenv("PRODUCTION_MIGRATION", "").lower() in ("1", "true", "yes"))
    )
    eff_staging_host = approved_host if approved_host is not None else os.getenv("APPROVED_STAGING_HOST")
    eff_prod_host = approved_production_host if approved_production_host is not None else os.getenv("APPROVED_PRODUCTION_HOST")

    has_staging_conf = bool(is_staging_migration or (eff_staging_host and eff_staging_host.strip()))
    has_prod_conf = bool(is_production_migration or (eff_prod_host and eff_prod_host.strip()))

    # Reject simultaneous staging and production migration settings
    if has_staging_conf and has_prod_conf:
        conflicts = []
        if is_staging_migration:
            conflicts.append("STAGING_MIGRATION")
        if eff_staging_host and eff_staging_host.strip():
            conflicts.append("APPROVED_STAGING_HOST")
        if is_production_migration:
            conflicts.append("PRODUCTION_MIGRATION")
        if eff_prod_host and eff_prod_host.strip():
            conflicts.append("APPROVED_PRODUCTION_HOST")
        raise DatabaseTargetError(
            f"Configuration conflict: Staging and production settings cannot be set simultaneously ({', '.join(conflicts)})."
        )

    # Guard against conflicting staging configuration in production
    if env_lower == "production" and has_staging_conf:
        conflicts = []
        if is_staging_migration:
            conflicts.append("STAGING_MIGRATION")
        if eff_staging_host and eff_staging_host.strip():
            conflicts.append("APPROVED_STAGING_HOST")
        raise DatabaseTargetError(
            f"Configuration conflict: Staging settings ({', '.join(conflicts)}) cannot be set in a production environment."
        )

    # Guard against conflicting production configuration in staging
    if env_lower == "staging" and has_prod_conf:
        conflicts = []
        if is_production_migration:
            conflicts.append("PRODUCTION_MIGRATION")
        if eff_prod_host and eff_prod_host.strip():
            conflicts.append("APPROVED_PRODUCTION_HOST")
        raise DatabaseTargetError(
            f"Configuration conflict: Production settings ({', '.join(conflicts)}) cannot be set in a staging environment."
        )

    staging_flag = (
        env_lower == "staging"
        or is_staging_migration
        or (is_migration and eff_staging_host is not None)
    )

    production_flag = (
        env_lower == "production"
        or is_production_migration
        or (is_migration and eff_prod_host is not None)
    )

    # 1. Staging Targeting Guard
    if staging_flag:
        if is_migration and not is_staging_migration:
            raise DatabaseTargetError(
                "Staging migration authorization failed: STAGING_MIGRATION=true is required to execute migrations against staging."
            )

        if not eff_staging_host or not eff_staging_host.strip():
            raise DatabaseTargetError(
                "Staging database safety check failed: APPROVED_STAGING_HOST is not configured. "
                "You must specify the exact approved Neon staging hostname."
            )

        clean_approved_host = eff_staging_host.strip().lower()
        if "://" in clean_approved_host:
            clean_approved_host = urlparse(clean_approved_host).hostname or clean_approved_host
        elif ":" in clean_approved_host and not clean_approved_host.startswith("["):
            clean_approved_host = clean_approved_host.split(":", 1)[0]

        # Strict exact hostname match (prevent partial/substring bypass e.g. evil-neon.tech)
        if hostname != clean_approved_host:
            raise DatabaseTargetError(
                f"Unauthorized database host '{hostname}'. Target host must exactly match "
                f"the approved staging host '{clean_approved_host}'."
            )

        # Prohibit local databases in staging
        if dbname in LOCAL_DEV_DB_NAMES:
            raise DatabaseTargetError(
                f"Staging target rejected: Targeting local development database '{dbname}' "
                "is strictly forbidden in staging."
            )

        # Prohibit localhost/loopback in staging
        if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or hostname.startswith("127."):
            raise DatabaseTargetError(
                f"Staging target rejected: Local loopback address '{hostname}' is not an authorized staging host."
            )

        # Must strictly target neondb
        if dbname != "neondb":
            raise DatabaseTargetError(
                f"Unauthorized staging database name '{dbname}'. "
                "Staging migrations and deployments are only authorized against 'neondb'."
            )

        # Verify TLS configuration - fail closed if missing or any value is insecure
        query_params = parse_qs(parsed.query)
        sslmode_list = query_params.get("sslmode", [])
        valid_tls_modes = ("require", "verify-ca", "verify-full")

        if not sslmode_list or len(sslmode_list) > 1 or any(m.lower() not in valid_tls_modes for m in sslmode_list):
            raise DatabaseTargetError(
                "Insecure connection rejected: Neon staging requires TLS encryption. "
                f"Database URL query parameters must include sslmode in {valid_tls_modes} (e.g. ?sslmode=require)."
            )

    # 2. Production Targeting Guard
    elif production_flag:
        if is_migration:
            # 1. Require explicit PRODUCTION_MIGRATION=true
            if not is_production_migration:
                raise DatabaseTargetError(
                    "Production database migrations are strictly prohibited by default. "
                    "PRODUCTION_MIGRATION=true and APPROVED_PRODUCTION_HOST are required to authorize a production migration."
                )

            # 2. Require APPROVED_PRODUCTION_HOST to be present and non-empty
            if not eff_prod_host or not eff_prod_host.strip():
                raise DatabaseTargetError(
                    "Production database safety check failed: APPROVED_PRODUCTION_HOST is not configured. "
                    "You must specify the exact approved production hostname."
                )

            clean_approved_prod_host = eff_prod_host.strip().lower()
            if "://" in clean_approved_prod_host:
                clean_approved_prod_host = urlparse(clean_approved_prod_host).hostname or clean_approved_prod_host
            elif ":" in clean_approved_prod_host and not clean_approved_prod_host.startswith("["):
                clean_approved_prod_host = clean_approved_prod_host.split(":", 1)[0]

            # Strict exact hostname match (prevent partial/substring bypass e.g. evil-neon.tech)
            if hostname != clean_approved_prod_host:
                raise DatabaseTargetError(
                    f"Unauthorized database host '{hostname}'. Target host must exactly match "
                    f"the approved production host '{clean_approved_prod_host}'."
                )

            # Prohibit local databases in production migration
            if dbname in LOCAL_DEV_DB_NAMES:
                raise DatabaseTargetError(
                    f"Production migration target rejected: Local development database '{dbname}' "
                    "is strictly forbidden."
                )

            # Prohibit localhost/loopback in production migration
            if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or hostname.startswith("127."):
                raise DatabaseTargetError(
                    f"Production migration target rejected: Local loopback address '{hostname}' "
                    "is not an authorized production host."
                )

            # Must strictly target an approved production database name
            if dbname not in AUTHORIZED_PRODUCTION_DB_NAMES:
                raise DatabaseTargetError(
                    f"Unauthorized production database name '{dbname}'. "
                    f"Production migrations are only authorized against approved production databases ({', '.join(AUTHORIZED_PRODUCTION_DB_NAMES)})."
                )

            # Verify TLS configuration - fail closed if missing or any value is insecure
            query_params = parse_qs(parsed.query)
            sslmode_list = query_params.get("sslmode", [])
            valid_tls_modes = ("require", "verify-ca", "verify-full")

            is_trusted_internal = is_trusted_render_internal_connection(
                hostname=hostname,
                render_env=render_env,
                render_internal_sdn=render_internal_sdn,
            )
            if is_trusted_internal:
                if len(sslmode_list) > 1:
                    raise DatabaseTargetError(
                        "Insecure connection rejected: Production requires secure TLS encryption. "
                        "Conflicting or duplicate sslmode parameters are prohibited."
                    )
                if sslmode_list:
                    mode = sslmode_list[0].lower()
                    if mode == "disable":
                        raise DatabaseTargetError(
                            "Insecure connection rejected: Production requires secure TLS encryption. "
                            "Explicit insecure sslmode 'disable' is forbidden."
                        )
                    if mode in ("verify-ca", "verify-full"):
                        raise DatabaseTargetError(
                            "Insecure connection rejected: Production requires secure TLS encryption. "
                            f"Render internal connections use self-signed certificates and do not support sslmode='{mode}'. "
                            "Use sslmode=require or omit sslmode."
                        )
                    if mode != "require":
                        raise DatabaseTargetError(
                            "Insecure connection rejected: Production requires secure TLS encryption. "
                            f"Unsupported sslmode '{mode}' for internal connection. Allowed modes: require (or omit sslmode)."
                        )
            else:
                if not sslmode_list or len(sslmode_list) > 1 or any(m.lower() not in valid_tls_modes for m in sslmode_list):
                    raise DatabaseTargetError(
                        "Insecure connection rejected: Production requires secure TLS encryption. "
                        f"Database URL query parameters must include sslmode in {valid_tls_modes} (e.g. ?sslmode=require)."
                    )

        else:
            # Normal production application connection
            if dbname in LOCAL_DEV_DB_NAMES:
                raise DatabaseTargetError(
                    f"Production target rejected: Local development database '{dbname}' "
                    "cannot be targeted in production."
                )
            if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or hostname.startswith("127."):
                raise DatabaseTargetError(
                    f"Production target rejected: Local loopback address '{hostname}' cannot be targeted in production."
                )

            # Verify TLS configuration for production PostgreSQL connections - fail closed if missing or any value is insecure
            query_params = parse_qs(parsed.query)
            sslmode_list = query_params.get("sslmode", [])
            valid_tls_modes = ("require", "verify-ca", "verify-full")

            is_trusted_internal = is_trusted_render_internal_connection(
                hostname=hostname,
                render_env=render_env,
                render_internal_sdn=render_internal_sdn,
            )
            if is_trusted_internal:
                if len(sslmode_list) > 1:
                    raise DatabaseTargetError(
                        "Insecure connection rejected: Production requires secure TLS encryption. "
                        "Conflicting or duplicate sslmode parameters are prohibited."
                    )
                if sslmode_list:
                    mode = sslmode_list[0].lower()
                    if mode == "disable":
                        raise DatabaseTargetError(
                            "Insecure connection rejected: Production requires secure TLS encryption. "
                            "Explicit insecure sslmode 'disable' is forbidden."
                        )
                    if mode in ("verify-ca", "verify-full"):
                        raise DatabaseTargetError(
                            "Insecure connection rejected: Production requires secure TLS encryption. "
                            f"Render internal connections use self-signed certificates and do not support sslmode='{mode}'. "
                            "Use sslmode=require or omit sslmode."
                        )
                    if mode != "require":
                        raise DatabaseTargetError(
                            "Insecure connection rejected: Production requires secure TLS encryption. "
                            f"Unsupported sslmode '{mode}' for internal connection. Allowed modes: require (or omit sslmode)."
                        )
            else:
                if not sslmode_list or len(sslmode_list) > 1 or any(m.lower() not in valid_tls_modes for m in sslmode_list):
                    raise DatabaseTargetError(
                        "Insecure connection rejected: Production requires secure TLS encryption. "
                        f"Database URL query parameters must include sslmode in {valid_tls_modes} (e.g. ?sslmode=require)."
                    )
