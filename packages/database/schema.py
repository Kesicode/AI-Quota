"""
AI-Quota 2.0 — Extended Database Schema

Migration-safe: all new columns added via ADD COLUMN (never DROP or RENAME).
Existing data is preserved fully. WAL mode is mandatory.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Schema DDL — versioned, idempotent CREATE IF NOT EXISTS statements
# ---------------------------------------------------------------------------

SCHEMA_V1 = """
-- ─────────────────────────────────────────────────────────────────
-- Core account registry
-- account_id: ULID-format text PK (e.g. acc_01JXXXXXXXX)
--             Back-filled from legacy INTEGER id as acc_NNNNNNNN
-- identity_key: email (or CLI profile name, or token subject)
-- provider: Antigravity | Antigravity CLI | Codex | Copilot | ...
-- client: specific client variant (IDE / CLI / API)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      TEXT    NOT NULL DEFAULT '',
    email           TEXT    NOT NULL,
    provider        TEXT    NOT NULL DEFAULT 'Antigravity',
    display_name    TEXT    NOT NULL DEFAULT '',
    label           TEXT    NOT NULL DEFAULT '',
    group_name      TEXT    NOT NULL DEFAULT '',
    color           TEXT    NOT NULL DEFAULT '',
    priority        INTEGER NOT NULL DEFAULT 50,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL,
    client          TEXT    NOT NULL DEFAULT 'Antigravity CLI',
    status          TEXT    NOT NULL DEFAULT 'not_connected',
    plan_tier       TEXT,
    last_seen_at    TEXT,
    last_error      TEXT,
    credits_remaining REAL,
    credits_updated_at TEXT,
    source_kind     TEXT    NOT NULL DEFAULT 'manual',
    credential_ref  TEXT    DEFAULT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- Immutable quota snapshots (append-only, never update/delete rows)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quota_snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id          INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    service             TEXT    NOT NULL,
    client              TEXT    NOT NULL DEFAULT '',
    model               TEXT    NOT NULL DEFAULT '',
    window_name         TEXT    NOT NULL,
    quota_bucket        TEXT    NOT NULL DEFAULT 'default',
    remaining_percent   REAL,
    used_units          REAL,
    limit_units         REAL,
    unit                TEXT,
    reset_at            TEXT,
    source              TEXT    NOT NULL DEFAULT 'manual',
    staleness_tier      TEXT    NOT NULL DEFAULT 'UNKNOWN',
    captured_at         TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- Ignored accounts (deleted accounts that must not be re-discovered)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ignored_accounts (
    email       TEXT NOT NULL,
    provider    TEXT NOT NULL,
    client      TEXT NOT NULL,
    ignored_at  TEXT NOT NULL,
    PRIMARY KEY(email, provider, client)
);

-- ─────────────────────────────────────────────────────────────────
-- Structured event log (never delete; active=false to soft-disable)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id  TEXT    DEFAULT NULL,
    event_type  TEXT    NOT NULL,
    payload     TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- Credential references (opaque keys only — raw secrets in OS vault)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credential_refs (
    account_id  TEXT    NOT NULL,
    key_ref     TEXT    NOT NULL,
    vault_kind  TEXT    NOT NULL DEFAULT 'os',
    created_at  TEXT    NOT NULL,
    PRIMARY KEY (account_id)
);

-- ─────────────────────────────────────────────────────────────────
-- Provider health snapshots
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_health (
    provider_id     TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'unknown',
    last_check_at   TEXT    NOT NULL,
    error           TEXT    DEFAULT NULL,
    PRIMARY KEY (provider_id)
);

-- ─────────────────────────────────────────────────────────────────
-- Account switch audit log
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS switch_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    from_account_id TEXT    DEFAULT NULL,
    to_account_id   TEXT    NOT NULL,
    method          TEXT    NOT NULL DEFAULT 'instant',
    verified        INTEGER NOT NULL DEFAULT 0,
    result          TEXT    NOT NULL DEFAULT 'pending',
    detail          TEXT    DEFAULT NULL,
    created_at      TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- Sync run records
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT    NOT NULL,
    finished_at TEXT    DEFAULT NULL,
    results     TEXT    NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────
-- Persistent settings (key-value)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT    NOT NULL PRIMARY KEY,
    value       TEXT    NOT NULL DEFAULT '',
    updated_at  TEXT    NOT NULL
);
"""

# ─────────────────────────────────────────────────────────────────
# Indices
# ─────────────────────────────────────────────────────────────────
INDICES = """
CREATE INDEX IF NOT EXISTS idx_snapshots_account_time
    ON quota_snapshots(account_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounts_lookup
    ON accounts(email, provider, client);

CREATE INDEX IF NOT EXISTS idx_accounts_account_id
    ON accounts(account_id);

CREATE INDEX IF NOT EXISTS idx_events_type_time
    ON events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_switch_events_time
    ON switch_events(created_at DESC);
"""

# ─────────────────────────────────────────────────────────────────
# Migration columns — columns added in v2 that may not exist in
# legacy databases. All idempotent via add_column().
# ─────────────────────────────────────────────────────────────────
MIGRATION_COLUMNS: list[tuple[str, str, str]] = [
    # (table, column, definition)
    # v1 legacy migrations (already in existing add_column calls)
    ("accounts", "client",              "TEXT NOT NULL DEFAULT 'Antigravity CLI'"),
    ("accounts", "status",              "TEXT NOT NULL DEFAULT 'not_connected'"),
    ("accounts", "plan_tier",           "TEXT"),
    ("accounts", "last_seen_at",        "TEXT"),
    ("accounts", "last_error",          "TEXT"),
    ("accounts", "credits_remaining",   "REAL"),
    ("accounts", "credits_updated_at",  "TEXT"),
    ("accounts", "source_kind",         "TEXT NOT NULL DEFAULT 'manual'"),
    ("quota_snapshots", "client",       "TEXT NOT NULL DEFAULT ''"),
    # v2 new columns
    ("accounts", "account_id",          "TEXT NOT NULL DEFAULT ''"),
    ("accounts", "label",               "TEXT NOT NULL DEFAULT ''"),
    ("accounts", "group_name",          "TEXT NOT NULL DEFAULT ''"),
    ("accounts", "color",               "TEXT NOT NULL DEFAULT ''"),
    ("accounts", "priority",            "INTEGER NOT NULL DEFAULT 50"),
    ("accounts", "credential_ref",      "TEXT DEFAULT NULL"),
    ("quota_snapshots", "quota_bucket",     "TEXT NOT NULL DEFAULT 'default'"),
    ("quota_snapshots", "staleness_tier",   "TEXT NOT NULL DEFAULT 'UNKNOWN'"),
]

# Default settings inserted on first run
DEFAULT_SETTINGS: list[tuple[str, str]] = [
    ("poll_interval_seconds", "5"),
    ("notification_threshold_percent", "20"),
    ("auto_switch_enabled", "false"),
    ("switch_cooldown_seconds", "30"),
    ("max_switches_per_hour", "10"),
    ("bind_host", "127.0.0.1"),
    ("bind_port", "8765"),
    ("telemetry_stale_threshold_seconds", "120"),
    ("telemetry_very_stale_threshold_seconds", "600"),
]
