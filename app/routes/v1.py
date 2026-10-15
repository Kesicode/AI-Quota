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
from pydantic import BaseModel

router = APIRouter(tags=["v1"])

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "data"


# ─── Helper imports ───────────────────────────────────────────────────────

def _list_accounts() -> list[dict[str, Any]]:
    from app.services.account_service import list_accounts as _la
    from app.services.account_serializer import serialize_accounts
    return serialize_accounts(_la())


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
def remove_account_v1(account_id: int, force: bool = Query(default=False)) -> Response:
    from app.services import get_account_by_id, delete_account
    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    if acc.get("status") == "live" and not force:
        raise HTTPException(400, "Active Account Protection: Cannot delete the currently active account. Switch accounts or sign out first.")
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
def get_history_all(
    period: str = Query(default="24h"),
    format: str = Query(default="json", description="json | csv"),
) -> Any:
    """
    Return quota history for ALL accounts, flat-merged.
    Supports ?format=csv for CSV export.
    """
    from app.services.account_service import list_accounts
    all_points: list[dict[str, Any]] = []
    for acc in list_accounts():
        pts = _history_for_account(acc["id"], period)
        for p in pts:
            p["account_id"] = acc.get("account_id") or str(acc["id"])
            p["email"] = acc.get("email", "")
        all_points.extend(pts)

    if format == "csv":
        return _history_to_csv_response(all_points, f"ai_quota_history_{period}.csv")

    return {
        "period": period,
        "total_points": len(all_points),
        "points": all_points,
    }



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


def _history_to_csv_response(points: list[dict[str, Any]], filename: str) -> Response:
    """Convert list of snapshot dicts to a streaming CSV download Response."""
    import csv, io
    if not points:
        return Response(content="No data available for the requested period.", media_type="text/plain")
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(points[0].keys()))
    writer.writeheader()
    writer.writerows(points)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


# ─── History Export & Analytics (Phase 10) ───────────────────────────────

@router.get("/history/{account_id}/export")
def export_account_history(
    account_id: int,
    period: str = Query("7d", description="24h | 7d | 30d"),
    format: str = Query("json", description="json | csv"),
) -> Any:
    """
    Export quota history for a single account as JSON or CSV.
    GET /api/v1/history/1/export?period=7d&format=csv
    """
    from app.services import get_account_by_id
    if not get_account_by_id(account_id):
        raise HTTPException(404, "Account not found")
    points = _history_for_account(account_id, period)
    if format == "csv":
        return _history_to_csv_response(points, f"ai_quota_history_{account_id}_{period}.csv")
    return {
        "account_id": account_id,
        "period": period,
        "total_points": len(points),
        "points": points,
    }


@router.get("/analytics")
def get_analytics(period: str = Query("7d", description="24h | 7d | 30d")) -> dict[str, Any]:
    """
    Aggregated analytics across all accounts.
    Returns avg_quota_percent, max_quota_percent, most_used_account,
    accounts_with_data, period, total_snapshots.
    """
    from app.services.account_service import list_accounts
    per_account: dict[str, list[float]] = {}
    total = 0

    for acc in list_accounts():
        points = _history_for_account(acc["id"], period)
        total += len(points)
        key = acc.get("account_id") or str(acc["id"])
        pcts = [
            float(p["remaining_percent"])
            for p in points
            if p.get("remaining_percent") is not None
        ]
        if pcts:
            per_account[key] = pcts

    all_pcts = [v for vals in per_account.values() for v in vals]
    avg = sum(all_pcts) / len(all_pcts) if all_pcts else None
    mx = max(all_pcts) if all_pcts else None
    most_used = (
        min(per_account, key=lambda k: sum(per_account[k]) / len(per_account[k]))
        if per_account else None
    )

    return {
        "period": period,
        "total_snapshots": total,
        "accounts_with_data": len(per_account),
        "avg_quota_percent": round(avg, 1) if avg is not None else None,
        "max_quota_percent": round(mx, 1) if mx is not None else None,
        "most_used_account_id": most_used,
    }



