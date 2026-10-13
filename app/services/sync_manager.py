from __future__ import annotations

from typing import Any
from ..utils.logging import get_logger

logger = get_logger("ai_quota.sync")


def _fire_webhooks_background(changed: int) -> None:
    """
    Fire webhook quota alerts after a successful sync.
    Runs in a background thread — never blocks the sync response.
    Only fires when at least one quota value changed during the sync.
    """
    if changed <= 0:
        return
    try:
        from app.routes.v1 import fire_quota_alerts
        result = fire_quota_alerts()
        if result.get("fired", 0) > 0:
            logger.info(
                "Webhook alerts fired after sync: %d account(s) below threshold",
                result["fired"],
            )
        errors = result.get("errors", [])
        if errors:
            logger.warning("Webhook fire errors: %s", errors)
    except Exception as exc:
        # Never let webhook failure crash or delay the sync cycle
        logger.error("Webhook auto-fire failed (non-fatal): %s", exc)


def sync_all() -> dict[str, Any]:
    """
    Execute isolated, fault-tolerant synchronization across all provider adapters.
    A failure in any one adapter will never block or crash the others.

    After sync completes, fires webhook low-quota alerts in a background thread
    when at least one account's quota value changed. Webhook failure is always
    non-fatal and never delays the sync response.
    """
    import threading
    from ..providers import get_all_adapters

    logger.info("Starting provider synchronization run...")
    results: dict[str, Any] = {}
    total_changed = 0
    total_matched = 0
    total_discovered = 0
    any_ok = False

    for adapter in get_all_adapters():
        try:
            logger.info("Syncing provider: %s (%s)", adapter.display_name, adapter.id)
            res = adapter.sync()
            results[adapter.id] = res
            if res.get("ok", False):
                any_ok = True
            total_changed += int(res.get("changed", 0))
            total_matched += int(res.get("matched", 0))
            total_discovered += int(res.get("discovered", 0))
        except Exception as exc:
            logger.error("Provider %s failed during sync: %s", adapter.id, exc)
            results[adapter.id] = {
                "ok": False,
                "changed": 0,
                "matched": 0,
                "discovered": 0,
                "error": str(exc),
            }

    summary = {
        "ok": any_ok or len(results) > 0,
        "providers": results,
        "changed": total_changed,
        "matched": total_matched,
        "discovered": total_discovered,
    }
    logger.info(
        "Sync completed: changed=%d, matched=%d, discovered=%d",
        total_changed,
        total_matched,
        total_discovered,
    )

    # Phase 21 — Auto-fire webhook alerts in background after sync
    t = threading.Thread(
        target=_fire_webhooks_background,
        args=(total_changed,),
        daemon=True,
        name="webhook-auto-fire",
    )
    t.start()

    return summary
