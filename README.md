# AI-Quota

**Universal AI Account & Quota Manager**

Monitor AI usage and quotas, manage multiple AI accounts, detect installed AI clients, integrate directly into your IDE, and switch between accounts — all from a single local-first dashboard.

---

## Features

| Feature | Status |
|---|---|
| Multi-account quota dashboard | ✅ Live |
| Antigravity / AGY adapter (hub detection, 5h + weekly) | ✅ Live |
| Antigravity CLI adapter | ✅ Live |
| Cloud Code / Gemini / Codex / Copilot adapters | ✅ Live |
| Provider truth separation (no metric mixing) | ✅ Live |
| Account switching — Instant (Windows) + Assisted fallback | ✅ Live |
| Switch verification (`activeAccount == requestedAccount`) | ✅ Live |
| OS-native credential vault (keyring / Windows Credential Manager) | ✅ Live |
| v1 REST API (`/api/v1/`) with SSE event stream | ✅ Live |
| VS Code / Antigravity IDE extension | ✅ Scaffold |
| History tab with Canvas chart | ✅ Live |
| Settings tab (save/load via API) | ✅ Live |
| Diagnostics tab (provider health, DB info) | ✅ Live |
| Providers tab (capabilities, detection status) | ✅ Live |

---

## Quick Start

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
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

Dashboard: [http://127.0.0.1:8765](http://127.0.0.1:8765)
API docs: [http://127.0.0.1:8765/api/docs](http://127.0.0.1:8765/api/docs)

---

## Architecture

```
Web Dashboard / VS Code Extension
        ↓
  FastAPI Agent (127.0.0.1:8765)
        ↓
  packages/core/          ← Core engine (switch, sync, models)
  packages/database/      ← SQLite v2 schema + migrations
  packages/security/      ← OS-native credential vault
        ↓
  Provider Adapters
  ├── providers/antigravity/     ← Hub detection, instant switch
  ├── app/providers/antigravity_cli/
  ├── app/providers/codex/
  ├── app/providers/gemini/
  ├── app/providers/cloud_code/
  ├── app/providers/copilot/
  └── app/providers/google_cloud/
```

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET  /api/v1/health` | Agent health + version |
| `GET  /api/v1/accounts` | All registered accounts with quota |
| `POST /api/v1/accounts` | Register a new account |
| `DELETE /api/v1/accounts/{id}` | Remove account |
| `POST /api/v1/accounts/{id}/switch` | Switch to account (instant/assisted) |
| `POST /api/v1/accounts/{id}/refresh` | Force refresh for one account |
| `GET  /api/v1/providers` | All provider adapters + capabilities |
| `GET  /api/v1/providers/{id}/health` | Provider health check |
| `GET  /api/v1/quota` | All account quotas |
| `POST /api/v1/sync` | Trigger full sync |
| `GET  /api/v1/history/{id}?period=7d` | Quota history (24h/7d/30d) |
| `GET  /api/v1/events` | Recent events |
| `GET  /api/v1/events/stream` | SSE real-time event stream |
| `GET  /api/v1/diagnostics` | Agent diagnostics |
| `GET  /api/v1/settings` | Current settings |
| `PUT  /api/v1/settings` | Update settings |

Legacy endpoints (`/api/accounts`, `/api/dashboard`, `/api/sync`, etc.) remain fully operational.

---

## VS Code / Antigravity IDE Extension

Located in `apps/vscode-extension/`.

### Build
```bash
cd apps/vscode-extension
npm install
npm run build        # production bundle → dist/extension.js
npm run dev          # watch mode
npm run package      # create .vsix
```

### Features
- **Activity Bar** sidebar: Quota view, Accounts tree, Providers tree
- **Status Bar**: `AI-Quota 84% · 1h42m` (color-coded)
- **Command Palette**: 11 commands including Switch Account, Quota Matrix, Diagnostics
- **Quick picker**: switch accounts with verification display
- **Low quota notifications**: configurable threshold alerts
- **SSE polling**: real-time updates from the local agent

---

## Security

- Binds to `127.0.0.1` only — never `0.0.0.0` unless explicitly configured
- **Zero remote secret storage**: credentials never leave the device
- Passwords, cookies, API keys, OAuth tokens are **never** stored in SQLite
- Only opaque `credential_reference` keys stored in DB — actual secrets in OS vault
- Account switching verification: never reports success without `activeAccount == requestedAccount`
- Auto-switch is **OFF** by default

See [SECURITY.md](SECURITY.md) for full details.

---

## Development

```bash
# Run tests
python -m pytest tests/ -v

# Start with auto-reload
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

---

## Provider SDK

To add a new provider, implement `ProviderAdapter` from `packages/core/provider_adapter.py`:

```python
class MyProviderAdapter(ProviderAdapter):
    @property
    def id(self): return "my_provider"
    @property
    def display_name(self): return "My Provider"
    @property
    def supported_clients(self): return ["my provider", "my client"]
    @property
    def truth(self): return ProviderTruth(key="my_provider", ...)
    def capabilities(self): return ProviderCapabilities(supports_quota=True)
    def sync(self): ...
    def connect_account(self, account): ...
```

Place the adapter in `providers/my_provider/adapter.py` and expose `create_adapter()`. It will be auto-discovered on startup.

---

## License

MIT © Kesicode
