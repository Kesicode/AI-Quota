# AI Quota — Provider Status Matrix

This document defines the exact operational status of each provider and client in AI Quota.

AI Quota adheres strictly to the **Provider Truth Model**: if a machine-readable, authoritative source is not yet implemented, the provider is marked honestly as **MANUAL/LAST-KNOWN ONLY** or **PLANNED** rather than faking values.

---

## Provider Implementation Status

| Provider / Product | Client Name | Current Status | Authority Classification | Source Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Antigravity 2.0** | `Antigravity 2.0` | **LIVE COLLECTION** | `provider-local` (local language server) | Windows process discovery (`Win32_Process`), local TCP port detection, local JSON-RPC endpoints (`RetrieveUserQuotaSummary`, `GetUserStatus`). |
| **Antigravity CLI** | `Antigravity CLI` | **LIVE COLLECTION** | `cli-local` (status-line telemetry) | Python bridge script installed in `~/.gemini/antigravity-cli/settings.json`. Telemetry written to `data/antigravity-status/{email_hash}.json`. |
| **Cloud Code / Cloud Shell** | `Cloud Code / Cloud Shell` | **OFFICIAL UI-DERIVED** | `official_ui_derived` | Official 50-hour weekly quota is documented in Cloud Shell Session Information UI. AI Quota preserves last-known snapshots and displays allowance without faking live remaining hours. |
| **OpenAI / Codex** | `Codex` | **PLANNED / LAST-KNOWN ONLY** | `supported provider surface` | Planned for supported OpenAI/Codex client surfaces. Strictly separated from OpenAI API rate limits. |
| **Google Cloud** | `Google Cloud quotas` | **PLANNED / LAST-KNOWN ONLY** | `official_api_derived` | Planned for Cloud Quotas API and `gcloud quotas info`. Quotas remain scoped to GCP project/service and are never mixed with Cloud Code. |
| **Gemini API** | `Gemini API` | **PLANNED / LAST-KNOWN ONLY** | `official_api_derived` | Planned for Gemini API project limits (RPM, TPM, RPD). Strictly separated from Cloud Code. |
| **GitHub Copilot** | `GitHub Copilot` | **PLANNED / LAST-KNOWN ONLY** | `provider surface` | Planned for GitHub Copilot subscription telemetry. |
| **VS Code** | `VS Code` | **HOST ONLY** | `host_client` | VS Code is treated as an editor host. Quota authority belongs to the specific provider extension installed. |

---

## Authority Classifications Explained

1. **LIVE COLLECTION**:
   - The application automatically discovers the running service or reads active local telemetry.
   - Quotas, remaining percentages, model groups, and reset timestamps update in real time.

2. **OFFICIAL UI-DERIVED**:
   - The provider presents official quota data inside its own user interface (e.g., Cloud Shell Session Info).
   - AI Quota provides an interface to view and record these values while making it clear that live background collection is not yet machine-readable.

3. **PLANNED / LAST-KNOWN ONLY**:
   - The adapter architecture is established and isolated.
   - If an account has previously recorded snapshots, they are preserved and labeled with capture timestamps.
   - When no telemetry exists, the account is marked honestly as **NOT CONNECTED** rather than displaying `0%` or invented numbers.

4. **HOST ONLY**:
   - The entity is an IDE or application container, not a quota authority.
