@echo off
REM AI-Quota — Extension Packager (Windows)
REM Run from the repository root: scripts\package_extension.bat

setlocal EnableDelayedExpansion
set "REPO=%~dp0.."
set "EXT_DIR=%REPO%\apps\vscode-extension"
set "DIST_DIR=%REPO%\dist\vsix"

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║       AI-Quota — Extension Packager              ║
echo ╚══════════════════════════════════════════════════╝
echo.

REM ── Check Node.js ────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org/
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found.
    exit /b 1
)
for /f "tokens=*" %%v in ('npm --version') do set NPM_VER=%%v
echo [OK] npm %NPM_VER%

REM ── Check vsce ───────────────────────────────────────────────────────────────
where vsce >nul 2>&1
if errorlevel 1 (
    echo [INFO] vsce not found — installing globally...
    npm install -g @vscode/vsce
    if errorlevel 1 (
        echo [ERROR] Failed to install vsce.
        exit /b 1
    )
)
echo [OK] vsce ready

REM ── Install dependencies ─────────────────────────────────────────────────────
echo.
echo [INFO] Installing extension dependencies...
pushd "%EXT_DIR%"
call npm install --silent
if errorlevel 1 (
    echo [ERROR] npm install failed.
    popd
    exit /b 1
)
echo [OK] Dependencies installed

REM ── Build ────────────────────────────────────────────────────────────────────
echo [INFO] Building extension bundle...
call node esbuild.js --production
if errorlevel 1 (
    echo [ERROR] Build failed.
    popd
    exit /b 1
)
echo [OK] Build complete

REM ── Package ──────────────────────────────────────────────────────────────────
echo [INFO] Packaging .vsix...
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"

REM Read version from package.json
for /f "tokens=*" %%v in ('node -e "process.stdout.write(require('./package.json').version)"') do set EXT_VER=%%v
set "VSIX_OUT=%DIST_DIR%\ai-quota-%EXT_VER%.vsix"

call vsce package --no-dependencies --out "%VSIX_OUT%"
if errorlevel 1 (
    echo [ERROR] vsce package failed.
    popd
    exit /b 1
)

popd

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║  Package ready: dist\vsix\ai-quota-%EXT_VER%.vsix  ║
echo ╚══════════════════════════════════════════════════╝
echo.
echo Install with:  scripts\install_extension.bat
echo.
endlocal
