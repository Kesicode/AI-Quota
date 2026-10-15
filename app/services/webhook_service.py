"""
AI-Quota 2.0 — Webhook Service

Standalone module for webhook alert logic, extracted from app/routes/v1.py
to break the circular import:
  app/services/sync_manager.py → app/routes/v1.py → app/services (circular)

sync_manager.py now imports fire_quota_alerts from HERE, not from v1.py.
The v1.py router endpoints delegate to this module too.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from ..utils.logging import get_logger

logger = get_logger("ai_quota.webhook_service")


def _get_db_session():
    from app.database import db_session  # local import to avoid boot-time cycle
    return db_session


def get_webhook_config() -> dict[str, Any]:
    """
    Return current webhook configuration from the settings table.
    Returns a dict with webhook_url, webhook_threshold, webhook_enabled.
    Never raises — returns safe defaults on any DB error.
    """
    try:
        db_session = _get_db_session()
        with db_session() as conn:
            rows = conn.execute(
                "SELECT key, value FROM settings WHERE key IN "
                "('webhook_url','webhook_threshold','webhook_enabled')"
            ).fetchall()
        cfg = {r["key"]: r["value"] for r in rows}
        return {
            "webhook_url":       cfg.get("webhook_url"),
            "webhook_threshold": int(cfg["webhook_threshold"]) if "webhook_threshold" in cfg else 20,
            "webhook_enabled":   cfg.get("webhook_enabled", "false").lower() == "true",
        }
    except Exception as exc:
        logger.warning("Could not read webhook config: %s", exc)
        return {"webhook_url": None, "webhook_threshold": 20, "webhook_enabled": False}


def fire_quota_alerts() -> dict[str, Any]:
    """
    Scan all accounts and POST a webhook alert for each one below the threshold.

    Called automatically by sync_manager after a sync run, and available as a
    direct API endpoint via v1.py (POST /api/v1/webhooks/fire).

    Never raises — returns a result dict even on total failure.
    """
    from app.services.account_service import list_accounts
    from app.utils.time import now_iso

    cfg = get_webhook_config()
    if not cfg.get("webhook_enabled") or not cfg.get("webhook_url"):
        return {"ok": True, "fired": 0, "skipped": "webhook_disabled_or_unconfigured"}

    threshold = cfg.get("webhook_threshold", 20)
    url = cfg["webhook_url"]
    accounts = list_accounts()
    fired = 0
    errors: list[str] = []

    for acc in accounts:
        pct = acc.get("best_remaining")
        if pct is None or pct > threshold:
            continue

        payload = json.dumps({
            "event":         "quota_low",
            "source":        "ai-quota",
            "timestamp":     now_iso(),
            "account_id":    acc.get("account_id") or str(acc["id"]),
            "display_name":  acc.get("display_name") or acc.get("email"),
            "provider":      acc.get("provider"),
            "remaining_pct": pct,
            "threshold_pct": threshold,
            "message": (
                f"AI-Quota alert: {acc.get('display_name') or acc.get('email')} "
                f"quota at {pct:.0f}% (threshold: {threshold}%)"
            ),
        }).encode()

        try:
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent":   "AI-Quota/2.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
            fired += 1
            logger.debug("Webhook fired for %s (%.0f%%)", acc.get("email"), pct)
        except Exception as exc:
            err = f"{acc.get('email')}: {exc}"
            errors.append(err)
            logger.warning("Webhook failed for %s: %s", acc.get("email"), exc)

    return {"ok": True, "fired": fired, "errors": errors}
