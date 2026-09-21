from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .models import AccountIn, SnapshotIn
from .providers import find_adapter, get_provider_truth
from .services import (
    create_account,
    delete_account,
    get_account_by_id,
    get_latest_snapshots,
    list_accounts,
    list_snapshots,
    record_snapshot,
    sync_all,
)
from .utils.logging import get_logger
from .utils.time import now_iso, payload_age

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"

logger = get_logger("ai_quota.main")

app = FastAPI(title="AI Quota", docs_url="/api/docs", redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def on_startup() -> None:
    logger.info("Initializing AI Quota database...")
    init_db()


def normalize_account(account: dict[str, Any]) -> dict[str, Any]:
    item = dict(account)
    snaps = get_latest_snapshots(item["id"])
    item["snapshots"] = snaps

    # Compute telemetry age based on last_seen_at or the latest snapshot
    age = None
    if item.get("last_seen_at"):
        age = payload_age(item["last_seen_at"])
    elif snaps:
        latest = max(snaps, key=lambda s: s.get("captured_at", ""))
        age = payload_age(latest.get("captured_at"))
    item["telemetry_age_seconds"] = age

    # Extract context window snapshot if present
    context = next((s for s in snaps if s.get("window_name") == "Context Window"), None)
    if context:
        item["context_window"] = {
            "used_percentage": (100.0 - float(context["remaining_percent"])) if context.get("remaining_percent") is not None else None,
            "context_window_size": context.get("limit_units"),
        }

    # Best remaining percentage for non-context quota
    usable = [
        float(s["remaining_percent"])
        for s in snaps
        if s.get("remaining_percent") is not None and s.get("window_name") != "Context Window"
    ]
    item["best_remaining"] = min(usable) if usable else None

    # Attach provider truth metadata
    truth = get_provider_truth(item)
    item["provider_truth"] = {
        "authority_type": truth.authority_type,
        "label": truth.label,
        "priority": truth.priority,
        "live": truth.live,
        "truth": truth.truth,
        "note": truth.note,
    }

    return item


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(STATIC_DIR / "favicon.ico", media_type="image/x-icon")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "app": "AI Quota", "time": now_iso()}


@app.get("/api/accounts")
def get_accounts() -> list[dict[str, Any]]:
    return [normalize_account(a) for a in list_accounts()]


@app.post("/api/accounts", status_code=201)
def add_account(item: AccountIn) -> dict[str, Any]:
    email = item.email.strip().lower()
    provider = item.provider.strip()
    client = item.client.strip()

    if not email or not provider or not client:
        raise HTTPException(422, "Email/identity, provider, and client are required")

    try:
        acc = create_account(
            email=email,
            provider=provider,
            client=client,
            display_name=item.display_name.strip() or email,
        )
    except KeyError as exc:
        raise HTTPException(409, str(exc))
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    return normalize_account(acc)


@app.delete("/api/accounts/{account_id}", status_code=204, response_class=Response)
def remove_account(account_id: int) -> Response:
    deleted = delete_account(account_id)
    if not deleted:
        raise HTTPException(404, "Account not found")
    return Response(status_code=204)


@app.post("/api/accounts/{account_id}/connect")
def connect_account(account_id: int) -> dict[str, Any]:
    account = get_account_by_id(account_id)
    if not account:
        raise HTTPException(404, "Account not found")

    adapter = find_adapter(account["provider"], account["client"])
    if not adapter:
        return {
            "ok": False,
            "mode": "not_implemented",
            "message": f"No direct live collector is implemented yet for {account['provider']} / {account['client']}. The account can still store last-known snapshots.",
        }

    return adapter.connect_account(account)


@app.post("/api/sync")
def trigger_sync() -> dict[str, Any]:
    return sync_all()


@app.get("/api/accounts/{account_id}/snapshots")
def get_account_snapshots(account_id: int) -> list[dict[str, Any]]:
    account = get_account_by_id(account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    return get_latest_snapshots(account_id)


@app.get("/api/dashboard")
def get_dashboard(sync: bool = Query(default=False)) -> dict[str, Any]:
    sync_result = sync_all() if sync else {"ok": True, "changed": 0, "matched": 0, "discovered": 0}
    accounts = [normalize_account(a) for a in list_accounts()]

    rank_weight = {"live": 4, "stale": 3, "not_connected": 2, "exhausted": 1}

    # Only rank accounts that actually have reported quota values
    valid_candidates = [a for a in accounts if a.get("best_remaining") is not None]
    ranked = sorted(
        valid_candidates,
        key=lambda c: (rank_weight.get(c.get("status"), 0), float(c.get("best_remaining") or 0)),
        reverse=True,
    )

    best_id = (
        ranked[0]["id"]
        if (ranked and float(ranked[0].get("best_remaining") or 0) > 0 and ranked[0].get("status") != "exhausted")
        else None
    )

    summary = {
        "accounts": len(accounts),
        "live": sum(1 for c in accounts if c.get("status") == "live"),
        "stale": sum(1 for c in accounts if c.get("status") == "stale"),
        "not_connected": sum(1 for c in accounts if c.get("status") == "not_connected"),
        "exhausted": sum(1 for c in accounts if c.get("status") == "exhausted"),
        "best_account_id": best_id,
    }

    return {
        "summary": summary,
        "accounts": accounts,
        "ranking": ranked[:10],
        "sync": sync_result,
        "generated_at": now_iso(),
    }


@app.get("/api/snapshots")
def get_all_snapshots(account_id: int | None = None, sync: bool = False) -> list[dict[str, Any]]:
    if sync:
        sync_all()
    return list_snapshots(account_id=account_id)


@app.post("/api/snapshots", status_code=201)
def add_snapshot(item: SnapshotIn) -> dict[str, Any]:
    account = get_account_by_id(item.account_id)
    if not account:
        raise HTTPException(404, "Account not found")

    snap_id = record_snapshot(
        account_id=item.account_id,
        service=item.service,
        client=item.client,
        model=item.model,
        window_name=item.window_name,
        remaining_percent=item.remaining_percent,
        used_units=item.used_units,
        limit_units=item.limit_units,
        unit=item.unit,
        reset_at=item.reset_at,
        source=item.source,
    )
    snaps = get_latest_snapshots(item.account_id)
    created = next((s for s in snaps if s["id"] == snap_id), None)
    return created or {"id": snap_id, "account_id": item.account_id}


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    run()
