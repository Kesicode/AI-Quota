"""
Update app/routes/v1.py so the /webhooks/config and /webhooks/fire endpoints
delegate to app.services.webhook_service instead of having duplicate logic inline.
This keeps v1.py as the HTTP interface layer only.
"""
import sys
from pathlib import Path

path = Path("app/routes/v1.py")
content = path.read_bytes().decode("utf-8")

# ── 1. Replace get_webhook_config endpoint body to delegate to service ────
OLD_CFG = '''@router.get("/webhooks/config")
def get_webhook_config() -> dict[str, Any]:
    """Return current webhook configuration from settings table."""
    from app.database import db_session
    try:
        with db_session() as conn:
            rows = conn.execute(
                "SELECT key, value FROM settings WHERE key IN ('webhook_url','webhook_threshold','webhook_enabled')"
            ).fetchall()
        cfg = {r["key"]: r["value"] for r in rows}
        return {
            "webhook_url":       cfg.get("webhook_url"),
            "webhook_threshold": int(cfg["webhook_threshold"]) if "webhook_threshold" in cfg else 20,
            "webhook_enabled":   cfg.get("webhook_enabled", "false").lower() == "true",
        }
    except Exception as exc:
        raise HTTPException(500, str(exc))'''

NEW_CFG = '''@router.get("/webhooks/config")
def get_webhook_config() -> dict[str, Any]:
    """Return current webhook configuration from settings table."""
    from app.services.webhook_service import get_webhook_config as _get_cfg
    try:
        return _get_cfg()
    except Exception as exc:
        raise HTTPException(500, str(exc))'''

# ── 2. Replace fire_quota_alerts endpoint body to delegate to service ─────
OLD_FIRE = '''@router.post("/webhooks/fire")
def fire_quota_alerts() -> dict[str, Any]:
    """
    Scan all accounts and fire webhook alerts for any below the threshold.
    Called automatically by the sync engine and can be triggered manually.
    """
    import urllib.request, urllib.error, json as _json
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

        payload = _json.dumps({
            "event":        "quota_low",
            "source":       "ai-quota",
            "timestamp":    now_iso(),
            "account_id":   acc.get("account_id") or str(acc["id"]),
            "display_name": acc.get("display_name") or acc.get("email"),
            "provider":     acc.get("provider"),
            "remaining_pct": pct,
            "threshold_pct": threshold,
            "message": (
                f"AI-Quota alert: {acc.get('display_name') or acc.get('email')} "
                f"quota at {pct:.0f}% (threshold: {threshold}%)"
            ),
        }).encode()
        try:
            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "AI-Quota/2.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
            fired += 1
        except Exception as e:
            errors.append(f"{acc.get('email')}: {e}")

    return {"ok": True, "fired": fired, "errors": errors}'''

NEW_FIRE = '''@router.post("/webhooks/fire")
def fire_quota_alerts() -> dict[str, Any]:
    """
    Scan all accounts and fire webhook alerts for any below the threshold.
    Called automatically by the sync engine and can be triggered manually.
    Delegates to app.services.webhook_service to avoid circular imports.
    """
    from app.services.webhook_service import fire_quota_alerts as _fire
    return _fire()'''

changed = 0

if OLD_CFG in content:
    content = content.replace(OLD_CFG, NEW_CFG, 1)
    changed += 1
    print("OK: replaced get_webhook_config body in v1.py")
else:
    print("WARN: get_webhook_config body not found — may already be updated or whitespace differs")

if OLD_FIRE in content:
    content = content.replace(OLD_FIRE, NEW_FIRE, 1)
    changed += 1
    print("OK: replaced fire_quota_alerts body in v1.py")
else:
    print("WARN: fire_quota_alerts body not found — may already be updated or whitespace differs")

if changed > 0:
    path.write_bytes(content.encode("utf-8"))
    print(f"Written {changed} replacement(s) to v1.py")
else:
    print("No changes written.")
    sys.exit(1)
