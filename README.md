# AI Quota

**AI Quota** is a clean, reliable, local-first, multi-account AI quota monitoring application for Windows. It provides a single unified dashboard to track multiple AI and developer-tool accounts, quota windows, reset timers, context-token usage, credits, and provider health without storing account passwords, API keys, or browser session cookies.

---

## Core Principles: Provider Truth & Separation

AI Quota enforces strict separation between different providers and quota authorities:

1. **Cloud Code / Cloud Shell $\neq$ Gemini API $\neq$ Google Cloud Project Quotas**:
   - Cloud Code has a default **50-hour weekly usage quota** visible in Cloud Shell's session information UI.
   - AI Quota labels Cloud Code as **official UI-derived**.
   - It **never** substitutes Gemini API limits or GCP project quotas for Cloud Code weekly hours.
2. **OpenAI API Limits $\neq$ Codex Usage**:
   - Codex usage under ChatGPT plans (e.g. 5-hour and weekly allowances) is strictly separate from OpenAI developer API rate limits.
3. **Antigravity CLI $\neq$ Antigravity 2.0**:
   - Antigravity CLI uses statusline JSON telemetry.
   - Antigravity 2.0 connects directly to the local desktop language server.
   - Both are tracked as independent clients.
4. **No Fake Numbers**:
   - Quotas are only displayed when an authoritative source provides them. Missing data is shown honestly as **Not connected**, **Unknown**, **Stale**, or **Unavailable**—never as an invented `0%`.
   - A configured allowance (e.g., 50h weekly) is labeled as an allowance, not as "remaining" hours unless confirmed.

---

## Provider Status

| Product / Client | Implementation Status | Authority Classification | Source Mechanism |
| :--- | :--- | :--- | :--- |
| **Antigravity 2.0** | **Live Collection** | `provider-local` | Local language server JSON-RPC (`Win32_Process` discovery) |
| **Antigravity CLI** | **Live Collection** | `cli-local` | Status-line bridge telemetry (`~/.gemini/antigravity-cli`) |
| **Cloud Code / Cloud Shell** | **Official UI-derived** | `official_ui_derived` | Official 50h weekly allowance documented in Cloud Shell UI |
| **OpenAI / Codex** | **Planned** | `provider_surface` | Planned for supported OpenAI/Codex usage surfaces |
| **Google Cloud quotas** | **Planned** | `official_api_derived` | Planned for Cloud Quotas API / `gcloud quotas info` |
| **Gemini API** | **Planned** | `official_api_derived` | Planned for project RPM/TPM/RPD limits |
| **GitHub Copilot** | **Planned** | `provider_surface` | Planned for Copilot subscription telemetry |
| **VS Code** | **Host Only** | `host_client` | Host environment; quota belongs to installed extension |

For detailed specifications, see [`docs/provider-status.md`](docs/provider-status.md) and [`docs/architecture.md`](docs/architecture.md).

---

## Architecture & Features

- **FastAPI Backend**: Bound exclusively to `127.0.0.1:8765`.
- **Lightweight Local SQLite**: Persistent storage for accounts, historical quota snapshots, and ignored accounts.
- **Provider Adapter Architecture**: Fully isolated adapters implementing `ProviderAdapter`. If one provider encounters an error, other providers continue unaffected.
- **Independent Account Registry**: Account creation (`POST /api/accounts`) and deletion are completely non-blocking and never depend on live provider collectors.
- **Unified Frontend**: Single, authoritative state-driven renderer (`static/app.js`) with:
  - 1-second in-place countdown updates.
  - 5-second background polling of cached dashboard data (`/api/dashboard?sync=false`).
  - Native HTML `<dialog>` modals with click-outside-to-close, Escape key, and browser history synchronization.
  - Smart summary and data-driven recommendations comparing only compatible quota dimensions.

---

## Security & Privacy Boundary

- **Local-Only**: The server binds only to `127.0.0.1`.
- **No Credentials Stored**: Never enter passwords, browser cookies, OAuth tokens, or API keys into AI Quota.
- **Sanitized Logging**: Local logs automatically redact bearer tokens, API keys, passwords, and cookies.
- **No Abuse**: AI Quota is designed for personal quota visibility. It never automates account rotation to bypass provider limits.

---

## Setup & Running on Windows

### Option 1: One-Click Run
```bat
run.bat
```
Then open `http://127.0.0.1:8765` in your browser.

### Option 2: Manual Setup
```powershell
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server
python -m app.main
```

---

## Running Tests

AI Quota includes automated tests covering database operations, provider isolation, duplicate detection, and API endpoints:

```powershell
python -m pytest tests/ -v
```

---

## Project Structure

```
AI-Quota/
├── app/
│   ├── main.py                   # FastAPI app, API routing, server startup
│   ├── database.py               # SQLite session, schema init, safe migrations
│   ├── models.py                 # Pydantic v2 data models
│   ├── providers/                # Provider Adapter implementations
│   │   ├── base.py               # ProviderAdapter abstract base class & ProviderTruth
│   │   ├── cloud_code.py         # Cloud Code / Cloud Shell adapter
│   │   ├── antigravity_2.py      # Antigravity 2.0 local language server probe
│   │   ├── antigravity_cli.py    # Antigravity CLI statusline bridge adapter
│   │   ├── codex.py              # OpenAI / Codex adapter
│   │   ├── gemini.py             # Gemini API adapter
│   │   ├── google_cloud.py       # Google Cloud project quotas adapter
│   │   ├── copilot.py            # GitHub Copilot adapter
│   │   └── vscode.py             # VS Code host adapter
│   ├── services/                 # Core business services
│   │   ├── account_service.py    # Account CRUD, normalization, duplicate check
│   │   ├── snapshot_service.py   # Snapshot recording & window querying
│   │   └── sync_manager.py       # Isolated fault-tolerant provider sync
│   └── utils/
│       ├── time.py               # ISO timestamp, countdown, and duration helpers
│       └── logging.py            # Sanitized logger
├── static/
│   ├── index.html                # Semantic HTML5 dashboard layout
│   ├── app.js                    # Unified state-driven frontend
│   ├── dashboard.css             # Main layout & responsive styles
│   ├── ui.css                    # Component styles (cards, recommendations)
│   └── provider.css              # Provider badges and status chips
├── docs/
│   ├── architecture.md           # Master architecture documentation
│   ├── provider-status.md        # Explicit provider operational matrix
│   └── PROVIDER-PLAN.md          # Provider truth guidelines
├── tests/
│   ├── conftest.py               # Test database fixtures
│   ├── test_database.py          # Account & snapshot SQLite tests
│   ├── test_providers.py         # Provider isolation & truth tests
│   └── test_api.py               # API route integration tests
├── requirements.txt
├── pyproject.toml
└── run.bat
```