def _history_points(account_id: int, period: str) -> list[dict[str, Any]]:
    """Return detailed snapshot rows for an account filtered by period (uses quota_snapshots table)."""
    from datetime import datetime, timezone, timedelta

    _PERIOD_MAP = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}

    days = _PERIOD_MAP.get(period, 7)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    try:
        from app.database import db_session
        with db_session() as conn:
            rows = conn.execute(
                """
                SELECT window_name, quota_bucket, remaining_percent,
                       used_units, limit_units, unit, reset_at,
                       source, captured_at, staleness_tier
                FROM quota_snapshots
                WHERE account_id = ? AND captured_at >= ?
                ORDER BY captured_at ASC
                """,
                (account_id, cutoff),
            ).fetchall()
    except Exception:
        return []

    return [
        {
            "window_name": r[0],
            "quota_bucket": r[1],
            "remaining_percent": r[2],
            "used_units": r[3],
            "limit_units": r[4],
            "unit": r[5],
            "reset_at": r[6],
            "source": r[7],
            "captured_at": r[8],
            "staleness_tier": r[9],
        }
        for r in rows
    ]


def _points_to_csv_response(points: list[dict[str, Any]], filename: str) -> Response:
    """Convert list of point dicts to a CSV download response."""
    import csv
    import io

    if not points:
        return Response(
            content="No data available for the requested period.",
            media_type="text/plain",
        )

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(points[0].keys()))
    writer.writeheader()
    writer.writerows(points)

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/analytics/export")
def export_all_analytics(
    period: str = Query("7d", description="24h | 7d | 30d"),
    format: str = Query("json", description="json | csv"),
) -> Any:
    """
    Export quota history and analytics across all accounts as JSON or CSV.
    GET /api/v1/analytics/export?period=7d&format=csv
    """
    from app.services.account_service import list_accounts
    from app.utils.time import now_iso
    all_points: list[dict[str, Any]] = []
    accounts = list_accounts()
    for acc in accounts:
        pts = _history_for_account(acc["id"], period)
        for p in pts:
            row = {
                "account_id": acc.get("account_id") or str(acc["id"]),
                "email": acc.get("email", ""),
                "provider": acc.get("provider", ""),
                "display_name": acc.get("display_name", "") or acc.get("label", ""),
                **p,
            }
            all_points.append(row)
    if format == "csv":
        return _history_to_csv_response(all_points, f"ai_quota_analytics_{period}.csv")
    return {
        "period": period,
        "exported_at": now_iso(),
        "total_accounts": len(accounts),
        "total_snapshots": len(all_points),
        "snapshots": all_points,
    }


# ─── Phase 15 — Predictions & Recommendations ─────────────────────────────

@router.get("/predictions")
def get_predictions(period: str = Query("24h", description="History window: 24h | 7d")) -> dict[str, Any]:
    """
    Run the quota prediction engine across all accounts.
    Returns velocity, exhaustion forecast, reset timing, and account recommendation.
    """
    from app.services.account_service import list_accounts
    from packages.core.prediction_engine import predict_for_account, recommend  # type: ignore

    accounts = list_accounts()
    predictions = []

    for acc in accounts:
        snaps = _history_for_account(acc["id"], period)
        pred = predict_for_account(
            account_id=acc["id"],
            provider=acc.get("provider", ""),
            snapshots=snaps,
        )
        predictions.append(pred)

    result = recommend(predictions)

    def _ser(p) -> dict[str, Any]:
        return {
            "account_id":            p.account_id,
            "provider":              p.provider,
            "window_name":           p.window_name,
            "current_pct":           p.current_pct,
            "trend":                 p.trend,
            "velocity_pph":          p.velocity_pph,
            "exhausted_at":          p.exhausted_at.isoformat() if p.exhausted_at else None,
            "reset_at":              p.reset_at.isoformat() if p.reset_at else None,
            "hours_until_exhausted": p.hours_until_exhausted,
            "hours_until_reset":     p.hours_until_reset,
            "recommended":           p.recommended,
            "recommendation_reason": p.recommendation_reason,
            "risk_level":            p.risk_level,
            "warning":               p.warning,
        }

    return {
        "best_account_id":   result.best_account_id,
        "best_account_name": result.best_account_name,
        "reason":            result.reason,
        "generated_at":      result.generated_at,
        "predictions":       [_ser(p) for p in result.predictions],
    }


