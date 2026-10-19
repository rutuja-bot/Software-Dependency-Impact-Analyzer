# ==============================================================================
# PostgreSQL 18 Administrator Password Recovery & Project Setup Script
# Review-Only - Do NOT Execute without User Authorization
# Requires Execution in an Elevated ("Run as Administrator") PowerShell
#
# Target Service: postgresql-x64-18
# Data Directory: C:\Program Files\PostgreSQL\18\data
# Config File:    C:\Program Files\PostgreSQL\18\data\pg_hba.conf
# Backup File:    C:\Program Files\PostgreSQL\18\data\pg_hba.conf.backup-20261014-104132
#
# SECURITY NOTE:
# Passwords are read via Read-Host -AsSecureString. To transmit them to unmanaged
# Win32 processes (psql.exe via stdin), they must be decrypted into memory as
# .NET strings. To minimize memory exposure:
# 1. Plaintext strings are only created immediately before execution.
# 2. Plaintext variables are explicitly overwritten with $null in the finally block.
# 3. Explicit garbage collection ([System.GC]::Collect()) is triggered immediately.
# 4. Passwords are NEVER written to disk, command-line arguments, environment vars,
#    or console logs.
#
# RESIDUAL RISK NOTE:
# PowerShell's finally block handles all runtime exceptions, caught signals, and script
# errors. However, if the process is forcibly terminated (e.g. Stop-Process -Force,
# Task Manager End Process, terminal crash, or sudden power loss), finally CANNOT
# execute. In that event, use emergency_rollback_hba.bat immediately.
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ServiceName = "postgresql-x64-18"
$DataDir     = "C:\Program Files\PostgreSQL\18\data"
$HbaFile     = "$DataDir\pg_hba.conf"
$BackupFile  = "$DataDir\pg_hba.conf.backup-20261014-104132"
$PsqlExe     = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$CreatedbExe = "C:\Program Files\PostgreSQL\18\bin\createdb.exe"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " PostgreSQL 18 Safe Administrator Recovery & Setup Script" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# Pre-Flight Checks
# ------------------------------------------------------------------------------
# 1. Administrator check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This recovery script must be executed in an Elevated PowerShell terminal ('Run as Administrator')."
    exit 1
}

# 2. Check executables and files
if (-not (Test-Path $PsqlExe))     { Write-Error "psql executable not found at: $PsqlExe"; exit 1 }
if (-not (Test-Path $CreatedbExe)) { Write-Error "createdb executable not found at: $CreatedbExe"; exit 1 }
if (-not (Test-Path $HbaFile))     { Write-Error "pg_hba.conf not found at: $HbaFile"; exit 1 }
if (-not (Test-Path $BackupFile))  { Write-Error "Verified backup file not found at: $BackupFile"; exit 1 }

# 3. Verify backup file hash matches pg_hba.conf before proceeding
$hbaHash = (Get-FileHash $HbaFile -Algorithm SHA256).Hash
$bakHash = (Get-FileHash $BackupFile -Algorithm SHA256).Hash

if ($hbaHash -ne $bakHash) {
    Write-Error "Safety abort: Current pg_hba.conf hash does not match verified backup hash.`nHBA: $hbaHash`nBAK: $bakHash"
    exit 1
}
Write-Host "[OK] Verified backup hash matches current configuration ($hbaHash)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# Rule Replacement Verification (Ensure exactly the 2 expected rules exist)
# ------------------------------------------------------------------------------
$lines = Get-Content $HbaFile
$v4Found = $false
$v6Found = $false
$modifiedLines = [System.Collections.Generic.List[string]]::new()

foreach ($line in $lines) {
    if ($line -match '^\s*host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256\s*$') {
        $modifiedLines.Add("host    all             all             127.0.0.1/32            trust")
        $v4Found = $true
    } elseif ($line -match '^\s*host\s+all\s+all\s+::1/128\s+scram-sha-256\s*$') {
        $modifiedLines.Add("host    all             all             ::1/128                 trust")
        $v6Found = $true
    } else {
        $modifiedLines.Add($line)
    }
}

if (-not $v4Found -or -not $v6Found) {
    Write-Error "Safety abort: Target scram-sha-256 rules for 127.0.0.1/32 (Found: $v4Found) or ::1/128 (Found: $v6Found) were not found in expected format. Aborting without changes."
    exit 1
}
Write-Host "[OK] Verified target IPv4 and IPv6 loopback rules for substitution." -ForegroundColor Green

# ------------------------------------------------------------------------------
# Secure Credential Prompts (Passwords are never hardcoded, echoed, or logged)
# ------------------------------------------------------------------------------
Write-Host "`nPlease enter the new credentials. Passwords will NOT be echoed or logged." -ForegroundColor Yellow

