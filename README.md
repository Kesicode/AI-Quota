<div align="center">

<img src="static/favicon-32x32.png" alt="AI-Quota Logo" width="64" height="64" />

# AI-Quota

**Universal AI Account & Quota Manager**

Monitor, manage, and switch between multiple AI accounts — all from a single local-first dashboard and IDE extension.

[![Tests](https://img.shields.io/badge/tests-59%2F59%20passing-brightgreen?style=flat-square&logo=pytest)](tests/)
[![Extension](https://img.shields.io/badge/extension-v2.0.0-blue?style=flat-square&logo=visual-studio-code)](apps/vscode-extension/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square&logo=python)](https://python.org)
[![Security](https://img.shields.io/badge/security-local--only-orange?style=flat-square)](#security)

[**Quick Start**](#quick-start) · [**Install Extension**](#ide-extension) · [**API Reference**](#api-reference) · [**Architecture**](#architecture) · [**Security**](#security)

</div>

---

## What Is AI-Quota?

AI-Quota is a **local-first agent** that runs on your machine and gives you a single control panel for all your AI provider accounts — Antigravity, Google Cloud Code, Gemini API, GitHub Copilot, OpenAI Codex, and more.

No cloud sync. No telemetry. No secrets ever leave your device.

```
┌─────────────────────────────────────────────────────┐
│  Browser Dashboard  ·  VS Code  ·  Antigravity IDE  │
│         ↓                ↓               ↓          │
│          AI-Quota Agent  (127.0.0.1:8765)           │
│         ↓                ↓               ↓          │
│  Antigravity  ·  Gemini  ·  Copilot  ·  Codex  ...  │
└─────────────────────────────────────────────────────┘
```

---

## ✨ Features

### 🖥️ Web Dashboard — 7 Tabs

| Tab | What it does |
|-----|-------------|
| **Accounts** | Live quota cards — status dot, bar chart, reset timer, switch button |
| **Providers** | Adapter health, detection status, capabilities per provider |
| **History** | Time-series quota history with CSV export |
| **Predictions** | Velocity-based exhaustion ETA, risk level, recommended account |
| **Matrix** | Cross-account × cross-window quota grid with color-coded bars |
| **Settings** | Webhook alerts, auto-sync interval, notification threshold |
| **Diagnostics** | DB info, provider health, agent version |

### 🔌 IDE Extension (VS Code · Antigravity · Cursor · VSCodium)

- **Activity Bar sidebar** with live status dot, prediction chips, inline label editor
- **Status bar** showing `AI-Quota 84% · 1h 42m` — color-coded by urgency
- **Command palette** with 11 commands: Switch Account, Quota Matrix, Sync, Diagnostics…
- **Quota Matrix webview** — rich dark panel with provider chip filters and live refresh
- **Low-quota notifications** with configurable threshold

### ⚙️ Core Engine

- **Multi-provider sync** — Antigravity Hub, Antigravity CLI, Cloud Code, Gemini API, GitHub Copilot, OpenAI Codex, Google Cloud
- **Prediction engine** — velocity-based: consumed rate → exhaustion ETA → reset timing
- **Account switching** — instant (credential swap) with post-switch verification
- **Webhook alerts** — auto-fires after every sync when quota drops below threshold
- **OS-native credential vault** — Windows Credential Manager / macOS Keychain / Secret Service
- **Provider truth separation** — quota values never mixed across providers

---

<a id="quick-start"></a>
## 🚀 Quick Start

### Windows
```bat
run.bat
```

### macOS / Linux
```bash
chmod +x run.sh && ./run.sh
```

### Manual
```bash
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
.venv\Scripts\activate         # Windows

pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

Then open **[http://127.0.0.1:8765](http://127.0.0.1:8765)**

---

<a id="ide-extension"></a>
## 🔌 IDE Extension

### Install from Release (Recommended)

Download `ai-quota-2.0.0.vsix` from the [**latest release**](https://github.com/Kesicode/AI-Quota/releases/latest), then:

```bash
# Antigravity IDE
antigravity --install-extension ai-quota-2.0.0.vsix

# VS Code
code --install-extension ai-quota-2.0.0.vsix

# Cursor
cursor --install-extension ai-quota-2.0.0.vsix

# VSCodium
codium --install-extension ai-quota-2.0.0.vsix
```

Or via IDE UI: **Extensions** (`Ctrl+Shift+X`) → `···` menu → **Install from VSIX…**

### Install via Script (Windows)
```bat
scripts\install_extension.bat
```

### Build from Source
```bash
cd apps/vscode-extension
npm install
npm run build      # production bundle → dist/extension.js
npm run package    # create .vsix
```

### Make It Searchable In-IDE

To appear in the built-in extension search of **Antigravity IDE** and **VS Code**, publish to the registries:

| IDE | Registry | Setup Guide |
|-----|---------|-------------|
| Antigravity · Cursor · VSCodium | [Open VSX](https://open-vsx.org) | Add `OVSX_PAT` secret → auto-publishes on release |
| VS Code (official) | [VS Marketplace](https://marketplace.visualstudio.com) | Add `VSCE_PAT` secret → auto-publishes on release |

See [**docs/MARKETPLACE_PUBLISHING.md**](docs/MARKETPLACE_PUBLISHING.md) for the full step-by-step.

---

<a id="api-reference"></a>
## 📡 API Reference

Base URL: `http://127.0.0.1:8765`  
Interactive docs: [http://127.0.0.1:8765/api/docs](http://127.0.0.1:8765/api/docs)

### Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Agent health, version, uptime |
| `GET` | `/api/v1/accounts` | All accounts with live quota |
| `POST` | `/api/v1/accounts` | Register account |
| `DELETE` | `/api/v1/accounts/{id}` | Remove account |
| `POST` | `/api/v1/accounts/{id}/switch` | Switch to account (verified) |
| `PATCH` | `/api/v1/accounts/{id}/label` | Update label, group, color, notes, priority |
| `GET` | `/api/v1/accounts/{id}/notes` | Get account notes |

### Data & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/quota` | All quotas across accounts |
| `GET` | `/api/v1/matrix` | Cross-account × cross-window quota grid |
| `GET` | `/api/v1/predictions` | Velocity forecasts + recommendation |
| `GET` | `/api/v1/history` | Quota history (filterable by account, period) |
| `GET` | `/api/v1/analytics` | Aggregated usage analytics |
| `GET` | `/api/v1/events` | Recent events log |
| `GET` | `/api/v1/events/stream` | SSE real-time event stream |

### Providers & System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/providers` | All adapters + capabilities + health |
| `POST` | `/api/v1/sync` | Full provider sync |
| `GET` | `/api/v1/diagnostics` | DB info, provider status, agent version |
| `GET` | `/api/v1/settings` | Current settings |
| `PUT` | `/api/v1/settings` | Update settings |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/webhooks/config` | Get webhook configuration |
| `PUT` | `/api/v1/webhooks/config` | Update URL, threshold, enabled flag |
| `POST` | `/api/v1/webhooks/test` | Test webhook delivery |
| `POST` | `/api/v1/webhooks/fire` | Manually fire quota alerts |

---

<a id="architecture"></a>
## 🏗️ Architecture

```
AI-Quota/
├── app/
│   ├── main.py                  # FastAPI app + lifespan
│   ├── routes/
│   │   └── v1.py                # All v1 REST + SSE endpoints
│   ├── services/
│   │   ├── account_service.py   # Account CRUD
│   │   ├── sync_manager.py      # Provider sync + webhook auto-fire
│   │   └── prediction_engine.py # Velocity-based forecasting (via packages/)
│   └── providers/               # Provider adapter implementations
│       ├── antigravity/         # Hub detection, instant switch
│       ├── antigravity_cli/     # CLI-based quota reading
│       ├── cloud_code/          # Google Cloud Code
│       ├── gemini/              # Gemini API
│       ├── codex/               # OpenAI Codex
│       ├── copilot/             # GitHub Copilot
│       └── google_cloud/        # Google Cloud quotas
│
├── packages/
│   ├── core/                    # Switch engine, models, prediction engine
│   ├── database/                # SQLite WAL schema, migrations
│   └── security/                # OS-native credential vault
│
├── static/                      # Web dashboard (Vanilla JS + CSS)
│   ├── index.html               # 7-tab SPA shell
│   ├── app.js                   # All tab logic, matrix, label editor
│   └── dashboard.css            # Design system (Obsidian dark + emerald)
│
├── apps/vscode-extension/       # VS Code / Antigravity IDE extension
│   ├── src/
│   │   ├── extension.ts         # Entry point
│   │   ├── agent_client.ts      # HTTP client + TypeScript interfaces
│   │   ├── commands.ts          # 11 commands + Matrix webview
│   │   ├── status_bar.ts        # Quota status bar item
│   │   └── sidebar/             # Sidebar tree + webview providers
│   └── dist/extension.js        # Production bundle (40.9 KB)
│
├── tests/                       # 59 tests across 5 test files
├── scripts/                     # Package + install scripts
└── docs/                        # Security policy, marketplace guide
```

---

<a id="security"></a>
## 🔒 Security

AI-Quota is built on a strict **Zero Remote Secret Storage** policy:

- **Local-only binding** — always `127.0.0.1`, never `0.0.0.0` unless explicitly configured
- **No credentials in the database** — only opaque `credential_reference` keys; real secrets live in the OS vault
- **No telemetry** — no analytics, no usage tracking, no external HTTP calls except your configured webhooks
- **Switch verification** — a switch is never reported as successful without confirming `activeAccount == requestedAccount`
- **Auto-switch OFF by default** — never switches accounts without explicit user action

See [**SECURITY.md**](SECURITY.md) for the complete policy.

---

<a id="development"></a>
## 🛠️ Development

### Run Tests
```bash
python -m pytest tests/ -v
```

### Add a Provider

Implement `ProviderAdapter` from `packages/core/provider_adapter.py`:

```python
class MyProviderAdapter(ProviderAdapter):
    @property
    def id(self): return "my_provider"

    @property
    def display_name(self): return "My Provider"

    @property
    def supported_clients(self): return ["my-client"]

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(supports_quota=True, supports_switch=False)

    def sync(self) -> dict:
        # Discover accounts, record snapshots, return summary dict
        ...
```

Place in `providers/my_provider/adapter.py` and expose `create_adapter()`. It will be auto-discovered on startup. One provider failure never crashes the others.

---

## 📄 License

MIT © [Kesicode](https://github.com/Kesicode)
