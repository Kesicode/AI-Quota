<div align="center">

<img src="media/icon.png" alt="AI-Quota" width="160" height="160" />

# AI-Quota

**Universal AI Account & Quota Manager**

Monitor AI usage, switch accounts, and track quota across every provider — directly inside your IDE.

[![Version](https://img.shields.io/badge/version-2.0.1-blue?style=flat-square)](https://github.com/Kesicode/AI-Quota/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Requirements

The extension connects to the **AI-Quota local agent** which must be running on your machine.

**Start the agent:**
```bash
# Windows
run.bat

# macOS / Linux
./run.sh
```

The agent binds to `http://127.0.0.1:8765`. The extension connects automatically.

---

## Installation

### From GitHub Release
Download `ai-quota.vsix` (or `ai-quota-2.0.1.vsix`) from the [latest release](https://github.com/Kesicode/AI-Quota/releases/latest):

```bash
antigravity --install-extension ai-quota.vsix   # Antigravity IDE
code        --install-extension ai-quota.vsix   # VS Code
cursor      --install-extension ai-quota.vsix   # Cursor
codium      --install-extension ai-quota.vsix   # VSCodium
```

Or via UI: **Extensions** (`Ctrl+Shift+X`) → `···` → **Install from VSIX…**

---

## Features

### Activity Bar Sidebar
- **Live status dot** — green (live) / amber (stale) / grey (offline)
- **Prediction chips** — risk level, trend arrow, velocity, exhaustion ETA
- **Account cards** — provider badge, best quota %, reset countdown
- **Inline label editor** — rename, tag, and color-code accounts without leaving the IDE
- **Recommendation banner** — highlights the best account to switch to

### Status Bar
Shows your current quota health at a glance:

```
AI-Quota  84%  ·  1h 42m
```

Color-coded: 🟢 healthy · 🟡 low · 🔴 critical

### Command Palette (`Ctrl+Shift+P`)

| Command | Description |
|---------|-------------|
| `AI-Quota: Open Dashboard` | Open the full browser dashboard |
| `AI-Quota: Switch Account` | Quick-pick switcher with verification |
| `AI-Quota: Show Quota Matrix` | Rich cross-provider quota grid panel |
| `AI-Quota: Sync Quota Data` | Manually trigger a full sync |
| `AI-Quota: Show Diagnostics` | Inspect agent health and provider status |
| `AI-Quota: Save Current Account` | Register a new account |
| `AI-Quota: Show Status` | Quick status summary notification |

### Quota Matrix Panel
A rich webview panel showing **all accounts × all quota windows**:
- Color-coded cells: 🟢 ≥ 60% · 🔵 ≥ 30% · 🟡 ≥ 15% · 🔴 < 15%
- Mini quota bar per cell + reset countdown timer
- Provider chip filters (All / per-provider)
- Summary stats: total accounts, live count, avg quota, top account
- **Live refresh** — re-fetches data from the agent without reopening

---

## Security

All quota data stays on your device. The extension only communicates with `http://127.0.0.1:8765` — your local AI-Quota agent. No credentials, tokens, or usage data are ever sent anywhere else.

---

## Source & Issues

[**github.com/Kesicode/AI-Quota**](https://github.com/Kesicode/AI-Quota) · [Report an issue](https://github.com/Kesicode/AI-Quota/issues)
