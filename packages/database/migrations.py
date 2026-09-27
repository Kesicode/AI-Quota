"""
AI-Quota 2.0 — Database migration engine.

Handles:
- Auto-backup of existing database before migration
- Idempotent column additions via ADD COLUMN
- account_id backfill (legacy integer id → "acc_NNNNNNNN" format)
- Default settings seeding
- Zero data loss guarantee
"""
from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

from .schema import DEFAULT_SETTINGS, INDICES, MIGRATION_COLUMNS, SCHEMA_V1


def _backup(db_path: Path) -> Path | None:
    """Create a timestamped backup before any migration. Returns backup path."""
    if not db_path.exists():
        return None
    from datetime import datetime
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    backup_path = db_path.with_suffix(f".backup_{ts}.db")
    shutil.copy2(db_path, backup_path)
    return backup_path


def _add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    """Add a column if it doesn't already exist — fully idempotent."""
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _backfill_account_ids(conn: sqlite3.Connection) -> int:
    """
    Backfill account_id for any rows where it is empty.
    Format: acc_{id:012d} — deterministic from existing integer id.
    New accounts created by the application will receive proper ULIDs.
    Returns number of rows updated.
    """
    rows = conn.execute(
        "SELECT id FROM accounts WHERE account_id = '' OR account_id IS NULL"
    ).fetchall()
    count = 0
    for row in rows:
        legacy_id: int = row[0]
        account_id = f"acc_{legacy_id:012d}"
        conn.execute(
            "UPDATE accounts SET account_id = ? WHERE id = ?",
            (account_id, legacy_id),
        )
        count += 1
    return count


def _seed_default_settings(conn: sqlite3.Connection) -> None:
    """Insert default settings if they don't already exist."""
    from ..core.utils_time import now_iso  # lazy import — avoids circular deps
    now = now_iso()
    for key, value in DEFAULT_SETTINGS:
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
            (key, value, now),
        )


def run_migrations(conn: sqlite3.Connection) -> dict[str, object]:
    """
    Apply all schema migrations to an open connection.
    Safe to call on every startup — fully idempotent.
    Returns a summary dict for diagnostics.
    """
    # 1. Apply base schema (CREATE IF NOT EXISTS)
    conn.executescript(SCHEMA_V1)
    conn.executescript(INDICES)

    # 2. Apply migration columns (idempotent ADD COLUMN)
    for table, column, definition in MIGRATION_COLUMNS:
        _add_column(conn, table, column, definition)

    # 3. Backfill account_id for legacy rows
    backfilled = _backfill_account_ids(conn)

    # 4. Seed default settings
    _seed_default_settings(conn)

    conn.commit()
    return {"backfilled_account_ids": backfilled}


def init_db(db_path: Path, *, backup: bool = True) -> dict[str, object]:
    """
    Full database initialisation + migration with optional automatic backup.
    Called once at agent startup.

    Args:
        db_path: Absolute path to the SQLite database file.
        backup: If True and the database already exists, create a timestamped backup.

    Returns:
        Diagnostic dict: {"backup_path": ..., "backfilled_account_ids": ...}
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    backup_path: Path | None = None
    if backup and db_path.exists():
        backup_path = _backup(db_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        result = run_migrations(conn)
    finally:
        conn.close()

    result["backup_path"] = str(backup_path) if backup_path else None
    return result
