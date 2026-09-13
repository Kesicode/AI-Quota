# AI Quota

**AI Quota** is a local-first dashboard for monitoring multiple AI accounts, quota windows, reset timers, context-token usage, credits, and provider health without storing account passwords or browser cookies.

## Current architecture

- FastAPI backend bound to `127.0.0.1`.
- SQLite history for quota snapshots.
- Account inventory designed for 10–15+ emails.
- Per-account status: live, stale, exhausted, or not connected.
- Live countdowns update every second in the browser.
- Automatic dashboard refresh every 5 seconds.
- Antigravity CLI collector through the provider's supported status-line JSON interface.
- Automatic matching by the email reported by Antigravity.
- Automatic discovery of new Antigravity CLI accounts when their telemetry first appears.
- Last-known quota snapshots are preserved after an account is switched away.
- Separate client fields for Antigravity CLI, Antigravity IDE, VS Code, Copilot, Gemini API, Google Cloud, Codex, and other providers.

## Antigravity workflow

1. Add the emails you use, or add at least one Antigravity CLI account.
2. Click **Enable Antigravity CLI collector** once.
3. Restart Antigravity CLI.
4. Use/switch accounts normally in Antigravity.
5. AI Quota matches the provider-reported email and keeps each account's latest quota/reset data.

The collector is global to the local Antigravity CLI installation; it is not one separate statusline per email. This is intentional: the provider's status-line payload represents the currently authenticated session, while AI Quota stores the historical snapshots for every account it sees.

## Provider truth model

AI Quota does not fabricate quota values. A field is shown only when a provider source supplied it. Otherwise the dashboard shows **Unknown**, **Not connected**, **Stale**, or **Unavailable**.

Antigravity documents `/usage` (alias `/quota`) for model quota information and its status-line payload for fields such as `email`, `plan_tier`, `context_window`, and `quota` entries with `remaining_fraction` and reset information. AI Credits are exposed separately through `/credits`, so credit balance is treated as a distinct data source. See the official Antigravity documentation before extending collectors.

Antigravity CLI and the visual Antigravity IDE are separate product surfaces. The current live collector is specifically for the CLI status-line interface; the IDE is represented in the account model but is not falsely reported as live until a supported telemetry source is implemented.

GitHub Copilot changed to usage-based billing with AI Credits for current plans in 2026, while legacy premium-request documentation applies to certain annual subscribers. Provider adapters therefore remain separate rather than assuming one universal quota model.

## Security

- Never store Google/Gmail passwords.
- Never store browser session cookies.
- Never put API keys or refresh tokens in frontend JavaScript or the SQLite database.
- Keep the server local by default.
- Store only the provider telemetry fields required for quota monitoring.
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

## Next integration order

1. Antigravity CLI quota + context + credits collection.
2. Gemini API project limits and usage.
3. Google Cloud quotas/billing signals.
4. GitHub Copilot usage and AI-credit information where officially exposed.
5. VS Code provider-specific adapters.
6. OpenAI/Codex usage and limits from supported OpenAI surfaces.
7. Alerts, history graphs, export, encrypted local backups, and provider health diagnostics.
