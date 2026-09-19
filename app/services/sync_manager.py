from __future__ import annotations

from typing import Any
from ..utils.logging import get_logger

logger = get_logger("ai_quota.sync")


def sync_all() -> dict[str, Any]:
    """
    Execute isolated, fault-tolerant synchronization across all provider adapters.
    A failure in any one adapter will never block or crash the others.
    """
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
    return summary
