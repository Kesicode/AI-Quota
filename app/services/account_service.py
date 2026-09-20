from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from ..database import db_session, get_connection
from ..utils.time import now_iso, payload_age

STATUS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "antigravity-status"


def email_key(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:24]


def status_file_path(email: str) -> Path:
    return STATUS_DIR / f"{email_key(email)}.json"


def normalize_str(s: str | None) -> str:
    return (s or "").strip().lower()


def is_ignored(email: str, provider: str, client: str, conn: Any = None) -> bool:
    if conn is not None:
        row = conn.execute(
            "SELECT 1 FROM ignored_accounts WHERE lower(email)=? AND lower(provider)=? AND lower(client)=?",
            (normalize_str(email), normalize_str(provider), normalize_str(client)),
        ).fetchone()
        return row is not None

    with db_session() as session_conn:
        row = session_conn.execute(
            "SELECT 1 FROM ignored_accounts WHERE lower(email)=? AND lower(provider)=? AND lower(client)=?",
            (normalize_str(email), normalize_str(provider), normalize_str(client)),
        ).fetchone()
        return row is not None


def get_account_by_id(account_id: int) -> dict[str, Any] | None:
    with db_session() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
        return dict(row) if row else None


def list_accounts() -> list[dict[str, Any]]:
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
        return [dict(r) for r in rows]


def create_account(email: str, provider: str, client: str, display_name: str = "") -> dict[str, Any]:
    norm_email = email.strip().lower()
    norm_provider = provider.strip()
    norm_client = client.strip()

    if not norm_email or not norm_provider or not norm_client:
        raise ValueError("Email/identity, provider, and client are required.")

    with db_session() as conn:
        # Check if email + client combination already exists
        exists = conn.execute(
            "SELECT 1 FROM accounts WHERE lower(email)=? AND lower(client)=?",
            (norm_email, norm_client.lower()),
        ).fetchone()
        if exists:
            raise KeyError(f"An account with email '{norm_email}' and client '{norm_client}' already exists.")

        # If it was previously in ignored_accounts, un-ignore it now that user explicitly re-added it
        conn.execute(
            "DELETE FROM ignored_accounts WHERE lower(email)=? AND lower(provider)=? AND lower(client)=?",
            (norm_email, norm_provider.lower(), norm_client.lower()),
        )

        now = now_iso()
        cur = conn.execute(
            """
            INSERT INTO accounts (
                email, provider, display_name, client, created_at, status, source_kind
            ) VALUES (?, ?, ?, ?, ?, 'not_connected', 'manual')
            """,
            (norm_email, norm_provider, display_name.strip() or norm_email, norm_client, now),
        )
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def delete_account(account_id: int) -> dict[str, Any] | None:
    with db_session() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not row:
            return None
        acc = dict(row)
        # Add to ignored_accounts so auto-discovery doesn't resurrect it
        conn.execute(
            """
            INSERT OR REPLACE INTO ignored_accounts (email, provider, client, ignored_at)
            VALUES (?, ?, ?, ?)
            """,
            (acc["email"].lower(), acc["provider"].lower(), acc["client"].lower(), now_iso()),
        )
        conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))

    # Clean local telemetry file if it exists for CLI
    if "cli" in acc.get("client", "").lower():
        try:
            status_file_path(acc["email"]).unlink(missing_ok=True)
        except OSError:
            pass

    return acc


def ensure_auto_discovered_account(
    email: str, provider: str, client: str, display_name: str = "", plan_tier: str | None = None
) -> dict[str, Any] | None:
    norm_email = email.strip().lower()
    norm_provider = provider.strip()
    norm_client = client.strip()

    if not norm_email or not norm_provider or not norm_client:
        return None

    with db_session() as conn:
        # Check if intentionally ignored/deleted
        if is_ignored(norm_email, norm_provider, norm_client, conn=conn):
            return None

        row = conn.execute(
            "SELECT * FROM accounts WHERE lower(email)=? AND lower(provider)=? AND lower(client)=? ORDER BY id LIMIT 1",
            (norm_email, norm_provider.lower(), norm_client.lower()),
        ).fetchone()
        if row:
            return dict(row)

        now = now_iso()
        cur = conn.execute(
            """
            INSERT INTO accounts (
                email, provider, display_name, client, created_at, status, plan_tier, source_kind
            ) VALUES (?, ?, ?, ?, ?, 'live', ?, 'auto_discovered')
            """,
            (norm_email, norm_provider, display_name.strip() or norm_email, norm_client, now, plan_tier),
        )
        new_row = conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(new_row)


def update_account_telemetry(
    account_id: int,
    status: str,
    plan_tier: str | None = None,
    last_seen_at: str | None = None,
    last_error: str | None = None,
    credits_remaining: float | None = None,
) -> None:
    with db_session() as conn:
        conn.execute(
            """
            UPDATE accounts
            SET status=?,
                plan_tier=COALESCE(?, plan_tier),
                last_seen_at=COALESCE(?, last_seen_at),
                last_error=?,
                credits_remaining=COALESCE(?, credits_remaining)
            WHERE id=?
            """,
            (status, plan_tier, last_seen_at, last_error, credits_remaining, account_id),
        )
