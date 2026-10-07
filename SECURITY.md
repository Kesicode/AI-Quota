# Security Policy — AI-Quota

## Core Principles

### 1. Local-only binding
The agent binds to `127.0.0.1` by default. It **never** binds to `0.0.0.0` or a public interface unless the user explicitly sets `bind_host` in Settings.

### 2. Zero remote secret storage
AI-Quota never sends passwords, cookies, OAuth tokens, API secrets, or session keys to any remote server — including its own backend database.

### 3. OS-native credential vault
When account switching requires storing credentials, they are stored in the **OS-native vault**:
- **Windows**: Windows Credential Manager (via `keyring`)
- **macOS**: Keychain
- **Linux**: SecretService / libsecret

SQLite stores only an opaque `credential_reference` string — never the secret itself.

### 4. Never mix quota sources
Provider quota data is always labelled with its `authority_type` and `source`. The dashboard never aggregates:
- Gemini API RPM + Antigravity quota + Google Cloud project quota

into a fake "overall AI quota". They remain separate at all times.

### 5. Switch verification
An account switch is **never reported as successful** until the agent independently verifies that `activeAccount.account_id == requestedAccountId`. Unverified switches are reported as `verification_failed`.

### 6. Auto-switch is OFF by default
Automatic account switching is disabled by default. Users must explicitly enable it in Settings. Even when enabled, switches are rate-limited (default: 10/hour, 30s cooldown).

### 7. Dashboard warning
The dashboard always shows:
> "Never enter passwords, browser cookies, session tokens or API keys into this dashboard."

## What to Report

If you discover a vulnerability, please report it privately to the maintainer before disclosing publicly.

Issues that apply:
- Secret exposure via logs, API responses, or error messages
- SSRF or injection via provider endpoints
- Credential vault bypass
- Switch verification bypass
