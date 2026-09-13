# AI Quota

A local-first dashboard for monitoring AI quotas, credits, usage, and reset windows across developer AI services.

## Goals

- Track multiple accounts without storing passwords or browser cookies.
- Show provider/model quota state, remaining percentage, reset countdowns, credits, and usage history.
- Clearly distinguish authoritative provider data from estimates or unavailable fields.
- Keep sensitive credentials local and isolated from the browser UI.

## Planned providers

- Google Antigravity
- Gemini / Gemini API
- Google Cloud
- GitHub Copilot
- VS Code-related AI services
- OpenAI / Codex
- Other providers through adapters

## Security

AI Quota is designed as a local application. Credentials should use OS credential storage where possible and must never be committed to Git.

## Status

Initial repository bootstrap. The implementation will be added in incremental, provider-specific modules.
