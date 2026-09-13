from __future__ import annotations

import hashlib
import json
import os
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


def add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'Antigravity',
                display_name TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
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
            CREATE INDEX IF NOT EXISTS idx_snapshots_account_time
              ON quota_snapshots(account_id, captured_at DESC);
            """
        )
        add_column(conn, "accounts", "client", "TEXT NOT NULL DEFAULT 'Antigravity CLI'")
        add_column(conn, "accounts", "status", "TEXT NOT NULL DEFAULT 'not_connected'")
        add_column(conn, "accounts", "plan_tier", "TEXT")
        add_column(conn, "accounts", "last_seen_at", "TEXT")
        add_column(conn, "accounts", "last_error", "TEXT")
        add_column(conn, "accounts", "credits_remaining", "REAL")
        add_column(conn, "accounts", "credits_updated_at", "TEXT")
        add_column(conn, "accounts", "source_kind", "TEXT NOT NULL DEFAULT 'provider'")
        add_column(conn, "quota_snapshots", "client", "TEXT NOT NULL DEFAULT ''")


class AccountIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    provider: str = Field(default="Antigravity", min_length=1, max_length=80)
    display_name: str = Field(default="", max_length=120)
    client: str = Field(default="Antigravity CLI", max_length=100)


class SnapshotIn(BaseModel):
    account_id: int
    service: str = Field(min_length=1, max_length=80)
    client: str = Field(default="", max_length=100)
    model: str = Field(default="", max_length=120)
    window_name: str = Field(min_length=1, max_length=80)
    remaining_percent: float | None = Field(default=None, ge=0, le=100)
    used_units: float | None = None
    limit_units: float | None = None
    unit: str | None = Field(default=None, max_length=40)
    reset_at: str | None = None
    source: str = Field(default="manual", max_length=80)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def email_key(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:24]


def status_path(email: str) -> Path:
    return STATUS_DIR / f"{email_key(email)}.json"


def settings_path() -> Path:
    return Path.home() / ".gemini" / "antigravity-cli" / "settings.json"


def bridge_path() -> Path:
    return DATA_DIR / "antigravity_statusline_bridge.py"


def bridge_script() -> str:
    absolute_status_dir = str(STATUS_DIR).replace("\\", "\\\\")
    return f'''import hashlib, json, os, sys, tempfile\nfrom datetime import datetime, timezone\nfrom pathlib import Path\n\nSTATUS_DIR = Path(r"{absolute_status_dir}")\nSTATUS_DIR.mkdir(parents=True, exist_ok=True)\ntry:\n    payload = json.load(sys.stdin)\nexcept Exception:\n    print("AI Quota: waiting")\n    raise SystemExit(0)\nemail = str(payload.get("email") or "").strip().lower()\nif not email:\n    print("AI Quota: account unavailable")\n    raise SystemExit(0)\nkeep = {{\n    "captured_at": datetime.now(timezone.utc).isoformat(),\n    "email": email,\n    "product": payload.get("product"),\n    "version": payload.get("version"),\n    "plan_tier": payload.get("plan_tier"),\n    "model": payload.get("model"),\n    "context_window": payload.get("context_window", {{}}),\n    "quota": payload.get("quota", {{}}),\n}}\nkey = hashlib.sha256(email.encode()).hexdigest()[:24]\nout = STATUS_DIR / f"{{key}}.json"\nfd, tmp_name = tempfile.mkstemp(dir=STATUS_DIR, prefix=".aiquota-", suffix=".tmp")\nos.close(fd)\nPath(tmp_name).write_text(json.dumps(keep, separators=(",", ":")), encoding="utf-8")\nos.replace(tmp_name, out)\nprint(f"AI Quota: {{email}}")\n'''


def install_antigravity_bridge() -> dict[str, Any]:
    settings = settings_path()
    settings.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {}
    previous = None
    if settings.exists():
        try:
            data = json.loads(settings.read_text(encoding="utf-8"))
        except Exception as exc:
            raise HTTPException(400, f"Could not read Antigravity settings.json: {exc}")
        previous = data.get("statusLine")
    bridge = bridge_path()
    bridge.write_text(bridge_script(), encoding="utf-8")
    backup = DATA_DIR / "antigravity_previous_statusline.json"
    if previous is not None and not backup.exists():
        backup.write_text(json.dumps(previous, indent=2), encoding="utf-8")
    command = f'"{sys.executable}" "{bridge}"'
    data["statusLine"] = {
        "type": "command",
        "command": command,
        "enabled": True,
        "stack_with_default": True,
    }
    settings.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {"settings_path": str(settings), "bridge_path": str(bridge), "previous_saved": previous is not None}


def bucket_name(bucket_id: str) -> str:
    s = bucket_id.replace("_", "-").lower()
    if "5hour" in s or "5-hour" in s or "five" in s or "hourly" in s:
        return "Five Hour Limit"
    if "daily" in s or "day" in s:
        return "Daily Limit"
    if "weekly" in s or "week" in s:
        return "Weekly Limit"
    if "monthly" in s or "month" in s:
        return "Monthly Limit"
    return bucket_id


def load_status_files() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in STATUS_DIR.glob("*.json"):
        try:
            items.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    return items


def sync_antigravity() -> dict[str, Any]:
    changed = 0
    matched: set[int] = set()
    status_items = load_status_files()
    with db() as conn:
        accounts = conn.execute("SELECT * FROM accounts").fetchall()
        by_email = {row["email"].strip().lower(): row for row in accounts}
        for item in status_items:
            email = str(item.get("email") or "").strip().lower()
            account = by_email.get(email)
            if account is None:
                continue
            matched.add(account["id"])
            captured_at = str(item.get("captured_at") or now_iso())
            plan_tier = item.get("plan_tier")
            conn.execute(
                "UPDATE accounts SET status=?, plan_tier=?, last_seen_at=?, last_error=NULL WHERE id=?",
                ("live", plan_tier, captured_at, account["id"]),
            )
            quota = item.get("quota") or {}
            for bucket_id, bucket in quota.items():
                if not isinstance(bucket, dict):
                    continue
                remaining = bucket.get("remaining_fraction")
                reset_at = bucket.get("reset_time")
                pct = None if remaining is None else max(0.0, min(100.0, float(remaining) * 100.0))
                window = bucket_name(str(bucket_id))
                exists = conn.execute(
                    """SELECT 1 FROM quota_snapshots
                       WHERE account_id=? AND service=? AND client=? AND model=?
                         AND window_name=? AND captured_at=?""",
                    (account["id"], "Antigravity", "Antigravity CLI", str(bucket_id), window, captured_at),
                ).fetchone()
                if exists:
                    continue
                conn.execute(
                    """INSERT INTO quota_snapshots
                    (account_id, service, client, model, window_name,
                     remaining_percent, used_units, limit_units, unit, reset_at,
                     source, captured_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (account["id"], "Antigravity", "Antigravity CLI", str(bucket_id), window,
                     pct, None, None, "provider quota", reset_at,
                     "antigravity-statusline", captured_at),
                )
                changed += 1
            ctx = item.get("context_window") or {}
            size = ctx.get("context_window_size")
            used_pct = ctx.get("used_percentage")
            if size is not None and used_pct is not None:
                used_units = float(size) * float(used_pct) / 100.0
                remaining_pct = max(0.0, min(100.0, 100.0 - float(used_pct)))
                exists = conn.execute(
                    """SELECT 1 FROM quota_snapshots
                       WHERE account_id=? AND service=? AND client=? AND model=?
                         AND window_name=? AND captured_at=?""",
                    (account["id"], "Antigravity", "Antigravity CLI", "Context Window", "Context Window", captured_at),
                ).fetchone()
                if not exists:
                    conn.execute(
                        """INSERT INTO quota_snapshots
                        (account_id, service, client, model, window_name,
                         remaining_percent, used_units, limit_units, unit,
                         reset_at, source, captured_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (account["id"], "Antigravity", "Antigravity CLI", "Context Window", "Context Window",
                         remaining_pct, used_units, float(size), "tokens", None,
                         "antigravity-statusline", captured_at),
                    )
                    changed += 1
        for row in accounts:
            if row["id"] not in matched and row["provider"].lower() == "antigravity":
                last_seen = row["last_seen_at"]
                if not last_seen:
                    conn.execute("UPDATE accounts SET status='not_connected' WHERE id=?", (row["id"],))
                else:
                    try:
                        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last_seen)).total_seconds()
                    except ValueError:
                        age = 999999
                    conn.execute("UPDATE accounts SET status=? WHERE id=?", ("stale" if age > 60 else "live", row["id"]))
    return {"changed": changed, "matched": len(matched)}


def current_status(email: str) -> dict[str, Any]:
    path = status_path(email)
    if not path.exists():
        return {"connected": False, "age_seconds": None, "payload": None}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        captured = datetime.fromisoformat(payload["captured_at"])
        age = max(0.0, (datetime.now(timezone.utc) - captured).total_seconds())
        return {"connected": age <= 60, "age_seconds": age, "payload": payload}
    except Exception:
        return {"connected": False, "age_seconds": None, "payload": None}


def normalize_account(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    state = current_status(item["email"])
    item["telemetry_age_seconds"] = state["age_seconds"]
    if item.get("provider", "").lower() == "antigravity" and state["payload"]:
        payload = state["payload"]
        item["plan_tier"] = payload.get("plan_tier") or item.get("plan_tier")
        item["model"] = (payload.get("model") or {}).get("display_name") if isinstance(payload.get("model"), dict) else payload.get("model")
        item["context_window"] = payload.get("context_window") or {}
        item["telemetry_product"] = payload.get("product")
    return item


def latest_snapshots_for_account(account_id: int) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """SELECT * FROM quota_snapshots
               WHERE account_id=?
               ORDER BY captured_at DESC LIMIT 200""",
            (account_id,),
        ).fetchall()
    # Keep one latest row per logical service/client/model/window.
    seen: set[tuple[str, str, str, str]] = set()
    result: list[dict[str, Any]] = []
    for row in rows:
        key = (row["service"], row["client"], row["model"], row["window_name"])
        if key in seen:
            continue
        seen.add(key)
        result.append(dict(row))
    return result


@app.on_event("startup")
def startup() -> None:
    init_db()
    sync_antigravity()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "app": "AI Quota", "time": now_iso()}


@app.get("/api/accounts")
def accounts() -> list[dict[str, Any]]:
    sync_antigravity()
    with db() as conn:
        rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    return [normalize_account(row) for row in rows]


@app.post("/api/accounts", status_code=201)
def add_account(item: AccountIn) -> dict[str, Any]:
    email = item.email.strip().lower()
    with db() as conn:
        existing = conn.execute("SELECT id FROM accounts WHERE lower(email)=? AND lower(client)=?", (email, item.client.lower())).fetchone()
        if existing:
            raise HTTPException(409, "That email/client combination is already in AI Quota")
        cur = conn.execute(
            """INSERT INTO accounts(email, provider, display_name, client, created_at, status, source_kind)
               VALUES (?, ?, ?, ?, ?, 'not_connected', 'provider')""",
            (email, item.provider.strip(), item.display_name.strip(), item.client.strip(), now_iso()),
        )
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone()
    return normalize_account(row)


@app.delete("/api/accounts/{account_id}", status_code=204)
def delete_account(account_id: int) -> None:
    with db() as conn:
        cur = conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Account not found")


@app.post("/api/accounts/{account_id}/connect")
def connect_account(account_id: int) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Account not found")
    provider = row["provider"].lower()
    client = row["client"].lower()
    if provider == "antigravity" and "cli" in client:
        setup = install_antigravity_bridge()
        return {
            "ok": True,
            "mode": "active-session-telemetry",
            "message": "Bridge installed. Start/restart Antigravity CLI and authenticate the selected account. AI Quota will automatically match the reported email to your account list.",
            **setup,
        }
    return {
        "ok": False,
        "mode": "not_implemented",
        "message": f"No direct collector is implemented yet for {row['provider']} / {row['client']}. The account remains available for last-known snapshots.",
    }


@app.post("/api/sync")
def sync() -> dict[str, Any]:
    result = sync_antigravity()
    return {"ok": True, **result}


@app.get("/api/accounts/{account_id}/snapshots")
def account_snapshots(account_id: int) -> list[dict[str, Any]]:
    with db() as conn:
        exists = conn.execute("SELECT 1 FROM accounts WHERE id=?", (account_id,)).fetchone()
    if not exists:
        raise HTTPException(404, "Account not found")
    return latest_snapshots_for_account(account_id)


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    sync_antigravity()
    with db() as conn:
        rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    normalized = [normalize_account(row) for row in rows]
    cards: list[dict[str, Any]] = []
    for item in normalized:
        snaps = latest_snapshots_for_account(item["id"])
        usable: list[float] = [float(s["remaining_percent"]) for s in snaps if s.get("remaining_percent") is not None and s["window_name"] != "Context Window"]
        best = max(usable) if usable else None
        cards.append({**item, "snapshots": snaps, "best_remaining": best})
    def score(card: dict[str, Any]) -> tuple[int, float]:
        order = {"live": 3, "stale": 2, "not_connected": 1, "exhausted": 0}
        return (order.get(card.get("status"), 0), float(card.get("best_remaining") or 0.0))
    ranked = sorted(cards, key=score, reverse=True)
    summary = {
        "accounts": len(cards),
        "live": sum(c.get("status") == "live" for c in cards),
        "stale": sum(c.get("status") == "stale" for c in cards),
        "not_connected": sum(c.get("status") == "not_connected" for c in cards),
        "exhausted": sum(c.get("status") == "exhausted" for c in cards),
        "best_account_id": ranked[0]["id"] if ranked and ranked[0].get("best_remaining") is not None else None,
    }
    return {"summary": summary, "accounts": cards, "ranking": ranked[:10], "generated_at": now_iso()}


@app.get("/api/snapshots")
def snapshots(account_id: int | None = None) -> list[dict[str, Any]]:
    sync_antigravity()
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
    now = now_iso()
    with db() as conn:
        if conn.execute("SELECT 1 FROM accounts WHERE id=?", (item.account_id,)).fetchone() is None:
            raise HTTPException(404, "Account not found")
        cur = conn.execute(
            """INSERT INTO quota_snapshots
            (account_id, service, client, model, window_name, remaining_percent,
             used_units, limit_units, unit, reset_at, source, captured_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (item.account_id, item.service, item.client, item.model, item.window_name,
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
