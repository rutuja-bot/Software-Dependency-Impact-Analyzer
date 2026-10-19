@echo off
REM ==============================================================================
REM Emergency Standalone Rollback for pg_hba.conf
REM Restores the verified scram-sha-256 backup and restarts the PostgreSQL service.
REM Must be run as Administrator ("Run as administrator").
REM ==============================================================================
setlocal EnableDelayedExpansion

set "SERVICE_NAME=postgresql-x64-18"
set "DATA_DIR=C:\Program Files\PostgreSQL\18\data"
set "HBA_FILE=%DATA_DIR%\pg_hba.conf"
set "BACKUP_FILE=%DATA_DIR%\pg_hba.conf.backup-20261014-104132"
set "EXPECTED_HASH=0c8dc6e6e57399790417a6e13b3a8e1b5e27aa19708a2122148fbfe3bdcecd42"

echo ======================================================================
echo  PostgreSQL 18 Emergency Standalone Rollback
echo ======================================================================

REM 1. Administrator Privilege Check
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo [CRITICAL ERROR] Administrator privileges required.
    echo Please right-click this batch file and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

REM 2. Verify Backup File Exists
if not exist "%BACKUP_FILE%" (
    echo.
    echo [CRITICAL ERROR] Verified backup file not found:
    echo "%BACKUP_FILE%"
    echo.
    pause
    exit /b 1
)

REM 3. Restore Backup File Byte-for-Byte
echo.
echo [1/3] Restoring pg_hba.conf from verified backup...
copy /Y "%BACKUP_FILE%" "%HBA_FILE%" >nul
if errorlevel 1 (
    echo.
    echo [CRITICAL ERROR] Failed to copy backup file to pg_hba.conf!
    echo Check folder permissions on "%DATA_DIR%".
    echo.
    pause
    exit /b 1
)
echo [OK] Restored backup file.

REM 4. Restart PostgreSQL Service
echo.
echo [2/3] Restarting Windows Service %SERVICE_NAME%...
powershell -NoProfile -Command "Restart-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
if errorlevel 1 (
    echo.
    echo [CRITICAL ERROR] Failed to restart Windows Service %SERVICE_NAME%!
    echo Check Windows Event Viewer or Service status.
    echo.
    pause
    exit /b 1
)

REM 5. Verify Service State via SC
sc query "%SERVICE_NAME%" | find "RUNNING" >nul
if errorlevel 1 (
    echo.
    echo [CRITICAL ERROR] Service %SERVICE_NAME% is NOT in RUNNING state!
    echo.
    pause
    exit /b 1
)
echo [OK] Service %SERVICE_NAME% is RUNNING.

REM 6. Verify SHA-256 Hash
echo.
echo [3/3] Verifying SHA-256 configuration hash...
for /f "tokens=*" %%H in ('powershell -NoProfile -Command "(Get-FileHash '%HBA_FILE%' -Algorithm SHA256).Hash.ToLower()"') do set "CURRENT_HASH=%%H"

if /i "%CURRENT_HASH%" neq "%EXPECTED_HASH%" (
    echo.
    echo [CRITICAL ERROR] Hash mismatch after restoration!
    echo Current Hash:  %CURRENT_HASH%
    echo Expected Hash: %EXPECTED_HASH%
    echo.
    pause
    exit /b 1
)

echo [OK] Configuration hash verified: Matches original verified backup.
echo.
echo ======================================================================
echo  EMERGENCY ROLLBACK COMPLETED SUCCESSFULLY
echo  Original authentication rules (scram-sha-256) are fully re-enforced.
echo ======================================================================
echo.
pause
exit /b 0