# ─── Phase 16 — Account Label / Notes Editor ──────────────────────────────

class AccountLabelUpdate(BaseModel):
    label:      str | None = None
    group_name: str | None = None
    color:      str | None = None
    notes:      str | None = None
    priority:   int | None = None


@router.patch("/accounts/{account_id}/label")
def update_account_label(account_id: int, body: AccountLabelUpdate) -> dict[str, Any]:
    """
    PATCH /api/v1/accounts/{id}/label
    Update display metadata: label, group, color, notes, priority.
    These fields are purely local — never synced to the provider.
    """
    from app.database import db_session
    from app.services import get_account_by_id

    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")

    updates: dict[str, Any] = {}
    if body.label      is not None: updates["label"]      = body.label
    if body.group_name is not None: updates["group_name"] = body.group_name
    if body.color      is not None: updates["color"]      = body.color
    if body.notes      is not None: updates["notes"]      = body.notes
    if body.priority   is not None: updates["priority"]   = body.priority

    if not updates:
        raise HTTPException(422, "No fields to update")

    set_clauses = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [account_id]

    try:
        with db_session() as conn:
            conn.execute(
                f"UPDATE accounts SET {set_clauses}, last_seen_at = datetime('now') WHERE id = ?",
                values,
            )
        refreshed = get_account_by_id(account_id)
        return refreshed or {}
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.get("/accounts/{account_id}/notes")
def get_account_notes(account_id: int) -> dict[str, Any]:
    """Return just the notes/label fields for an account."""
    from app.services import get_account_by_id
    acc = get_account_by_id(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    return {
        "account_id": account_id,
        "label":      acc.get("label"),
        "group_name": acc.get("group_name"),
        "color":      acc.get("color"),
        "notes":      acc.get("notes"),
        "priority":   acc.get("priority"),
    }


# ─── Phase 17 — Webhook / Alert System ────────────────────────────────────

_WEBHOOK_SAFE_KEYS = frozenset(["webhook_url", "webhook_threshold", "webhook_enabled"])


class WebhookConfig(BaseModel):
    webhook_url:       str | None = None
    webhook_threshold: int | None = None   # 0-100 percent
    webhook_enabled:   bool | None = None


@router.get("/webhooks/config")
def get_webhook_config() -> dict[str, Any]:
    """Return current webhook configuration from settings table."""
    from app.services.webhook_service import get_webhook_config as _get_cfg
    try:
        return _get_cfg()
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.put("/webhooks/config")
def update_webhook_config(body: WebhookConfig) -> dict[str, Any]:
    """Persist webhook settings. URL stored locally — never sent to provider."""
    from app.database import db_session
    from app.utils.time import now_iso

    updates: dict[str, str] = {}
    if body.webhook_url       is not None: updates["webhook_url"]       = body.webhook_url
    if body.webhook_threshold is not None: updates["webhook_threshold"] = str(body.webhook_threshold)
    if body.webhook_enabled   is not None: updates["webhook_enabled"]   = str(body.webhook_enabled).lower()

    if not updates:
        raise HTTPException(422, "No fields to update")

    now = now_iso()
    try:
        with db_session() as conn:
            for key, value in updates.items():
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, value, now),
                )
    except Exception as exc:
        raise HTTPException(500, str(exc))

    return {"updated": list(updates.keys()), "ok": True}


