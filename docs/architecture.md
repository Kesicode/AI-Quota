# AI Quota — Architecture

## 1. Master Application Overview

**AI Quota** is a local-first, multi-account quota monitoring system designed for Windows. It provides a single unified dashboard to track multiple personal AI developer accounts across diverse services:
- Google Cloud Code / Cloud Shell (Primary priority)
- Antigravity 2.0 (Desktop Language Server)
- Antigravity CLI (Status-line telemetry)
- OpenAI / Codex (ChatGPT-plan usage)
- Google Cloud (Project/service quotas)
- Google Gemini API (RPM, TPM, RPD)
- GitHub Copilot (Subscription usage and AI credits)
- VS Code (Host environment)

---

## 2. Core Architectural Principles

### Source Truth Must Never Be Mixed
Every quota number displayed belongs strictly to:
$$\text{Provider} + \text{Client/Product} + \text{Account/Project} + \text{Quota Window} + \text{Source}$$

- **Gemini $\neq$ Cloud Code**: Gemini API rate limits (RPM/TPM) are project-scoped and must never be displayed as Cloud Code weekly usage.
- **Google Cloud $\neq$ Cloud Code**: GCP project and service quotas (Cloud Quotas) are separate from the 50-hour Cloud Shell session quota.
- **OpenAI API $\neq$ Codex**: API rate limits and billing tiers are strictly isolated from Codex usage under ChatGPT plans.
- **Antigravity CLI $\neq$ Antigravity 2.0**: The CLI collector and Desktop local language server report through different mechanisms and remain separate client identities.
- **Allowance $\neq$ Remaining Usage**: A configured weekly allowance (e.g. 50 hours) is a limit. It is never displayed as "remaining" unless an authoritative provider source explicitly states so.

### Decoupled Account Registry
Account creation and deletion are completely decoupled from provider synchronization. When a user adds an account:
1. Input is validated and normalized.
2. Duplicate checks are performed locally in SQLite.
3. The account is saved with status `not_connected`.
4. The API returns immediately without blocking on network requests, subprocess probes, or background sync.

---

## 3. Provider Adapter Architecture

All providers implement the `ProviderAdapter` abstract base class (`app/providers/base.py`):

```python
class ProviderAdapter(ABC):
    id: str
    display_name: str
    supported_clients: list[str]
    truth: ProviderTruth

    def can_handle(self, provider: str, client: str) -> bool: ...
    def sync(self) -> dict[str, Any]: ...
    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]: ...
    def health(self) -> dict[str, Any]: ...
```

### Provider Truth Model
Each adapter declares its authority and collection capability:
- `official_ui_derived`: Information visible in the provider's official user interface (e.g., Cloud Shell Session Info).
- `official_api_derived`: Authoritative public APIs or official CLI commands (e.g., `gcloud quotas info`, Gemini API).
- `provider_local` / `local_language_server`: Direct local communication with running desktop services (e.g., Antigravity 2.0 via local JSON-RPC).
- `cli_local`: Local telemetry emitted by developer CLI tools via standard output or statusline hooks (e.g., Antigravity CLI bridge).
- `provider_surface`: Official provider dashboards or client usage surfaces.
- `host_client`: Host environment (e.g., VS Code) where quota belongs to the installed provider extension.

### Fault-Tolerant Isolated Sync Flow (`SyncManager`)
Provider synchronization is executed in complete isolation:
```
User clicks "Sync now" or background job runs
  ├── Sync Cloud Code Adapter        ──> Success / Caught error
  ├── Sync Antigravity 2.0 Adapter   ──> Success / Caught error
  ├── Sync Antigravity CLI Adapter   ──> Success / Caught error
  ├── Sync Codex Adapter             ──> Success / Caught error
  ├── Sync Gemini Adapter            ──> Success / Caught error
  ├── Sync Google Cloud Adapter      ──> Success / Caught error
  └── Sync Copilot Adapter           ──> Success / Caught error
      └── Return combined summary (Changed, Matched, Discovered)
```
If one adapter encounters an error or service unavailability, other adapters continue unaffected.

