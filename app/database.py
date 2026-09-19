from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DEFAULT_DB_PATH = DATA_DIR / "ai_quota.db"
_DB_PATH: Path = DEFAULT_DB_PATH


def set_db_path(path: Path | str) -> None:
    global _DB_PATH
    _DB_PATH = Path(path)
    if _DB_PATH.parent:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_db_path() -> Path:
    return _DB_PATH


def get_connection(path: Path | str | None = None) -> sqlite3.Connection:
    target = Path(path) if path else _DB_PATH
    if target.parent:
        target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def db_session(path: Path | str | None = None) -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db(path: Path | str | None = None) -> None:
    with db_session(path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'Antigravity',
                display_name TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                client TEXT NOT NULL DEFAULT 'Antigravity CLI',
                status TEXT NOT NULL DEFAULT 'not_connected',
                plan_tier TEXT,
                last_seen_at TEXT,
                last_error TEXT,
                credits_remaining REAL,
                credits_updated_at TEXT,
                source_kind TEXT NOT NULL DEFAULT 'manual'
            );

            CREATE TABLE IF NOT EXISTS quota_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                service TEXT NOT NULL,
                client TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                window_name TEXT NOT NULL,
                remaining_percent REAL,
                used_units REAL,
                limit_units REAL,
                unit TEXT,
                reset_at TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                captured_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ignored_accounts (
                email TEXT NOT NULL,
                provider TEXT NOT NULL,
                client TEXT NOT NULL,
                ignored_at TEXT NOT NULL,
                PRIMARY KEY(email, provider, client)
            );

            CREATE INDEX IF NOT EXISTS idx_snapshots_account_time
                ON quota_snapshots(account_id, captured_at DESC);

            CREATE INDEX IF NOT EXISTS idx_accounts_lookup
                ON accounts(email, provider, client);
            """
        )
        # Ensure migration columns for legacy databases
        add_column(conn, "accounts", "client", "TEXT NOT NULL DEFAULT 'Antigravity CLI'")
        add_column(conn, "accounts", "status", "TEXT NOT NULL DEFAULT 'not_connected'")
        add_column(conn, "accounts", "plan_tier", "TEXT")
        add_column(conn, "accounts", "last_seen_at", "TEXT")
        add_column(conn, "accounts", "last_error", "TEXT")
        add_column(conn, "accounts", "credits_remaining", "REAL")
        add_column(conn, "accounts", "credits_updated_at", "TEXT")
        add_column(conn, "accounts", "source_kind", "TEXT NOT NULL DEFAULT 'manual'")
        add_column(conn, "quota_snapshots", "client", "TEXT NOT NULL DEFAULT ''")
