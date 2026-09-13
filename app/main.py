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
    return f'''import hashlib, json, os, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

STATUS_DIR = Path(r"{absolute_status_dir}")
STATUS_DIR.mkdir(parents=True, exist_ok=True)
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
    "context_window": payload.get("context_window", {{}}),
    "quota": payload.get("quota", {{}}),
}}
key = hashlib.sha256(email.encode()).hexdigest()[:24]
out = STATUS_DIR / f"{{key}}.json"
fd, tmp_name = tempfile.mkstemp(dir=STATUS_DIR, prefix=".aiquota-", suffix=".tmp")
os.close(fd)
Path(tmp_name).write_text(json.dumps(keep, separators=(",", ":")), encoding="utf-8")
os.replace(tmp_name, out)
print(f"AI Quota: {{email}}")
'''


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


def payload_age_seconds(payload: dict[str, Any]) -> float | None:
    raw = payload.get("captured_at")
    if not raw:
        return None
    try:
        return max(0.0, (datetime.now(timezone.utc) - datetime.fromisoformat(raw)).total_seconds())
    except (TypeError, ValueError):
        return None


def ensure_discovered_account(conn: sqlite3.Connection, email: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM accounts WHERE lower(email)=? AND lower(provider)='antigravity' AND lower(client)='antigravity cli' ORDER BY id LIMIT 1",
        (email,),
    ).fetchone()
    if row:
        return row
    now = now_iso()
    cur = conn.execute(
        """INSERT INTO accounts(email, provider, display_name, client, created_at, status, source_kind)
           VALUES (?, 'Antigravity', ?, 'Antigravity CLI', ?, 'live', 'auto_discovered')""",
        (email, email, now),
    )
    return conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone()


def sync_antigravity() -> dict[str, Any]:
    changed = 0
    matched = 0
    discovered = 0
    with db() as conn:
        for item in load_status_files():
            email = str(item.get("email") or "").strip().lower()
            if not email:
                continue
            age = payload_age_seconds(item)
            before = conn.execute(
                "SELECT id FROM accounts WHERE lower(email)=? AND lower(provider)='antigravity' AND lower(client)='antigravity cli' ORDER BY id LIMIT 1",
                (email,),
            ).fetchone()
            account = ensure_discovered_account(conn, email)
            discovered += 1 if before is None else 0
            if age is None or age > 3600:
                status = "stale"
            else:
                quota = item.get("quota") or {}
                percentages = [float(bucket["remaining_fraction"]) * 100.0 for bucket in quota.values() if isinstance(bucket, dict) and bucket.get("remaining_fraction") is not None]
                status = "exhausted" if percentages and max(percentages) <= 0 else ("live" if age <= 60 else "stale")
            matched += 1
            captured_at = str(item.get("captured_at") or now_iso())
            conn.execute(
                "UPDATE accounts SET status=?, plan_tier=?, last_seen_at=?, last_error=NULL WHERE id=?",
                (status, item.get("plan_tier"), captured_at, account["id"]),
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
                    """SELECT 1 FROM quota_snapshots WHERE account_id=? AND service=? AND client=? AND model=? AND window_name=? AND captured_at=?""",
                    (account["id"], "Antigravity", "Antigravity CLI", str(bucket_id), window, captured_at),
                ).fetchone()
                if not exists:
                    conn.execute(
                        """INSERT INTO quota_snapshots (account_id, service, client, model, window_name, remaining_percent, used_units, limit_units, unit, reset_at, source, captured_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (account["id"], "Antigravity", "Antigravity CLI", str(bucket_id), window, pct, None, None, "provider quota", reset_at, "antigravity-statusline", captured_at),
                    )
                    changed += 1
            ctx = item.get("context_window") or {}
            size = ctx.get("context_window_size")
            used_pct = ctx.get("used_percentage")
            if size is not None and used_pct is not None:
                used_units = float(size) * float(used_pct) / 100.0
                remaining_pct = max(0.0, min(100.0, 100.0 - float(used_pct)))
                exists = conn.execute(
                    """SELECT 1 FROM quota_snapshots WHERE account_id=? AND service=? AND client=? AND model=? AND window_name=? AND captured_at=?""",
                    (account["id"], "Antigravity", "Antigravity CLI", "Context Window", "Context Window", captured_at),
                ).fetchone()
                if not exists:
                    conn.execute(
                        """INSERT INTO quota_snapshots (account_id, service, client, model, window_name, remaining_percent, used_units, limit_units, unit, reset_at, source, captured_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (account["id"], "Antigravity", "Antigravity CLI", "Context Window", "Context Window", remaining_pct, used_units, float(size), "tokens", None, "antigravity-statusline", captured_at),
                    )
                    changed += 1
        rows = conn.execute("SELECT * FROM accounts WHERE lower(provider)='antigravity' AND lower(client)='antigravity cli'").fetchall()
        for row in rows:
            path = status_path(row["email"])
            if not path.exists():
                if row["status"] == "live":
                    conn.execute("UPDATE accounts SET status='stale' WHERE id=?", (row["id"],))
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                age = payload_age_seconds(payload) or 999999
                if age > 3600:
                    conn.execute("UPDATE accounts SET status='stale' WHERE id=?", (row["id"],))
            except Exception:
                conn.execute("UPDATE accounts SET status='stale' WHERE id=?", (row["id"],))
    return {"changed": changed, "matched": matched, "discovered": discovered}


def current_status(email: str) -> dict[str, Any]:
    path = status_path(email)
    if not path.exists():
        return {"connected": False, "age_seconds": None, "payload": None}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        age = payload_age_seconds(payload)
        return {"connected": age is not None and age <= 60, "age_seconds": age, "payload": payload}
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
        rows = conn.execute("SELECT * FROM quota_snapshots WHERE account_id=? ORDER BY captured_at DESC LIMIT 200", (account_id,)).fetchall()
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
            "mode": "global_active_session_telemetry",
            "message": "The Antigravity CLI collector is installed globally for this local machine. Restart Antigravity CLI. AI Quota will match each active session's reported email, keep its last-known quota, and automatically discover new Antigravity accounts as you switch between them.",
            **setup,
        }
    if provider == "antigravity" and "2.0" in client:
        return {
            "ok": True,
            "mode": "antigravity_2_0_tracked",
            "message": "Antigravity 2.0 is now registered as a separate AI Quota client. Google documents unified authentication and a Models & Quota screen for Antigravity 2.0, but it does not currently document the CLI status-line telemetry protocol for the desktop app. AI Quota therefore keeps this account separate and will not fabricate live quota values.",
            "next_steps": [
                "Use Antigravity 2.0 normally with this Google account.",
                "The account will remain visible in AI Quota as Not Connected until an authoritative 2.0 data source is available.",
                "Antigravity CLI can still be kept and used as a separate client for the same or another account."
            ],
        }
    return {
        "ok": False,
        "mode": "not_implemented",
        "message": f"No direct live collector is implemented yet for {row['provider']} / {row['client']}. The account remains available for last-known snapshots.",
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
        usable = [float(s["remaining_percent"]) for s in snaps if s.get("remaining_percent") is not None and s["window_name"] != "Context Window"]
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
            """INSERT INTO quota_snapshots (account_id, service, client, model, window_name, remaining_percent,
               used_units, limit_units, unit, reset_at, source, captured_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (item.account_id, item.service, item.client, item.model, item.window_name, item.remaining_percent,
             item.used_units, item.limit_units, item.unit, item.reset_at, item.source, now),
        )
        row = conn.execute("SELECT * FROM quota_snapshots WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    run()
