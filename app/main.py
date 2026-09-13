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

from .antigravity_probe import probe_antigravity_2

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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def email_key(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:24]


def status_path(email: str) -> Path:
    return STATUS_DIR / f"{email_key(email)}.json"


def add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
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
            CREATE TABLE IF NOT EXISTS ignored_accounts (
                email TEXT NOT NULL,
                provider TEXT NOT NULL,
                client TEXT NOT NULL,
                ignored_at TEXT NOT NULL,
                PRIMARY KEY(email, provider, client)
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


def settings_path() -> Path:
    return Path.home() / ".gemini" / "antigravity-cli" / "settings.json"


def bridge_path() -> Path:
    return DATA_DIR / "antigravity_statusline_bridge.py"


def bridge_script() -> str:
    folder = str(STATUS_DIR).replace("\\", "\\\\")
    return f'''import hashlib, json, os, sys, tempfile\nfrom datetime import datetime, timezone\nfrom pathlib import Path\nSTATUS_DIR = Path(r"{folder}")\nSTATUS_DIR.mkdir(parents=True, exist_ok=True)\ntry:\n    payload = json.load(sys.stdin)\nexcept Exception:\n    print("AI Quota: waiting"); raise SystemExit(0)\nemail = str(payload.get("email") or "").strip().lower()\nif not email:\n    print("AI Quota: account unavailable"); raise SystemExit(0)\nkeep = {{"captured_at": datetime.now(timezone.utc).isoformat(), "email": email, "product": payload.get("product"), "version": payload.get("version"), "plan_tier": payload.get("plan_tier"), "model": payload.get("model"), "context_window": payload.get("context_window", {{}}), "quota": payload.get("quota", {{}})}}\nkey = hashlib.sha256(email.encode()).hexdigest()[:24]\nout = STATUS_DIR / f"{{key}}.json"\nfd, tmp = tempfile.mkstemp(dir=STATUS_DIR, prefix=".aiquota-", suffix=".tmp"); os.close(fd)\nPath(tmp).write_text(json.dumps(keep, separators=(",", ":")), encoding="utf-8")\nos.replace(tmp, out)\nprint(f"AI Quota: {{email}}")\n'''


def install_antigravity_bridge() -> dict[str, Any]:
    settings = settings_path(); settings.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {}; previous = None
    if settings.exists():
        try: data = json.loads(settings.read_text(encoding="utf-8")); previous = data.get("statusLine")
        except Exception as exc: raise HTTPException(400, f"Could not read Antigravity settings.json: {exc}")
    bridge = bridge_path(); bridge.write_text(bridge_script(), encoding="utf-8")
    backup = DATA_DIR / "antigravity_previous_statusline.json"
    if previous is not None and not backup.exists(): backup.write_text(json.dumps(previous, indent=2), encoding="utf-8")
    data["statusLine"] = {"type": "command", "command": f'"{sys.executable}" "{bridge}"', "enabled": True}
    settings.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {"settings_path": str(settings), "bridge_path": str(bridge), "previous_saved": previous is not None}


def bucket_name(bucket_id: str) -> str:
    s = bucket_id.replace("_", "-").lower()
    if any(x in s for x in ("5hour", "5-hour", "five", "hourly")): return "Five Hour Limit"
    if "daily" in s or "day" in s: return "Daily Limit"
    if "weekly" in s or "week" in s: return "Weekly Limit"
    if "monthly" in s or "month" in s: return "Monthly Limit"
    return bucket_id


def load_status_files() -> list[dict[str, Any]]:
    out = []
    for path in STATUS_DIR.glob("*.json"):
        try: out.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception: pass
    return out


def payload_age(payload: dict[str, Any]) -> float | None:
    raw = payload.get("captured_at")
    if not raw: return None
    try: return max(0.0, (datetime.now(timezone.utc) - datetime.fromisoformat(raw)).total_seconds())
    except (TypeError, ValueError): return None


def ignored(conn: sqlite3.Connection, email: str, provider: str, client: str) -> bool:
    return conn.execute("SELECT 1 FROM ignored_accounts WHERE email=? AND provider=? AND client=?", (email.lower(), provider.lower(), client.lower())).fetchone() is not None


def remove_ignore(conn: sqlite3.Connection, email: str, provider: str, client: str) -> None:
    conn.execute("DELETE FROM ignored_accounts WHERE email=? AND provider=? AND client=?", (email.lower(), provider.lower(), client.lower()))


def ensure_account(conn: sqlite3.Connection, email: str, client: str, provider: str = "Antigravity") -> sqlite3.Row | None:
    email = email.strip().lower(); provider = provider.strip(); client = client.strip()
    row = conn.execute("SELECT * FROM accounts WHERE lower(email)=? AND lower(provider)=? AND lower(client)=? ORDER BY id LIMIT 1", (email, provider.lower(), client.lower())).fetchone()
    if row: return row
    if ignored(conn, email, provider, client): return None
    now = now_iso()
    cur = conn.execute("INSERT INTO accounts(email, provider, display_name, client, created_at, status, source_kind) VALUES (?, ?, ?, ?, ?, 'live', 'auto_discovered')", (email, provider, email, client, now))
    return conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone()


def sync_cli() -> dict[str, Any]:
    changed = matched = discovered = 0
    with db() as conn:
        for item in load_status_files():
            email = str(item.get("email") or "").strip().lower()
            if not email: continue
            before = conn.execute("SELECT id FROM accounts WHERE lower(email)=? AND lower(provider)='antigravity' AND lower(client)='antigravity cli'", (email,)).fetchone()
            account = ensure_account(conn, email, "Antigravity CLI")
            if account is None: continue
            discovered += 1 if before is None else 0
            age = payload_age(item); quota = item.get("quota") or {}
            percentages = [float(b["remaining_fraction"])*100 for b in quota.values() if isinstance(b, dict) and b.get("remaining_fraction") is not None]
            status = "stale" if age is None or age > 3600 else ("exhausted" if percentages and max(percentages) <= 0 else ("live" if age <= 60 else "stale"))
            captured = str(item.get("captured_at") or now_iso())
            conn.execute("UPDATE accounts SET status=?, plan_tier=?, last_seen_at=?, last_error=NULL WHERE id=?", (status, item.get("plan_tier"), captured, account["id"]))
            matched += 1
            for bucket_id, bucket in quota.items():
                if not isinstance(bucket, dict): continue
                pct = bucket.get("remaining_fraction"); pct = None if pct is None else max(0,min(100,float(pct)*100))
                window = bucket_name(str(bucket_id)); reset = bucket.get("reset_time")
                exists = conn.execute("SELECT 1 FROM quota_snapshots WHERE account_id=? AND client='Antigravity CLI' AND model=? AND window_name=? AND captured_at=?", (account["id"], str(bucket_id), window, captured)).fetchone()
                if not exists:
                    conn.execute("INSERT INTO quota_snapshots(account_id,service,client,model,window_name,remaining_percent,unit,reset_at,source,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (account["id"],"Antigravity","Antigravity CLI",str(bucket_id),window,pct,"provider quota",reset,"antigravity-statusline",captured)); changed += 1
            ctx = item.get("context_window") or {}; size = ctx.get("context_window_size"); used = ctx.get("used_percentage")
            if size is not None and used is not None:
                exists = conn.execute("SELECT 1 FROM quota_snapshots WHERE account_id=? AND client='Antigravity CLI' AND model='Context Window' AND captured_at=?", (account["id"],captured)).fetchone()
                if not exists:
                    conn.execute("INSERT INTO quota_snapshots(account_id,service,client,model,window_name,remaining_percent,used_units,limit_units,unit,source,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (account["id"],"Antigravity","Antigravity CLI","Context Window","Context Window",max(0,min(100,100-float(used))),float(size)*float(used)/100,float(size),"tokens","antigravity-statusline",captured)); changed += 1
    return {"changed":changed,"matched":matched,"discovered":discovered}


def sync_desktop() -> dict[str, Any]:
    result = probe_antigravity_2()
    if not result.get("ok"): return {"ok":False,"changed":0,"matched":0,"discovered":0,"error":result.get("error")}
    email = str(result.get("email") or "").strip().lower()
    if not email: return {"ok":False,"changed":0,"matched":0,"discovered":0,"error":"Antigravity 2.0 did not report an account email"}
    captured = datetime.fromtimestamp(float(result.get("captured_at") or datetime.now(timezone.utc).timestamp()), timezone.utc).isoformat()
    windows = result.get("windows") or []
    with db() as conn:
        before = conn.execute("SELECT id FROM accounts WHERE lower(email)=? AND lower(provider)='antigravity' AND lower(client)='antigravity 2.0'", (email,)).fetchone()
        account = ensure_account(conn, email, "Antigravity 2.0")
        if account is None: return {"ok":False,"changed":0,"matched":0,"discovered":0,"error":"Account is ignored/deleted in AI Quota"}
        discovered = 1 if before is None else 0
        values = [float(x["remaining_fraction"])*100 for x in windows if x.get("remaining_fraction") is not None]
        status = "exhausted" if values and max(values) <= 0 else "live"
        conn.execute("UPDATE accounts SET status=?, plan_tier=?, last_seen_at=?, last_error=NULL WHERE id=?", (status, result.get("plan_tier"), captured, account["id"]))
        changed = 0
        for item in windows:
            frac = item.get("remaining_fraction"); pct = None if frac is None else max(0,min(100,float(frac)*100))
            model = str(item.get("model") or item.get("group") or "Antigravity")
            window = str(item.get("window_name") or "Quota")
            if conn.execute("SELECT 1 FROM quota_snapshots WHERE account_id=? AND client='Antigravity 2.0' AND model=? AND window_name=? AND captured_at=?", (account["id"],model,window,captured)).fetchone(): continue
            conn.execute("INSERT INTO quota_snapshots(account_id,service,client,model,window_name,remaining_percent,unit,reset_at,source,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (account["id"],"Antigravity","Antigravity 2.0",model,window,pct,"provider quota",item.get("reset_at"),"antigravity-2.0-local-language-server",captured)); changed += 1
    return {"ok":True,"changed":changed,"matched":1,"discovered":discovered,"email":email,"plan_tier":result.get("plan_tier")}


def sync_all() -> dict[str, Any]:
    cli = sync_cli(); desktop = sync_desktop()
    return {"ok":True,"cli":cli,"desktop":desktop,"changed":int(cli.get("changed",0))+int(desktop.get("changed",0)),"matched":int(cli.get("matched",0))+int(desktop.get("matched",0)),"discovered":int(cli.get("discovered",0))+int(desktop.get("discovered",0))}


def current_status(email: str, client: str) -> tuple[float | None, dict[str, Any] | None]:
    if client.lower() == "antigravity 2.0":
        with db() as conn: row = conn.execute("SELECT last_seen_at FROM accounts WHERE lower(email)=? AND lower(client)=? ORDER BY id LIMIT 1", (email.lower(),client.lower())).fetchone()
        if not row or not row["last_seen_at"]: return None, None
        try: return max(0.0,(datetime.now(timezone.utc)-datetime.fromisoformat(row["last_seen_at"])).total_seconds()), None
        except ValueError: return None, None
    path = status_path(email)
    if not path.exists(): return None, None
    try:
        payload = json.loads(path.read_text(encoding="utf-8")); return payload_age(payload), payload
    except Exception: return None, None


def latest_snapshots(account_id: int) -> list[dict[str, Any]]:
    with db() as conn: rows = conn.execute("SELECT * FROM quota_snapshots WHERE account_id=? ORDER BY captured_at DESC LIMIT 200", (account_id,)).fetchall()
    seen=set(); out=[]
    for row in rows:
        key=(row["service"],row["client"],row["model"],row["window_name"])
        if key in seen: continue
        seen.add(key); out.append(dict(row))
    return out


def normalize(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row); age,payload = current_status(item["email"], item.get("client") or "")
    item["telemetry_age_seconds"] = age
    if payload:
        item["plan_tier"] = payload.get("plan_tier") or item.get("plan_tier")
        item["model"] = (payload.get("model") or {}).get("display_name") if isinstance(payload.get("model"),dict) else payload.get("model")
        item["context_window"] = payload.get("context_window") or {}
    return item


@app.on_event("startup")
def startup() -> None:
    init_db(); sync_all()


@app.get("/")
def index() -> FileResponse: return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, Any]: return {"status":"ok","app":"AI Quota","time":now_iso()}


@app.get("/api/accounts")
def accounts() -> list[dict[str, Any]]:
    sync_all()
    with db() as conn: rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    return [normalize(r) for r in rows]


@app.post("/api/accounts", status_code=201)
def add_account(item: AccountIn) -> dict[str, Any]:
    email=item.email.strip().lower(); provider=item.provider.strip(); client=item.client.strip()
    with db() as conn:
        conn.execute("DELETE FROM ignored_accounts WHERE email=? AND provider=? AND client=?", (email,provider.lower(),client.lower()))
        if conn.execute("SELECT 1 FROM accounts WHERE lower(email)=? AND lower(client)=?", (email,client.lower())).fetchone(): raise HTTPException(409,"That email/client combination is already in AI Quota")
        cur=conn.execute("INSERT INTO accounts(email,provider,display_name,client,created_at,status,source_kind) VALUES(?,?,?,?,?,'not_connected','provider')", (email,provider,item.display_name.strip(),client,now_iso()))
        row=conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone()
    return normalize(row)


@app.delete("/api/accounts/{account_id}", status_code=204)
def delete_account(account_id: int) -> None:
    with db() as conn:
        row=conn.execute("SELECT email,provider,client FROM accounts WHERE id=?",(account_id,)).fetchone()
        if not row: raise HTTPException(404,"Account not found")
        conn.execute("INSERT OR REPLACE INTO ignored_accounts(email,provider,client,ignored_at) VALUES(?,?,?,?)", (row["email"].lower(),row["provider"].lower(),row["client"].lower(),now_iso()))
        conn.execute("DELETE FROM accounts WHERE id=?",(account_id,))
    if row["client"].lower()=="antigravity cli":
        try: status_path(row["email"]).unlink(missing_ok=True)
        except OSError: pass


@app.post("/api/accounts/{account_id}/connect")
def connect_account(account_id: int) -> dict[str, Any]:
    with db() as conn: row=conn.execute("SELECT * FROM accounts WHERE id=?",(account_id,)).fetchone()
    if not row: raise HTTPException(404,"Account not found")
    provider=row["provider"].lower(); client=row["client"].lower()
    if provider=="antigravity" and "cli" in client:
        return {"ok":True,"mode":"global_active_session_telemetry","message":"The Antigravity CLI collector is installed globally. Restart Antigravity CLI. AI Quota matches the active session email and keeps each account's last-known quota.",**install_antigravity_bridge()}
    if provider=="antigravity" and "2.0" in client:
        result=sync_desktop()
        if result.get("ok") and result.get("email","").lower()==row["email"].lower(): return {"ok":True,"mode":"antigravity_2_0_local","message":"Connected to Antigravity 2.0 local quota service. AI Quota is reading the live quota summary.",**result}
        if result.get("ok"): return {"ok":False,"mode":"wrong_active_account","message":f"Antigravity 2.0 is active as {result.get('email')}, not {row['email']}. Switch accounts in Antigravity 2.0, then press Sync now.",**result}
        return {"ok":False,"mode":"antigravity_2_0_unavailable","message":"Could not find a live Antigravity 2.0 local quota service. Keep Antigravity 2.0 open and signed in, then press Sync now.","error":result.get("error")}
    return {"ok":False,"mode":"not_implemented","message":f"No direct live collector is implemented yet for {row['provider']} / {row['client']}. The account can still keep last-known snapshots."}


@app.post("/api/sync")
def sync() -> dict[str, Any]: return sync_all()


@app.get("/api/accounts/{account_id}/snapshots")
def account_snapshots(account_id: int) -> list[dict[str, Any]]:
    with db() as conn:
        if not conn.execute("SELECT 1 FROM accounts WHERE id=?",(account_id,)).fetchone(): raise HTTPException(404,"Account not found")
    return latest_snapshots(account_id)


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    sync_all()
    with db() as conn: rows=conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    cards=[]
    for row in rows:
        item=normalize(row); snaps=latest_snapshots(item["id"]); item["snapshots"]=snaps
        usable=[float(s["remaining_percent"]) for s in snaps if s.get("remaining_percent") is not None and s["window_name"]!="Context Window"]
        item["best_remaining"]=max(usable) if usable else None; cards.append(item)
    rank={"live":3,"stale":2,"not_connected":1,"exhausted":0}; ranked=sorted(cards,key=lambda c:(rank.get(c.get("status"),0),float(c.get("best_remaining") or 0)),reverse=True)
    summary={"accounts":len(cards),"live":sum(c.get("status")=="live" for c in cards),"stale":sum(c.get("status")=="stale" for c in cards),"not_connected":sum(c.get("status")=="not_connected" for c in cards),"exhausted":sum(c.get("status")=="exhausted" for c in cards),"best_account_id":ranked[0]["id"] if ranked and ranked[0].get("best_remaining") is not None else None}
    return {"summary":summary,"accounts":cards,"ranking":ranked[:10],"generated_at":now_iso()}


@app.get("/api/snapshots")
def snapshots(account_id: int | None=None) -> list[dict[str,Any]]:
    sync_all(); query="SELECT * FROM quota_snapshots"; args=()
    if account_id is not None: query += " WHERE account_id=?"; args=(account_id,)
    query += " ORDER BY captured_at DESC LIMIT 1000"
    with db() as conn: rows=conn.execute(query,args).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/snapshots", status_code=201)
def add_snapshot(item: SnapshotIn) -> dict[str,Any]:
    with db() as conn:
        if not conn.execute("SELECT 1 FROM accounts WHERE id=?",(item.account_id,)).fetchone(): raise HTTPException(404,"Account not found")
        cur=conn.execute("INSERT INTO quota_snapshots(account_id,service,client,model,window_name,remaining_percent,used_units,limit_units,unit,reset_at,source,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (item.account_id,item.service,item.client,item.model,item.window_name,item.remaining_percent,item.used_units,item.limit_units,item.unit,item.reset_at,item.source,now_iso()))
        return dict(conn.execute("SELECT * FROM quota_snapshots WHERE id=?",(cur.lastrowid,)).fetchone())


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app",host="127.0.0.1",port=8765,reload=False)


if __name__ == "__main__": run()
