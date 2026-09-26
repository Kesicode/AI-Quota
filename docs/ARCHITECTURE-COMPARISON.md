# ARCHITECTURE COMPARISON — Quota 2.0

> Produced by: Phase 1 Repository Audit
> Date: September 26, 2026
> Based on: Kesicode/AI-Quota (main) + BoyGR/antigravity-account-switcher (main)

---

## 1. AI-Quota (Existing Codebase) Audit

### Stack
- Backend: Python 3.11+, FastAPI, Uvicorn, SQLite 3 (WAL)
- Frontend: Vanilla JS (ES2022), no build step, CSS custom properties
- Tests: Python unittest + starlette.TestClient

### What AI-Quota Does Well
- Fault-isolated sync_all() — adapter failures never crash others
- ProviderTruth dataclass — authority type, live, priority
- ProviderAdapter ABC — id, display_name, supported_clients, sync()
- quota_snapshots — append-only, immutable, timestamped
- ignored_accounts — prevents ghost re-discovery after delete
- SQLite WAL + add_column() migration helper
- Localhost-only binding (127.0.0.1:8765)
- Vanilla JS GPU ambient animation, no external frameworks
- 12 passing automated tests

### What Must Change in Quota 2.0
- id INTEGER PK → account_id TEXT (ULID format)
- No ProviderCapabilities model → add capabilities() method per adapter
- No credential vault → add OS-native CredentialManager
- No switch engine → add SwitchEngine with verification + cooldown
- No SSE → add /api/v1/events/stream SSE endpoint
- No event log → add events table + event bus
- No Antigravity hub detection → add hub_detector.py
- No IDE extension → build VS Code thin client extension

---

## 2. antigravity-account-switcher Audit

### Stack
- TypeScript, VS Code Extension API, esbuild
- Storage: VS Code globalState + Windows Credential Manager / DPAPI

### Key Concepts to Port Into Quota 2.0
- hub-detector.ts → providers/antigravity/hub_detector.py
- hub-auth-client.ts → providers/antigravity/hub_client.py
- account-switcher.ts → packages/core/switch_engine.py
- token-vault-service.ts → packages/security/credential_manager.py
- quota-monitor-service.ts → providers/antigravity/quota_client.py
- quota-summary-store.ts → QuotaBucket in packages/core/models.py
- quota-history-store.ts → packages/core/history_engine.py
- ide-state-service.ts → packages/core/event_engine.py

### What NOT to Copy
- All logic inside VS Code process (we move to standalone agent)
- VS Code globalState as database (use SQLite WAL)
- Antigravity-only design (use provider-agnostic adapter contract)

---

## 3. Security Risk Map

| Risk | Mitigation |
|------|-----------|
| Credentials in SQLite | Only credential_reference stored; raw secrets in OS vault |
| Stack traces to frontend | Custom exception handlers, structured error model |
| Secrets in logs | redact_secrets() utility in logging pipeline |
| LAN exposure | Enforce --host 127.0.0.1 by default |
| Switch loop | 30s cooldown, max 10 switches/hour, switch lock |
| Stale shown as live | LIVE/RECENT/STALE/VERY_STALE/UNKNOWN staleness tiers |

---

## 4. Architecture Decisions

- ADR-001: account_id TEXT (ULID) replaces id INTEGER as primary key
- ADR-002: SQLite stores only credential_reference, never raw secrets
- ADR-003: VS Code extension is thin HTTP client; engine lives in local agent
- ADR-004: Switch reported success only when activeAccount == requestedAccount
- ADR-005: Auto-switch is OFF by default
