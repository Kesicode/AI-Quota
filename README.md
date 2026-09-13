# AI Quota

**AI Quota** is a local-first dashboard for monitoring multiple AI and developer-tool accounts, quota windows, reset timers, context-token usage, credits, and provider health without storing account passwords or browser cookies.

## Important provider separation

The dashboard deliberately treats **Cloud Code / Cloud Shell, Google Cloud project quotas, Gemini API, OpenAI/Codex, Antigravity, and GitHub Copilot as different products and different quota authorities**.

This matters because a Gemini number is not a Cloud Code number, a Google Cloud project quota is not a Cloud Code weekly allowance, and a Codex usage allowance is not the OpenAI API rate limit.

### Cloud Code is the primary priority

Cloud Code for Cloud Shell currently has a default **50-hour weekly usage quota**. Google documents the current remaining hours and reset timestamp through the Cloud Shell session information → Usage quota UI. AI Quota therefore labels Cloud Code as **official UI-derived** unless a supported machine-readable source becomes available. It must never substitute Gemini or Google Cloud project values for this allowance.

### Google Cloud quotas are separate

Google Cloud project/service quotas are managed through Cloud Quotas and supported APIs/`gcloud` surfaces. These quotas are project/service specific and are a different data class from Cloud Code's weekly hours.

### Codex is separate from the OpenAI API

Codex usage with a ChatGPT plan is plan-dependent and may expose 5-hour/weekly usage allowances, reset information, and credits through supported OpenAI surfaces. OpenAI API usage/rate limits are separate and must not be merged with Codex usage.

## Current architecture

- FastAPI backend bound to `127.0.0.1`.
- SQLite history for quota snapshots.
- Account inventory designed for 10–15+ identities.
- Per-account status: live, stale, exhausted, or not connected.
- Live countdowns update every second in the browser.
- Automatic dashboard refresh every 5 seconds.
- Antigravity CLI collector through the provider's supported status-line JSON interface.
- Antigravity 2.0 local collector through its supported local quota surface.
- Automatic matching by provider-reported account identity where supported.
- Last-known quota snapshots are preserved after an account is switched away.
- Provider/client records remain separate so unsupported products are not falsely shown as live.

## Provider truth model

AI Quota does not fabricate quota values. A field is shown only when a provider source supplied it. Otherwise the dashboard shows **Unknown**, **Not connected**, **Stale**, or **Unavailable**.

Every number should retain:

- product/client identity
- account or project identity
- source
- capture timestamp
- confidence/authority type

## Security

- Never store Google/Gmail passwords.
- Never store browser session cookies.
- Never put API keys or refresh tokens in frontend JavaScript or the SQLite database.
- Keep the server local by default.
- Store only provider telemetry required for monitoring.
- Keep local databases, telemetry, logs, and environment files out of Git.
- Never automate account rotation to bypass provider limits.

## Run on Windows

```bat
run.bat
```

Open `http://127.0.0.1:8765`.

Or manually:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

## Collector status

| Product | Current live collector | Important limitation |
|---|---|---|
| Cloud Code / Cloud Shell | Not yet machine-readable in this app | Official weekly quota is currently UI-visible; do not substitute Gemini/Cloud project data |
| Google Cloud project quotas | Planned | Project/service quotas are separate from Cloud Code |
| Codex | Planned | Use supported OpenAI/Codex usage surfaces; do not scrape private sessions |
| Gemini API | Planned | Limits are project/model dependent |
| GitHub Copilot | Planned | Current plans use usage/AI-credit concepts that vary by plan |
| VS Code | Host only | Actual quota authority comes from the installed provider extension |
| Antigravity CLI | Live | Uses supported status-line telemetry |
| Antigravity 2.0 | Live | Uses local quota service when available |

The UI intentionally reflects this table instead of pretending all providers are live.
