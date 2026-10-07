@echo off
REM AI-Quota — Windows launcher
REM Starts the local agent on http://127.0.0.1:8765

setlocal

cd /d "%~dp0"

REM Prefer .venv if present
if exist ".venv\Scripts\python.exe" (
    set PYTHON=.venv\Scripts\python.exe
) else (
    set PYTHON=python
)

REM Check Python is available
%PYTHON% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found. Install Python 3.11+ and run: python -m venv .venv
    pause
    exit /b 1
)

REM Install / upgrade dependencies quietly
%PYTHON% -m pip install -r requirements.txt --quiet

REM Start the agent
echo.
echo  AI-Quota — starting agent on http://127.0.0.1:8765
echo  Dashboard will open in your browser...
echo  Press Ctrl+C to stop.
echo.

REM Open browser after a short delay
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8765"

%PYTHON% -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload

endlocal
