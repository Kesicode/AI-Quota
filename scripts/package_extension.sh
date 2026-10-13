#!/usr/bin/env bash
# AI-Quota — Extension Packager & Installer (macOS / Linux)
# Run from repo root: bash scripts/package_extension.sh

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$REPO/apps/vscode-extension"
DIST_DIR="$REPO/dist/vsix"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       AI-Quota — Extension Packager              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Check Node / npm ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js not found. Install from https://nodejs.org/"
    exit 1
fi
echo "[OK] Node.js $(node --version)"

if ! command -v npm &>/dev/null; then
    echo "[ERROR] npm not found."
    exit 1
fi
echo "[OK] npm $(npm --version)"

# ── Install vsce if missing ──────────────────────────────────────────────────
if ! command -v vsce &>/dev/null; then
    echo "[INFO] Installing vsce globally..."
    npm install -g @vscode/vsce
fi
echo "[OK] vsce ready"

# ── Install deps & build ─────────────────────────────────────────────────────
echo ""
echo "[INFO] Installing extension dependencies..."
(cd "$EXT_DIR" && npm install --silent)
echo "[OK] Dependencies installed"

echo "[INFO] Building extension bundle..."
(cd "$EXT_DIR" && node esbuild.js --production)
echo "[OK] Build complete"

# ── Package ──────────────────────────────────────────────────────────────────
mkdir -p "$DIST_DIR"
EXT_VER=$(node -e "process.stdout.write(require('$EXT_DIR/package.json').version)")
VSIX_OUT="$DIST_DIR/ai-quota-$EXT_VER.vsix"

echo "[INFO] Packaging .vsix → $VSIX_OUT"
(cd "$EXT_DIR" && vsce package --no-dependencies --out "$VSIX_OUT")

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Package ready: dist/vsix/ai-quota-$EXT_VER.vsix  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Auto-install into detected IDEs ─────────────────────────────────────────
INSTALLED=0
for CLI in antigravity code cursor codium; do
    if command -v "$CLI" &>/dev/null; then
        echo "[INFO] Installing into $CLI..."
        "$CLI" --install-extension "$VSIX_OUT" --force && echo "[OK]  Done" && INSTALLED=1
    fi
done

if [ "$INSTALLED" -eq 0 ]; then
    echo "[WARN] No IDE CLI in PATH. Install manually via IDE → Extensions → Install from VSIX"
    echo "       File: $VSIX_OUT"
fi

echo ""
echo "Restart your IDE to activate. Dashboard: http://127.0.0.1:8765"
echo ""