$NewAdminPassSecure = Read-Host -Prompt "Enter new password for PostgreSQL superuser 'postgres'" -AsSecureString
$NewAdminPass = [System.Net.NetworkCredential]::new("", $NewAdminPassSecure).Password
if ([string]::IsNullOrWhiteSpace($NewAdminPass)) { Write-Error "Password for 'postgres' cannot be empty."; exit 1 }

$NewAppPassSecure = Read-Host -Prompt "Enter new password for application role 'dep_analyzer_app'" -AsSecureString
$NewAppPass = [System.Net.NetworkCredential]::new("", $NewAppPassSecure).Password
if ([string]::IsNullOrWhiteSpace($NewAppPass)) { Write-Error "Password for 'dep_analyzer_app' cannot be empty."; exit 1 }

# ------------------------------------------------------------------------------
# Execution with Guaranteed Rollback (try ... finally)
# ------------------------------------------------------------------------------
$RecoverySuccess    = $false
$RestorationSuccess = $false

try {
    Write-Host "`n[STEP 1] Applying temporary localhost trust configuration..." -ForegroundColor Cyan
    Set-Content -Path $HbaFile -Value $modifiedLines -Encoding Ascii

    Write-Host "[STEP 2] Restarting PostgreSQL service to activate temporary trust..." -ForegroundColor Cyan
    Restart-Service -Name $ServiceName
    Start-Sleep -Seconds 2

    $svc = Get-Service -Name $ServiceName
    if ($svc.Status -ne "Running") {
        throw "PostgreSQL service failed to start after applying trust configuration."
    }

    Write-Host "[STEP 3] Executing administrative user and database setup..." -ForegroundColor Cyan
    $escapedAdminPass = $NewAdminPass.Replace("'", "''")
    $escapedAppPass   = $NewAppPass.Replace("'", "''")

    # 3.1 Reset postgres superuser password
    Write-Host "  -> Updating 'postgres' superuser password..." -ForegroundColor Gray
    "ALTER USER postgres WITH PASSWORD '$escapedAdminPass';" | & $PsqlExe -U postgres -h localhost -p 5432 -q -v "ON_ERROR_STOP=1"
    if ($LASTEXITCODE -ne 0) { throw "Failed to update 'postgres' password (psql exit code: $LASTEXITCODE)." }

    # 3.2 Create or update application role 'dep_analyzer_app'
    Write-Host "  -> Configuring 'dep_analyzer_app' application role..." -ForegroundColor Gray
    $roleQuery = "SELECT 1 FROM pg_roles WHERE rolname = 'dep_analyzer_app';"
    $roleCheckOutput = $roleQuery | & $PsqlExe -U postgres -h localhost -p 5432 -t -A -q -v "ON_ERROR_STOP=1"
    if ($LASTEXITCODE -ne 0) { throw "Role existence query failed with psql exit code: $LASTEXITCODE" }

    $normalizedRoleOutput = if ($null -ne $roleCheckOutput) { $roleCheckOutput.Trim() } else { "" }

    if ($normalizedRoleOutput -eq "") {
        Write-Host "  -> Role 'dep_analyzer_app' does not exist. Creating role..." -ForegroundColor Gray
        "CREATE USER dep_analyzer_app WITH PASSWORD '$escapedAppPass';" | & $PsqlExe -U postgres -h localhost -p 5432 -q -v "ON_ERROR_STOP=1"
    } elseif ($normalizedRoleOutput -eq "1") {
        Write-Host "  -> Role 'dep_analyzer_app' already exists. Updating password..." -ForegroundColor Gray
        "ALTER USER dep_analyzer_app WITH PASSWORD '$escapedAppPass';" | & $PsqlExe -U postgres -h localhost -p 5432 -q -v "ON_ERROR_STOP=1"
    } else {
        throw "Unexpected role existence query output: '$roleCheckOutput'"
    }
    if ($LASTEXITCODE -ne 0) { throw "Failed to configure 'dep_analyzer_app' role (psql exit code: $LASTEXITCODE)." }

    # 3.3 Check existing database state and owner (Preserving existing database safely)
    Write-Host "  -> Checking development database 'dependency_analyzer_dev'..." -ForegroundColor Gray
    $dbQuery = "SELECT datname, pg_catalog.pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'dependency_analyzer_dev';"
    $dbCheckOutput = $dbQuery | & $PsqlExe -U postgres -h localhost -p 5432 -t -A -F "|" -q -v "ON_ERROR_STOP=1"
    
    # Critical Check: Validate exit code of database existence query
    if ($LASTEXITCODE -ne 0) {
        throw "Database existence query failed with psql exit code: $LASTEXITCODE"
    }

    if ([string]::IsNullOrWhiteSpace($dbCheckOutput)) {
        Write-Host "  -> Database 'dependency_analyzer_dev' does not exist. Creating via createdb..." -ForegroundColor Gray
        # Using official createdb utility avoids PostgreSQL's 'CREATE DATABASE cannot run inside a transaction block' restriction
        & $CreatedbExe -U postgres -h localhost -p 5432 -O dep_analyzer_app dependency_analyzer_dev
        if ($LASTEXITCODE -ne 0) { throw "Failed to create database 'dependency_analyzer_dev' (createdb exit code: $LASTEXITCODE)." }
    } else {
        $parts = $dbCheckOutput.Trim().Split("|")
        $currentOwner = if ($parts.Length -ge 2) { $parts[1] } else { "unknown" }
        Write-Host "  -> Database 'dependency_analyzer_dev' already exists (Owner: $currentOwner). Preserving existing data." -ForegroundColor Green
    }

    # 3.4 Grant privileges on database to dep_analyzer_app
    Write-Host "  -> Granting privileges on 'dependency_analyzer_dev' to 'dep_analyzer_app'..." -ForegroundColor Gray
    "GRANT ALL PRIVILEGES ON DATABASE dependency_analyzer_dev TO dep_analyzer_app;" | & $PsqlExe -U postgres -h localhost -p 5432 -q -v "ON_ERROR_STOP=1"
    if ($LASTEXITCODE -ne 0) { throw "Failed to grant database privileges (psql exit code: $LASTEXITCODE)." }

    Write-Host "[OK] Administrative credentials and development database configured successfully." -ForegroundColor Green
    $RecoverySuccess = $true
}
catch {
    Write-Host "`n[ERROR] Recovery encountered an error: $_" -ForegroundColor Red
    $RecoverySuccess = $false
}
finally {
    # --------------------------------------------------------------------------
    # Clear plaintext password variables from memory immediately
    # --------------------------------------------------------------------------
    $NewAdminPass     = $null
    $NewAppPass       = $null
    $escapedAdminPass = $null
    $escapedAppPass   = $null
    [System.GC]::Collect()

    # --------------------------------------------------------------------------
    # Guaranteed Restoration of Original scram-sha-256 Configuration
    # --------------------------------------------------------------------------
    Write-Host "`n[RESTORATION] Restoring original scram-sha-256 configuration from verified backup..." -ForegroundColor Cyan
    try {
        Copy-Item -Path $BackupFile -Destination $HbaFile -Force

        Write-Host "[RESTORATION] Restarting PostgreSQL service to re-enforce scram-sha-256..." -ForegroundColor Cyan
        Restart-Service -Name $ServiceName -ErrorAction Stop
        Start-Sleep -Seconds 2

        # 1. Verify service state
        $postSvc = Get-Service -Name $ServiceName
        if ($postSvc.Status -ne "Running") {
            throw "PostgreSQL service is not running after restoration! Current status: $($postSvc.Status)"
        }
        Write-Host "[OK] PostgreSQL service verified running." -ForegroundColor Green

        # 2. Verify file hash
        $postHash = (Get-FileHash $HbaFile -Algorithm SHA256).Hash
        if ($postHash -ne $bakHash) {
            throw "pg_hba.conf hash mismatch after restoration! (Expected: $bakHash, Found: $postHash)"
        }
        Write-Host "[OK] Configuration hash verified: Matches original backup ($postHash)" -ForegroundColor Green

        $RestorationSuccess = $true
    }
    catch {
        Write-Host "`n======================================================================" -ForegroundColor Red
        Write-Host " CRITICAL FAILURE DURING RESTORATION: $_" -ForegroundColor Red
        Write-Host " RUN EMERGENCY ROLLBACK IMMEDIATELY:" -ForegroundColor Red
        Write-Host " backend\scripts\emergency_rollback_hba.bat" -ForegroundColor Red
        Write-Host "======================================================================" -ForegroundColor Red
        $RestorationSuccess = $false
        $RecoverySuccess    = $false
    }
}

# ------------------------------------------------------------------------------
# Final Status Report
# ------------------------------------------------------------------------------
if ($RecoverySuccess -and $RestorationSuccess) {
    Write-Host "`n======================================================================" -ForegroundColor Green
    Write-Host " RECOVERY & CONFIGURATION COMPLETED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "Original authentication (scram-sha-256) is fully re-enforced."
    Write-Host "`nNext Step: Configure backend\.env with the application role:"
    Write-Host "DATABASE_URL=`"postgresql://dep_analyzer_app:<your_app_password>@localhost:5432/dependency_analyzer_dev`""
} else {
    Write-Host "`n======================================================================" -ForegroundColor Red
    Write-Host " RECOVERY FAILED OR WAS INCOMPLETE - REVIEW CRITICAL MESSAGES ABOVE" -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red
    exit 1
}
