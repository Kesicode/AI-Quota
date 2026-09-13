from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "ai_quota.db"
STATIC_DIR = ROOT / "static"
DATA_DIR.mkdir(exist_ok=True)

app = FastAPI(title="AI Quota", docs_url="/api/docs", redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                provider TEXT NOT NULL,
                display_name TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS quota_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                service TEXT NOT NULL,
                model TEXT NOT NULL,
                window_name TEXT NOT NULL,
                remaining_percent REAL,
                used_units REAL,
                limit_units REAL,
                unit TEXT,
                reset_at TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                captured_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_account_time
              ON quota_snapshots(account_id, captured_at DESC);
            """
        )


class AccountIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    provider: str = Field(min_length=1, max_length=80)
    display_name: str = Field(default="", max_length=120)


class SnapshotIn(BaseModel):
    account_id: int
    service: str = Field(min_length=1, max_length=80)
    model: str = Field(default="", max_length=120)
    window_name: str = Field(min_length=1, max_length=80)
    remaining_percent: float | None = Field(default=None, ge=0, le=100)
    used_units: float | None = None
    limit_units: float | None = None
    unit: str | None = Field(default=None, max_length=40)
    reset_at: str | None = None
    source: str = Field(default="manual", max_length=80)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": "AI Quota"}


@app.get("/api/accounts")
def accounts() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/accounts", status_code=201)
def add_account(item: AccountIn) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO accounts(email, provider, display_name, created_at) VALUES (?, ?, ?, ?)",
            (item.email, item.provider, item.display_name, now),
        )
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


@app.delete("/api/accounts/{account_id}", status_code=204)
def delete_account(account_id: int) -> None:
    with db() as conn:
        cur = conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Account not found")


@app.get("/api/snapshots")
def snapshots(account_id: int | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM quota_snapshots"
    args: tuple[Any, ...] = ()
    if account_id is not None:
        query += " WHERE account_id=?"
        args = (account_id,)
    query += " ORDER BY captured_at DESC LIMIT 1000"
    with db() as conn:
        rows = conn.execute(query, args).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/snapshots", status_code=201)
def add_snapshot(item: SnapshotIn) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        if conn.execute("SELECT 1 FROM accounts WHERE id=?", (item.account_id,)).fetchone() is None:
            raise HTTPException(404, "Account not found")
        cur = conn.execute(
            """INSERT INTO quota_snapshots
            (account_id, service, model, window_name, remaining_percent, used_units,
             limit_units, unit, reset_at, source, captured_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (item.account_id, item.service, item.model, item.window_name,
             item.remaining_percent, item.used_units, item.limit_units, item.unit,
             item.reset_at, item.source, now),
        )
        row = conn.execute("SELECT * FROM quota_snapshots WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    run()
