# Provider integration plan

AI Quota intentionally separates the dashboard from provider-specific quota collection.

## Data classes

Each provider adapter should report:

- account identity (masked in logs)
- service
- model
- quota window: 5-hour, hourly, daily, weekly, monthly, or provider-specific
- remaining percentage and/or remaining units
- used units and limit units when exposed
- token counts when the provider exposes them
- reset timestamp
- credit balance when exposed
- plan/subscription information when exposed
- source and capture timestamp
- confidence: authoritative, provider-UI-derived, calculated, or unavailable

## Provider policy

1. Prefer official APIs or documented CLIs.
2. If a value is only visible in an official UI, make that limitation explicit rather than pretending it is an API value.
3. Never collect passwords or browser session cookies.
4. Keep OAuth/API credentials out of SQLite and the frontend; use the OS credential store.
5. Do not implement automatic account rotation for bypassing provider limits.
6. Every displayed number should have a source label and timestamp.

## Planned adapters

### Google Antigravity
Capture model quota, weekly and five-hour windows, reset information, and credits where the official client exposes them. The UI should support provider-specific windows rather than assuming every account has the same limits.

### Gemini / Gemini API
Track project/model limits such as requests, tokens, and daily windows where exposed by the API/project configuration. Keep project identity separate from Google login identity.

### Google Cloud
Track service/project quotas and billing/credit signals that are available through supported Google Cloud APIs. Do not imply that a Cloud project quota is the same thing as an Antigravity subscription quota.

### GitHub Copilot
Use supported GitHub/Copilot surfaces where available. Keep plan usage separate from GitHub API rate limits.

### VS Code
Treat VS Code as a host. The actual quota authority depends on the installed AI extension/provider, so the adapter must identify the provider instead of claiming that VS Code itself owns the quota.

### OpenAI / Codex
Track usage and limits only from supported OpenAI surfaces/APIs available to the user. Never scrape private sessions or store browser cookies.
