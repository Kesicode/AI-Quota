#!/usr/bin/env bash
# AI-Quota — macOS / Linux launcher
# Starts the local agent on http://127.0.0.1:8765
set -e

cd "$(dirname "$0")"

# Prefer .venv if present
if [ -f ".venv/bin/python" ]; then
  PYTHON=".venv/bin/python"
else
  PYTHON="python3"
fi

# Check Python
if ! $PYTHON --version >/dev/null 2>&1; then
  echo "ERROR: Python 3 not found. Install Python 3.11+ and run: python3 -m venv .venv"
  exit 1
fi

# Install / upgrade dependencies quietly
$PYTHON -m pip install -r requirements.txt --quiet

echo ""
echo " AI-Quota — starting agent on http://127.0.0.1:8765"
echo " Press Ctrl+C to stop."
echo ""

# Open browser (macOS / Linux)
(sleep 2 && (open http://127.0.0.1:8765 2>/dev/null || xdg-open http://127.0.0.1:8765 2>/dev/null || true)) &

$PYTHON -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
