from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
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
STATUS_DIR = DATA_DIR / "antigravity-status"
STATIC_DIR = ROOT / "static"
DATA_DIR.mkdir(exist_ok=True)
STATUS_DIR.mkdir(exist_ok=True)

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


def _email_key(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:24]


def _settings_path() -> Path:
    return Path.home() / ".gemini" / "antigravity-cli" / "settings.json"


def _bridge_path() -> Path:
    return DATA_DIR / "antigravity_statusline_bridge.py"


def _write_bridge() -> Path:
    path = _bridge_path()
    status_dir = str(STATUS_DIR.resolve()).replace("\\", "\\\\")
    script = f'''import hashlib, json, os, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

status_dir = Path(r"{status_dir}")
status_dir.mkdir(parents=True, exist_ok=True)
try:
    payload = json.load(sys.stdin)
except Exception:
    print("AI Quota: waiting")
    raise SystemExit(0)
email = str(payload.get("email") or "").strip().lower()
if not email:
    print("AI Quota: account unavailable")
    raise SystemExit(0)
keep = {{
    "captured_at": datetime.now(timezone.utc).isoformat(),
    "email": email,
    "product": payload.get("product"),
    "version": payload.get("version"),
    "plan_tier": payload.get("plan_tier"),
    "model": payload.get("model"),
    "context_window": payload.get("context_window"),
    "quota": payload.get("quota", {{}}),
}}
key = hashlib.sha256(email.encode()).hexdigest()[:24]
out = status_dir / f"{{key}}.json"
fd, tmp = tempfile.mkstemp(dir=status_dir, prefix=".aiquota-", suffix=".tmp")
os.close(fd)
Path(tmp).write_text(json.dumps(keep, separators=(",", ":")), encoding="utf-8")
os.replace(tmp, out)
print("AI Quota: connected")
'''
    path.write_text(script, encoding="utf-8")
    return path


def _install_antigravity_statusline() -> dict[str, Any]:
    settings = _settings_path()
    settings.parent.mkdir(parents=True, exist_ok=True)
    previous = None
    data: dict[str, Any] = {}
    if settings.exists():
        try:
            data = json.loads(settings.read_text(encoding="utf-8"))
        except Exception as exc:
            raise HTTPException(400, f"Could not read Antigravity settings.json: {exc}")
        previous = data.get("statusLine")
    bridge = _write_bridge()
    prev_path = DATA_DIR / "antigravity-previous-statusline.json"
    if previous is not None and not prev_path.exists():
        prev_path.write_text(json.dumps(previous, indent=2), encoding="utf-8")
    data["statusLine"] = {
        "type": "command",
        "command": f'"{sys.executable}" "{bridge}"',
        "enabled": True,
        "stack_with_default": True,
    }
    settings.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {"settings_path": str(settings), "bridge_path": str(bridge), "previous_statusline_saved": previous is not None}


def _bucket_name(bucket_id: str) -> str:
    s = bucket_id.replace("_", "-").lower()
    if "five" in s or "5hour" in s or "5-hour" in s or "hourly" in s:
        return "Five Hour Limit"
    if "daily" in s or "day" in s:
        return "Daily Limit"
    if "weekly" in s or "week" in s:
        return "Weekly Limit"
    if "monthly" in s or "month" in s:
        return "Monthly Limit"
    return bucket_id


def _load_status_files() -> list[dict[str, Any]]:
    items = []
    for path in STATUS_DIR.glob("*.json"):
        try:
            items.append(json.loads(path.read_text(encoding="utf-8")) )
        except Exception:
            continue
    return items


def _sync_antigravity() -> int:
    changed = 0
    status_items = _load_status_files()
    with db() as conn:
        accounts_rows = conn.execute("SELECT * FROM accounts").fetchall()
        by_email = {r["email"].strip().lower(): r for r in accounts_rows}
        for item in status_items:
            email = str(item.get("email") or "").strip().lower()
            account = by_email.get(email)
            if not account:
                continue
            captured_at = item.get("captured_at") or datetime.now(timezone.utc).isoformat()
            for bucket_id, bucket in (item.get("quota") or {}).items():
                if not isinstance(bucket, dict):
                    continue
                remaining = bucket.get("remaining_fraction")
                reset_at = bucket.get("reset_time")
                remaining_pct = None if remaining is None else max(0.0, min(100.0, float(remaining) * 100.0))
                exists = conn.execute(
                    "SELECT id FROM quota_snapshots WHERE account_id=? AND service=? AND model=? AND window_name=? AND captured_at=?",
                    (account["id"], "Antigravity", bucket_id, _bucket_name(bucket_id), captured_at),
                ).fetchone()
                if not exists:
                    conn.execute(
                        """INSERT INTO quota_snapshots
                        (account_id, service, model, window_name, remaining_percent, used_units,
                         limit_units, unit, reset_at, source, captured_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (account["id"], "Antigravity", bucket_id, _bucket_name(bucket_id),
                         remaining_pct, None, None, "provider bucket", reset_at, "antigravity-statusline", captured_at),
                    )
                    changed += 1
            ctx = item.get("context_window") or {}
            total = ctx.get("context_window_size")
            used_pct = ctx.get("used_percentage")
            if total is not None and used_pct is not None:
                exists = conn.execute(
                    "SELECT id FROM quota_snapshots WHERE account_id=? AND service=? AND model=? AND window_name=? AND captured_at=?",
                    (account["id"], "Antigravity", "Context Window", "Context Window", captured_at),
                ).fetchone()
                if not exists:
                    remaining_pct = max(0.0, min(100.0, 100.0 - float(used_pct)))
                    used_units = float(total) * float(used_pct) / 100.0
                    conn.execute(
                        """INSERT INTO quota_snapshots
                        (account_id, service, model, window_name, remaining_percent, used_units,
                         limit_units, unit, reset_at, source, captured_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (account["id"], "Antigravity", "Context Window", "Context Window",
                         remaining_pct, used_units, float(total), "tokens", None,
                         "antigravity-statusline", captured_at),
                    )
                    changed += 1
    return changed


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
    _sync_antigravity()
    with db() as conn:
        rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        status = STATUS_DIR / f"{_email_key(row['email'])}.json"
        item["antigravity_connected"] = status.exists()
        result.append(item)
    return result


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


@app.post("/api/accounts/{account_id}/antigravity/connect")
def connect_antigravity(account_id: int) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Account not found")
    setup = _install_antigravity_statusline()
    return {
        "ok": True,
        "message": "Antigravity bridge installed. Restart/reload Antigravity CLI so it starts sending live quota telemetry.",
        "email": row["email"],
        **setup,
    }


@app.post("/api/sync")
def sync() -> dict[str, Any]:
    changed = _sync_antigravity()
    return {"ok": True, "changed": changed}


@app.delete("/api/accounts/{account_id}", status_code=204)
def delete_account(account_id: int) -> None:
    with db() as conn:
        cur = conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Account not found")


@app.get("/api/snapshots")
def snapshots(account_id: int | None = None) -> list[dict[str, Any]]:
    _sync_antigravity()
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