@router.post("/webhooks/test")
def test_webhook() -> dict[str, Any]:
    """
    Send a test payload to the configured webhook URL.
    Payload format: { event, timestamp, message, accounts: [] }
    """
    import urllib.request, urllib.error, json as _json
    from app.utils.time import now_iso

    cfg = get_webhook_config()
    url = cfg.get("webhook_url")
    if not url:
        raise HTTPException(422, "No webhook_url configured")
    if not cfg.get("webhook_enabled"):
        raise HTTPException(422, "Webhook is disabled. Enable it first.")

    payload = _json.dumps({
        "event":     "test",
        "source":    "ai-quota",
        "timestamp": now_iso(),
        "message":   "AI-Quota webhook test — configuration is working.",
        "accounts":  [],
    }).encode()

    try:
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "AI-Quota/2.0"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            status = resp.status
        return {"ok": True, "http_status": status, "url": url}
    except urllib.error.HTTPError as e:
        return {"ok": False, "http_status": e.code, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/webhooks/fire")
def fire_quota_alerts() -> dict[str, Any]:
    """
    Scan all accounts and fire webhook alerts for any below the threshold.
    Called automatically by the sync engine and can be triggered manually.
    Delegates to app.services.webhook_service to avoid circular imports.
    """
    from app.services.webhook_service import fire_quota_alerts as _fire
    return _fire()


# ─── Phase 20 — Quota Matrix ──────────────────────────────────────────────────

@router.get("/matrix")
def get_quota_matrix() -> dict[str, Any]:
    """
    GET /api/v1/matrix

    Returns a structured cross-account, cross-window quota grid.

    Shape:
      {
        "windows":    ["5h", "1h", "daily", ...],   # all unique window names
        "providers":  ["antigravity", "gemini", ...],
        "accounts": [
          {
            "id": 1,
            "account_id": "acc_...",
            "display_name": "user@example.com",
            "provider": "antigravity",
            "client": "desktop",
            "label": "Work",
            "status": "live",
            "best_remaining": 72.5,
            "windows": {
              "5h":    {"remaining_pct": 72.5, "reset_at": "...", "staleness": "live"},
              "1h":    {"remaining_pct": 55.0, "reset_at": "...", "staleness": "recent"},
            }
          }
        ],
        "generated_at": "..."
      }

    Provider truth is preserved — each row only shows its own provider's data.
    Accounts with no snapshots still appear (with null window values).
    Never mixes unrelated provider quota systems.
    """
    from app.services import list_accounts, get_latest_snapshots
    from app.utils.time import now_iso

    accounts = list_accounts()
    all_windows: set[str] = set()
    rows = []

    for acc in accounts:
        snaps = get_latest_snapshots(acc["id"])
        windows: dict[str, Any] = {}
        for s in snaps:
            wname = s.get("window_name") or "default"
            all_windows.add(wname)
            pct = s.get("remaining_percent")
            windows[wname] = {
                "remaining_pct": round(float(pct), 1) if pct is not None else None,
                "reset_at":      s.get("reset_at"),
                "staleness":     s.get("staleness_tier", "UNKNOWN"),
                "used_units":    s.get("used_units"),
                "limit_units":   s.get("limit_units"),
                "unit":          s.get("unit"),
            }

        best = acc.get("best_remaining")
        rows.append({
            "id":            acc["id"],
            "account_id":    acc.get("account_id") or str(acc["id"]),
            "display_name":  acc.get("display_name") or acc.get("email") or f"Account {acc['id']}",
            "email":         acc.get("email"),
            "provider":      acc.get("provider", "unknown"),
            "client":        acc.get("client", ""),
            "label":         acc.get("label", ""),
            "status":        acc.get("status", "unknown"),
            "best_remaining": round(float(best), 1) if best is not None else None,
            "windows":       windows,
        })

    # Sort windows by common order, then alphabetical
    window_order = ["5h", "1h", "daily", "monthly", "default"]
    sorted_windows = sorted(
        all_windows,
        key=lambda w: (window_order.index(w) if w in window_order else 99, w),
    )

    # Sort rows: best quota first (live accounts prioritised)
    rows.sort(key=lambda r: (
        0 if r["status"] == "live" else 1,
        -(r["best_remaining"] or 0),
    ))

    providers = sorted({r["provider"] for r in rows})

    return {
        "windows":      sorted_windows,
        "providers":    providers,
        "accounts":     rows,
        "total":        len(rows),
        "generated_at": now_iso(),
    }

# ─── Phase C — Backup, Recovery & Vault Management ───────────────────────────

class AccountImportItem(BaseModel):
    email: str
    provider: str = "Antigravity"
    client: str = "Antigravity 2.0"
    display_name: str | None = None
    label: str | None = None
    group_name: str | None = None
    color: str | None = None
    priority: int = 50
    notes: str | None = None


class AccountImportPayload(BaseModel):
    accounts: list[AccountImportItem]


@router.get("/accounts/backup/export")
def export_accounts() -> dict[str, Any]:
    """Export all registered accounts to a portable JSON backup format."""
    from app.services.account_service import list_accounts
    from app.utils.time import now_iso
    accounts = list_accounts()
    export_list = []
    for acc in accounts:
        export_list.append({
            "account_id":   acc.get("account_id"),
            "email":        acc.get("email"),
            "provider":     acc.get("provider", "Antigravity"),
            "client":       acc.get("client", "Antigravity 2.0"),
            "display_name": acc.get("display_name"),
            "label":        acc.get("label"),
            "group_name":   acc.get("group_name"),
            "color":        acc.get("color"),
            "priority":     acc.get("priority", 50),
            "notes":        acc.get("notes"),
        })
    return {
        "schema": "ai-quota.accounts.backup.v1",
        "version": 1,
        "exported_at": now_iso(),
        "total": len(export_list),
        "accounts": export_list,
    }


@router.post("/accounts/backup/import")
def import_accounts(payload: AccountImportPayload) -> dict[str, Any]:
    """Import accounts from a portable JSON backup. Adds new accounts or updates existing labels."""
    from app.services.account_service import list_accounts, create_account, update_account_labels
    existing = {a.get("email", "").lower(): a for a in list_accounts()}
    added = 0
    updated = 0
    for item in payload.accounts:
        em = item.email.strip().lower()
        if not em:
            continue
        if em in existing:
            acc = existing[em]
            update_account_labels(
                acc["id"],
                label=item.label,
                group_name=item.group_name,
                color=item.color,
                notes=item.notes,
            )
            updated += 1
        else:
            try:
                create_account(
                    email=item.email.strip(),
                    provider=item.provider.strip(),
                    client=item.client.strip(),
                    display_name=(item.display_name or item.label or item.email).strip(),
                )
                added += 1
            except Exception:
                pass
    return {"ok": True, "added": added, "updated": updated, "total": added + updated}


@router.post("/system/restart-backend")
def restart_backend() -> dict[str, Any]:
    """Terminate and reload the local language server process for clean recovery."""
    from providers.antigravity.switcher import kill_antigravity_language_servers
    from app.providers.antigravity_2 import _PROBE_CACHE, _WORKING_ENDPOINT
    _PROBE_CACHE["expires"] = 0.0
    _WORKING_ENDPOINT.update({"pid": None, "port": None, "csrf": None})
    terminated = kill_antigravity_language_servers()
    return {"ok": True, "message": "Language server restart initiated", "terminated": terminated}


@router.post("/vault/purge")
def purge_vault() -> dict[str, Any]:
    """Purge all stored tokens and credentials from the local OS vault."""
    from packages.security.credential_manager import get_credential_manager
    from app.services.account_service import list_accounts
    cm = get_credential_manager()
    purged = 0
    for acc in list_accounts():
        acc_id = acc.get("account_id") or str(acc["id"])
        if cm.has_credential(acc_id):
            cm.delete(acc_id)
            purged += 1
    return {"ok": True, "purged": purged}
