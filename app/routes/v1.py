"""
AI-Quota 2.0 — v1 API Routes.

New versioned endpoints that extend the existing /api/ routes.
All existing /api/ routes remain fully operational.

Routes:
  GET  /api/v1/health
  GET  /api/v1/providers
  GET  /api/v1/providers/{provider_id}/health
  GET  /api/v1/accounts
  GET  /api/v1/accounts/{account_id}
  POST /api/v1/accounts
  DELETE /api/v1/accounts/{account_id}
  POST /api/v1/accounts/{account_id}/switch
  POST /api/v1/accounts/{account_id}/refresh
  GET  /api/v1/quota
  GET  /api/v1/history/{account_id}
  GET  /api/v1/events
  GET  /api/v1/events/stream     (SSE)
  POST /api/v1/sync
  GET  /api/v1/diagnostics
  GET  /api/v1/settings
  PUT  /api/v1/settings
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["v1"])

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "data"


# ─── Helper imports ───────────────────────────────────────────────────────

def _list_accounts() -> list[dict[str, Any]]:
    from app.services import list_accounts as _la, get_latest_snapshots
    from app.utils.time import payload_age
    from app.providers import get_provider_truth
    accounts = _la()
    result = []
    for acc in accounts:
        item = dict(acc)
        snaps = get_latest_snapshots(item["id"])
        item["snapshots"] = snaps
        age = payload_age(item.get("last_seen_at"))
        if age is None and snaps:
            latest = max(snaps, key=lambda s: s.get("captured_at", ""))
            age = payload_age(latest.get("captured_at"))
        item["telemetry_age_seconds"] = age
        usable = [
            float(s["remaining_percent"])
            for s in snaps
            if s.get("remaining_percent") is not None and s.get("window_name") != "Context Window"
        ]
        item["best_remaining"] = min(usable) if usable else None
        truth = get_provider_truth(item)
        item["provider_truth"] = {
            "authority_type": truth.authority_type,
            "label": truth.label,
            "priority": truth.priority,
            "live": truth.live,
            "truth": truth.truth,
            "note": truth.note,
        }
        result.append(item)
    return result


def _get_setting(key: str, default: str = "") -> str:
    try:
        from app.database import db_session
        with db_session() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            return row[0] if row else default
    except Exception:
        return default


def _set_setting(key: str, value: str) -> None:
    try:
        from app.database import db_session
        from app.utils.time import now_iso
        with db_session() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value, now_iso()),
            )
    except Exception:
        pass


# ─── Health ───────────────────────────────────────────────────────────────

@router.get("/health")
def health_v1() -> dict[str, Any]:
    from app.utils.time import now_iso
    db_path = DATA_DIR / "ai_quota.db"
    db_size = db_path.stat().st_size if db_path.exists() else 0
    return {
        "status": "ok",
        "app": "AI-Quota",
        "version": "2.0.0",
        "db_size_bytes": db_size,
        "time": now_iso(),
    }


# ─── Providers ────────────────────────────────────────────────────────────

@router.get("/providers")
def list_providers() -> list[dict[str, Any]]:
    try:
        from packages.core.provider_registry import get_all
        adapters = get_all()
    except ImportError:
        from app.providers import get_all_adapters
        adapters = get_all_adapters()

    result = []
    for adapter in adapters:
        try:
            caps = adapter.capabilities()
            caps_dict = {
                "quota": caps.supports_quota,
                "detection": caps.supports_account_detection,
                "switching": caps.supports_account_switching,
                "instant_switch": caps.supports_instant_switch,
                "switch_method": caps.switch_method.value if hasattr(caps.switch_method, "value") else str(caps.switch_method),
            }
        except Exception:
            caps_dict = {}

        try:
            detection = adapter.detect()
            detected = detection.detected
            hub_url = detection.hub_url
        except Exception:
            detected = False
            hub_url = None

        truth = adapter.truth
        result.append({
            "id": adapter.id,
            "display_name": adapter.display_name,
            "supported_clients": adapter.supported_clients,
            "truth": {
                "authority_type": truth.authority_type,
                "live": truth.live,
                "label": truth.label,
                "note": truth.note,
            },
            "capabilities": caps_dict,
            "detected": detected,
            "hub_url": hub_url,
        })
    return result


@router.get("/providers/{provider_id}/health")
def provider_health(provider_id: str) -> dict[str, Any]:
    try:
        from packages.core.provider_registry import get_by_id
        adapter = get_by_id(provider_id)
    except ImportError:
        from app.providers import get_all_adapters
        adapter = next((a for a in get_all_adapters() if a.id == provider_id), None)

    if not adapter:
        raise HTTPException(404, f"Provider '{provider_id}' not found")

    try:
        health = adapter.health_check()
        return {
            "provider_id": health.provider_id,
            "status": health.status,
            "last_check_at": health.last_check_at,
            "latency_ms": health.latency_ms,
            "error": health.error,
        }
    except Exception as exc:
        return {"provider_id": provider_id, "status": "error", "error": str(exc)}


# ─── Accounts ─────────────────────────────────────────────────────────────

@router.get("/accounts")
def get_accounts_v1() -> list[dict[str, Any]]:
    return _list_accounts()


@router.get("/accounts/{account_id}")
def get_account_v1(account_id: int) -> dict[str, Any]:
    from app.services import get_account_by_id, get_latest_snapshots
    from app.utils.time import payload_age
    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    item = dict(acc)
    snaps = get_latest_snapshots(account_id)
    item["snapshots"] = snaps
    usable = [float(s["remaining_percent"]) for s in snaps if s.get("remaining_percent") is not None and s.get("window_name") != "Context Window"]
    item["best_remaining"] = min(usable) if usable else None
    item["telemetry_age_seconds"] = payload_age(item.get("last_seen_at"))
    return item


@router.post("/accounts", status_code=201)
def add_account_v1(item: Any) -> dict[str, Any]:
    # delegate to existing route handler
    from app.services import create_account
    from app.models import AccountIn
    if not isinstance(item, dict):
        item = item.dict() if hasattr(item, "dict") else {}
    try:
        acc = create_account(
            email=item.get("email", "").strip().lower(),
            provider=item.get("provider", "Antigravity").strip(),
            client=item.get("client", "Antigravity CLI").strip(),
            display_name=item.get("display_name", "").strip(),
        )
    except KeyError as exc:
        raise HTTPException(409, str(exc))
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return acc


@router.delete("/accounts/{account_id}", status_code=204, response_class=Response)
def remove_account_v1(account_id: int) -> Response:
    from app.services import delete_account
    deleted = delete_account(account_id)
    if not deleted:
        raise HTTPException(404, "Account not found")
    return Response(status_code=204)


# ─── Switch ───────────────────────────────────────────────────────────────

@router.post("/accounts/{account_id}/switch")
def switch_account(account_id: int, force: bool = Query(default=False)) -> dict[str, Any]:
    """
    Switch to the specified account using the capability-based switch engine.
    Requires the account's provider to support account switching.
    Returns SwitchResult — never reports success without verification.
    """
    from app.services import get_account_by_id
    from app.providers import find_adapter

    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")

    adapter = find_adapter(acc["provider"], acc["client"])
    if not adapter:
        raise HTTPException(422, f"No adapter found for provider={acc['provider']} / client={acc['client']}")

    try:
        from packages.core.switch_engine import get_switch_engine
        engine = get_switch_engine()
        target_ulid = acc.get("account_id") or str(acc["id"])
        result = engine.switch(adapter, target_ulid, force=force)
        return {
            "requested_account_id": result.requested_account_id,
            "status": result.status.value,
            "method_used": result.method_used.value,
            "verified": result.verified,
            "active_account_id": result.active_account_id,
            "reason": result.reason,
            "switch_event_id": result.switch_event_id,
        }
    except ImportError:
        raise HTTPException(503, "Switch engine not available")


@router.post("/accounts/{account_id}/refresh")
def refresh_account(account_id: int) -> dict[str, Any]:
    from app.services import get_account_by_id, sync_all
    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    result = sync_all()
    return {"ok": True, "account_id": account_id, "sync": result}


# ─── Quota ────────────────────────────────────────────────────────────────

@router.get("/quota")
def get_quota_all() -> list[dict[str, Any]]:
    return _list_accounts()


@router.get("/quota/{account_id}")
def get_quota_for_account(account_id: int) -> dict[str, Any]:
    from app.services import get_account_by_id, get_latest_snapshots
    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    snaps = get_latest_snapshots(account_id)
    return {"account_id": account_id, "snapshots": snaps}


# ─── History ──────────────────────────────────────────────────────────────

@router.get("/history")
def get_history_all(period: str = Query(default="24h")) -> list[dict[str, Any]]:
    from app.services.account_service import list_accounts
    from app.services import list_snapshots
    results = []
    for acc in list_accounts():
        snaps = _history_for_account(acc["id"], period)
        results.append({"account_id": acc["id"], "period": period, "points": snaps})
    return results


@router.get("/history/{account_id}")
def get_history_for_account(account_id: int, period: str = Query(default="24h")) -> dict[str, Any]:
    from app.services import get_account_by_id
    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    points = _history_for_account(account_id, period)
    return {"account_id": account_id, "period": period, "points": points}


def _history_for_account(account_id: int, period: str) -> list[dict[str, Any]]:
    _period_map = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}
    days = _period_map.get(period, 1)
    from app.database import db_session
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT captured_at, window_name, remaining_percent, source
            FROM quota_snapshots
            WHERE account_id = ?
              AND captured_at >= datetime('now', ?)
            ORDER BY captured_at ASC
            """,
            (account_id, f"-{days} days"),
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Events ───────────────────────────────────────────────────────────────

