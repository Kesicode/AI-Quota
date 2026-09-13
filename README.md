# AI Quota

**AI Quota** is a local-first dashboard for monitoring AI quotas, credits, usage, and reset windows across developer AI services.

## What is implemented now

- Local FastAPI backend bound to `127.0.0.1`.
- Dark responsive dashboard.
- Account metadata management for multiple accounts.
- SQLite history for quota snapshots.
- Live reset countdowns in the browser.
- Source/capture timestamps for quota records.
- Windows `run.bat` launcher.
- Git protection for local databases, secrets, environments, and logs.
- Provider adapter plan covering Antigravity, Gemini, Google Cloud, Copilot, VS Code AI providers, and OpenAI/Codex.

## Important: provider data is not invented

The dashboard does not fabricate quota values. A provider adapter must collect each value from an authoritative API, documented CLI, or another explicitly supported provider surface. If a provider does not expose a value programmatically, AI Quota should show **Unavailable** or **UI-only** instead of guessing.

For example, Antigravity documents `/usage` (also `/quota`) as the CLI command for model quota usage and says the panel shows remaining requests/tokens. Antigravity also documents baseline quota, five-hour/weekly behavior by plan, and AI-credit overages. Those provider-specific fields are therefore part of the integration target, but they should be collected through supported mechanisms rather than by stealing browser sessions. 

Gemini API limits are a different system: Google documents RPM, TPM, RPD and model-specific limits, with limits applied per project. AI Quota therefore keeps Gemini API projects separate from Antigravity subscription accounts.

## Security rules

- Never store Gmail/Google passwords.
- Never store browser session cookies or authentication cookies.
- Never put API keys or refresh tokens in frontend JavaScript or SQLite.
- Use the OS credential store for secrets when a provider integration requires them.
- Bind the server to localhost by default.
- Keep telemetry and third-party analytics disabled by default.
- Never implement automatic account rotation to bypass provider limits.

## Run on Windows

```bat
run.bat
```

Then open `http://127.0.0.1:8765`.

Or manually:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

## Planned integration order

1. Antigravity quota/credits collection using supported local surfaces.
2. Gemini API project limits and usage.
3. Google Cloud quotas and billing/credit signals.
4. GitHub Copilot usage/plan information where officially exposed.
5. VS Code provider detection and provider-specific adapters.
6. OpenAI/Codex usage and limits from supported OpenAI surfaces.
7. Alerts, history graphs, export, encrypted local backups, and health monitoring.
