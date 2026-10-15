"""
Update app/routes/v1.py to use serialize_accounts from app.services.account_serializer
instead of maintaining duplicate normalization logic.
"""
import sys
from pathlib import Path

path = Path("app/routes/v1.py")
content = path.read_bytes().decode("utf-8")

OLD_FUNC = '''def _list_accounts() -> list[dict[str, Any]]:
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
        item["best_remaining"] = max(usable) if usable else None
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
    return result'''

NEW_FUNC = '''def _list_accounts() -> list[dict[str, Any]]:
    from app.services.account_service import list_accounts as _la
    from app.services.account_serializer import serialize_accounts
    return serialize_accounts(_la())'''

# Normalize line endings for replacement
content_norm = content.replace("\r\n", "\n")
old_norm = OLD_FUNC.replace("\r\n", "\n")
new_norm = NEW_FUNC.replace("\r\n", "\n")

if old_norm in content_norm:
    content_norm = content_norm.replace(old_norm, new_norm, 1)
    # Restore CRLF if needed
    final_content = content_norm.replace("\n", "\r\n")
    path.write_bytes(final_content.encode("utf-8"))
    print("OK: _list_accounts in v1.py updated to use serialize_accounts")
else:
    print("ERROR: OLD_FUNC not found in v1.py")
    sys.exit(1)
