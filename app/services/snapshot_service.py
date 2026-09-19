from __future__ import annotations

from typing import Any
from ..database import db_session
from ..utils.time import now_iso


def record_snapshot(
    account_id: int,
    service: str,
    client: str,
    model: str,
    window_name: str,
    remaining_percent: float | None = None,
    used_units: float | None = None,
    limit_units: float | None = None,
    unit: str | None = None,
    reset_at: str | None = None,
    source: str = "manual",
    captured_at: str | None = None,
) -> int | None:
    timestamp = captured_at or now_iso()
    with db_session() as conn:
        # Check if identical snapshot already exists
        exists = conn.execute(
            """
            SELECT id FROM quota_snapshots
            WHERE account_id=? AND client=? AND model=? AND window_name=? AND captured_at=?
            """,
            (account_id, client, model, window_name, timestamp),
        ).fetchone()
        if exists:
            return exists["id"]

        cur = conn.execute(
            """
            INSERT INTO quota_snapshots (
                account_id, service, client, model, window_name,
                remaining_percent, used_units, limit_units, unit,
                reset_at, source, captured_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                service,
                client,
                model,
                window_name,
                remaining_percent,
                used_units,
                limit_units,
                unit,
                reset_at,
                source,
                timestamp,
            ),
        )
        return cur.lastrowid


def get_latest_snapshots(account_id: int) -> list[dict[str, Any]]:
    """Retrieve the most recent snapshot for each unique (service, client, model, window_name)."""
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT * FROM quota_snapshots
            WHERE account_id=?
            ORDER BY captured_at DESC
            LIMIT 200
            """,
            (account_id,),
        ).fetchall()

    seen: set[tuple[str, str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = (row["service"], row["client"], row["model"], row["window_name"])
        if key in seen:
            continue
        seen.add(key)
        out.append(dict(row))
    return out


def list_snapshots(account_id: int | None = None, limit: int = 1000) -> list[dict[str, Any]]:
    query = "SELECT * FROM quota_snapshots"
    args: tuple[Any, ...] = ()
    if account_id is not None:
        query += " WHERE account_id=?"
        args = (account_id,)
    query += f" ORDER BY captured_at DESC LIMIT {int(limit)}"
    with db_session() as conn:
        rows = conn.execute(query, args).fetchall()
        return [dict(r) for r in rows]
