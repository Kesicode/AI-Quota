"""
AI-Quota 2.0 — Database connection module.

Drop-in compatible with the existing app/database.py module.
Adds ULID generation for new account IDs.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator
import time
import os


ROOT = Path(__file__).resolve().parent.parent.parent
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
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
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
    """Idempotent column addition — no-op if column already exists."""
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


# ─────────────────────────────────────────────────────────────────
# ULID generation for new account IDs
# Uses time-based prefix + random entropy (no external dependency)
# Format: acc_<48bit-timestamp-base32><80bit-random-base32>
# ─────────────────────────────────────────────────────────────────
_ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _encode32(n: int, length: int) -> str:
    result = []
    for _ in range(length):
        result.append(_ENCODING[n & 0x1F])
        n >>= 5
    return "".join(reversed(result))


def generate_account_id() -> str:
    """
    Generate a new account_id in ULID-compatible format.
    Returns: acc_<26-char-crockford-base32>
    E.g.: acc_01JKVP9XYZABCDE12345FGHJK
    """
    ts_ms = int(time.time() * 1000)
    rand = int.from_bytes(os.urandom(10), "big")
    ts_part = _encode32(ts_ms, 10)
    rand_part = _encode32(rand, 16)
    return f"acc_{ts_part}{rand_part}"