@router.get("/events")
def list_events(limit: int = Query(default=50, le=500)) -> list[dict[str, Any]]:
    try:
        from app.database import db_session
        with db_session() as conn:
            rows = conn.execute(
                "SELECT * FROM events ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        result = []
        for r in rows:
            row = dict(r)
            try:
                row["payload"] = json.loads(row.get("payload", "{}"))
            except Exception:
                row["payload"] = {}
            result.append(row)
        return result
    except Exception:
        return []


# ─── SSE event stream ─────────────────────────────────────────────────────

@router.get("/events/stream", response_class=StreamingResponse)
async def event_stream(request: Any = None) -> StreamingResponse:
    """
    Server-Sent Events stream.
    Clients receive a heartbeat every 5 seconds and quota updates on sync.
    """
    from app.utils.time import now_iso

    async def generator() -> AsyncGenerator[str, None]:
        last_sync_time = 0.0
        SYNC_INTERVAL = 30.0
        while True:
            import time
            now = time.monotonic()
            yield f"data: {json.dumps({'type': 'heartbeat', 'time': now_iso()})}\n\n"
            if now - last_sync_time > SYNC_INTERVAL:
                last_sync_time = now
                try:
                    from app.services import sync_all
                    sync_all()
                    accounts = _list_accounts()
                    yield f"data: {json.dumps({'type': 'quota_update', 'accounts': accounts, 'time': now_iso()})}\n\n"
                except Exception:
                    pass
            await asyncio.sleep(5)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Sync ─────────────────────────────────────────────────────────────────

@router.post("/sync")
def sync_v1() -> dict[str, Any]:
    from app.services import sync_all
    return sync_all()


# ─── Diagnostics ──────────────────────────────────────────────────────────

@router.get("/diagnostics")
def get_diagnostics() -> dict[str, Any]:
    from app.utils.time import now_iso

    db_path = DATA_DIR / "ai_quota.db"
    db_size = db_path.stat().st_size if db_path.exists() else 0

    try:
        from app.providers import get_all_adapters
        adapters = get_all_adapters()
    except Exception:
        adapters = []

    providers_status = []
    for adapter in adapters:
        try:
            health = adapter.health_check()
            providers_status.append({
                "id": adapter.id,
                "display_name": adapter.display_name,
                "status": health.status,
                "error": health.error,
                "latency_ms": health.latency_ms,
            })
        except Exception as exc:
            providers_status.append({
                "id": adapter.id,
                "display_name": adapter.display_name,
                "status": "error",
                "error": str(exc),
            })

    # Settings (no secrets)
    try:
        from app.database import db_session
        with db_session() as conn:
            rows = conn.execute("SELECT key, value FROM settings").fetchall()
        settings = {r["key"]: r["value"] for r in rows}
    except Exception:
        settings = {}

    return {
        "agent_version": "2.0.0",
        "db_path": str(db_path),
        "db_size_bytes": db_size,
        "providers": providers_status,
        "settings": settings,
        "generated_at": now_iso(),
    }


# ─── Settings ─────────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings() -> dict[str, str]:
    try:
        from app.database import db_session
        with db_session() as conn:
            rows = conn.execute("SELECT key, value FROM settings ORDER BY key").fetchall()
        return {r["key"]: r["value"] for r in rows}
    except Exception:
        return {}


@router.put("/settings")
def update_settings(updates: dict[str, str]) -> dict[str, Any]:
    """Update one or more settings. Returns updated key list."""
    from app.utils.time import now_iso

    # Safety: do not allow arbitrary settings keys that could be misused
    _SAFE_KEYS = {
        "poll_interval_seconds",
        "notification_threshold_percent",
        "auto_switch_enabled",
        "switch_cooldown_seconds",
        "max_switches_per_hour",
        "telemetry_stale_threshold_seconds",
        "telemetry_very_stale_threshold_seconds",
    }
    updated = []
    rejected = []
    now = now_iso()
    try:
        from app.database import db_session
        with db_session() as conn:
            for key, value in updates.items():
                if key in _SAFE_KEYS:
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                        (key, str(value), now),
                    )
                    updated.append(key)
                else:
                    rejected.append(key)
    except Exception as exc:
        raise HTTPException(500, str(exc))

    return {"updated": updated, "rejected": rejected}