---

## 4. Database Schema & Data Flow

AI Quota uses a local SQLite database (`data/ai_quota.db`) with WAL mode and foreign key constraints enabled.

### Schema Design

1. **`accounts`**:
   - `id`: Integer Primary Key
   - `email`: Normalized email or project ID (lowercased, trimmed)
   - `provider`: Provider name (e.g., `Cloud Code`, `Antigravity`, `OpenAI / Codex`)
   - `client`: Specific client surface (e.g., `Cloud Code / Cloud Shell`, `Antigravity 2.0`, `Codex`)
   - `display_name`: User-friendly label
   - `status`: `live` | `stale` | `not_connected` | `exhausted`
   - `plan_tier`: Reported subscription plan (e.g., `Pro`, `Free`)
   - `last_seen_at`: ISO timestamp of latest telemetry
   - `last_error`: Sanitized error message if collection failed
   - `credits_remaining`: Reported balance if available
   - `source_kind`: `manual` vs `auto_discovered`

2. **`quota_snapshots`**:
   - `id`: Integer Primary Key
   - `account_id`: Foreign Key referencing `accounts(id)` ON DELETE CASCADE
   - `service`: Service name
   - `client`: Client product name
   - `model`: Specific model or bucket (e.g., `Gemini Models`, `Context Window`)
   - `window_name`: `Weekly Limit` | `Five Hour Limit` | `Daily Limit` | `Context Window`
   - `remaining_percent`: Float 0.0 to 100.0
   - `used_units`: Units consumed
   - `limit_units`: Total unit ceiling
   - `unit`: Measurement unit (e.g., `hours`, `tokens`, `provider quota`)
   - `reset_at`: Absolute ISO timestamp of quota reset
   - `source`: Collector identifier
   - `captured_at`: ISO timestamp

3. **`ignored_accounts`**:
   - `email`, `provider`, `client`: Composite Primary Key
   - `ignored_at`: ISO timestamp
   - **Purpose**: When a user deletes an account, it is entered into this table. Auto-discovery probes inspect this table to prevent deleted accounts from immediately resurrecting.

---

## 5. Frontend Architecture

The frontend is implemented as a single, authoritative script (`static/app.js`) with zero external runtime dependencies:
- **Unidirectional State Flow**:
  $$\text{State} \longrightarrow \text{Filter / Sort} \longrightarrow \text{Authoritative DOM Render}$$
- **Real-Time Countdown Engine**: A 1-second interval recalculates reset timers from absolute ISO timestamps and updates `[data-reset]` nodes in place without re-rendering the DOM tree.
- **Background Polling**: A 5-second interval queries `/api/dashboard?sync=false` to read cached state without triggering heavy subprocess or network probes.
- **Modal & History Controller**: Native HTML `<dialog>` elements handled predictably:
  - Outside backdrop click closes the dialog.
  - Native `Escape` key closes the dialog.
  - Browser `Back` / `Forward` buttons navigate modal states cleanly via `history.pushState` and `popstate`.
- **Smart Recommendations**:
  - Compares only compatible quota dimensions.
  - Explains the exact reason for recommendations (e.g., `"82% remaining · Weekly Limit"`).
  - Shows the next fastest renewal countdown across all registered accounts.

---

## 6. Local Security Boundary

1. **Host Binding**: Binds exclusively to `127.0.0.1:8765`. Never binds to `0.0.0.0`.
2. **Zero Plaintext Secrets**: Passwords, browser cookies, session tokens, and API secrets are never stored in SQLite or passed to frontend JavaScript.
3. **Sanitized Logging**: All log messages pass through regex filters that redact bearer tokens, passwords, cookies, and secret keys.
4. **Local Subprocess Safety**: Process inspection runs with non-interactive flags, execution policy bypasses, and explicit execution timeouts.
