@echo off
REM AI-Quota Tray — Windows launcher
REM Starts the system tray agent (requires the backend to be running first)
title AI-Quota Tray

cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found. Run setup first.
    pause
    exit /b 1
)

echo [AI-Quota Tray] Starting system tray agent...
echo [AI-Quota Tray] Make sure the backend is running (run.bat) before starting the tray.
.venv\Scripts\python.exe -m apps.tray
