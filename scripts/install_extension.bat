@echo off
REM AI-Quota — Extension Auto-Installer (Windows)
REM Installs the latest .vsix into VS Code, Cursor, and/or Antigravity

setlocal EnableDelayedExpansion
set "REPO=%~dp0.."
set "DIST_DIR=%REPO%\dist\vsix"

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║       AI-Quota — Extension Installer             ║
echo ╚══════════════════════════════════════════════════╝
echo.

REM ── Find latest .vsix ────────────────────────────────────────────────────────
set "VSIX="
for /f "delims=" %%f in ('dir /b /o-n "%DIST_DIR%\ai-quota-*.vsix" 2^>nul') do (
    if not defined VSIX set "VSIX=%DIST_DIR%\%%f"
)

if not defined VSIX (
    echo [ERROR] No .vsix found in dist\vsix\
    echo [INFO]  Run scripts\package_extension.bat first.
    exit /b 1
)
echo [INFO] Installing: %VSIX%
echo.

REM ── Try each IDE CLI ─────────────────────────────────────────────────────────
set "INSTALLED=0"

REM Antigravity
where antigravity >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Installing into Antigravity...
    antigravity --install-extension "%VSIX%" --force
    if not errorlevel 1 (
        echo [OK]  Installed in Antigravity
        set "INSTALLED=1"
    )
)

REM VS Code
where code >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Installing into VS Code...
    code --install-extension "%VSIX%" --force
    if not errorlevel 1 (
        echo [OK]  Installed in VS Code
        set "INSTALLED=1"
    )
)

REM Cursor
where cursor >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Installing into Cursor...
    cursor --install-extension "%VSIX%" --force
    if not errorlevel 1 (
        echo [OK]  Installed in Cursor
        set "INSTALLED=1"
    )
)

REM Codium
where codium >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Installing into VSCodium...
    codium --install-extension "%VSIX%" --force
    if not errorlevel 1 (
        echo [OK]  Installed in VSCodium
        set "INSTALLED=1"
    )
)

if "%INSTALLED%"=="0" (
    echo.
    echo [WARN] No IDE CLI found in PATH.
    echo [INFO] Install manually: open your IDE → Extensions → Install from VSIX
    echo        File: %VSIX%
)

echo.
echo Done. Restart your IDE to activate the extension.
echo Dashboard: http://127.0.0.1:8765
echo.
endlocal
