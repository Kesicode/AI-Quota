# Provider integration plan

AI Quota separates the dashboard from provider-specific quota collection. The same field name must never be used to mix unrelated products.

## Data classes

Each provider adapter should report:

- account/project identity
- product/client
- service
- model where applicable
- quota window: 5-hour, hourly, daily, weekly, monthly, or provider-specific
- remaining percentage and/or remaining units
- used units and limit units when exposed
- token counts when exposed
- reset timestamp
- credit balance when exposed
- plan/subscription information when exposed
- source and capture timestamp
- confidence: authoritative, provider-UI-derived, calculated, or unavailable

## Provider policy

1. Prefer official APIs or documented CLIs.
2. If a value is only visible in an official UI, mark it as UI-derived and do not substitute another product's number.
3. Never collect passwords or browser session cookies.
4. Keep OAuth/API credentials out of SQLite and the frontend; use the OS credential store.
5. Do not implement automatic account rotation to bypass provider limits.
6. Every displayed number must retain product identity, source and timestamp.

## Priority adapters

### Cloud Code / Cloud Shell — primary priority
Google documents a default weekly Cloud Code/Cloud Shell usage quota of 50 hours. Current remaining hours and reset information are shown from the Cloud Shell session information Usage quota UI. AI Quota should therefore treat Cloud Code weekly usage as **provider-UI-derived** until a supported machine-readable source is available.

Do not use Gemini API rate limits, Gemini Code Assist quotas, or Google Cloud project quotas as a substitute for this value.

### Google Cloud project quotas
Use supported Cloud Quotas APIs or `gcloud quotas info` surfaces. Preserve project ID/number, Google Cloud service name, quota ID, dimensions and limit/usage information. These values belong to the Cloud project/service, not to Cloud Code's weekly allowance.

### OpenAI / Codex
Use supported OpenAI/Codex usage surfaces. ChatGPT-plan Codex usage can have plan-dependent 5-hour/weekly allowances, reset information and credits. OpenAI API limits/usage must remain a separate adapter and separate product identity.

### Google Antigravity
Capture model quota, weekly and five-hour windows, reset information, context usage and credits where supported by the official client surfaces.

### Gemini / Gemini API
Track project/model limits such as requests per minute, tokens per minute, requests per day and model-specific limits where exposed by the API/project configuration. Keep project identity separate from Google login identity.

### GitHub Copilot
Use supported GitHub/Copilot surfaces where available. Keep current usage/AI-credit information separate from GitHub API rate limits.

### VS Code
Treat VS Code as a host. The quota authority depends on the installed AI extension/provider. Never claim that VS Code itself owns the quota.

## Current implementation rule

A provider is not shown as live merely because it exists in the account registry. Unsupported collectors must stay **not connected / unavailable** until an authoritative source is implemented.
