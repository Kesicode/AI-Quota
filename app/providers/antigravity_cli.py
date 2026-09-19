from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from .base import ProviderAdapter, ProviderTruth
from ..database import DATA_DIR
from ..services.account_service import (
    ensure_auto_discovered_account,
    list_accounts,
    update_account_telemetry,
)
from ..services.snapshot_service import record_snapshot
from ..utils.time import now_iso, payload_age

STATUS_DIR = DATA_DIR / "antigravity-status"
STATUS_DIR.mkdir(parents=True, exist_ok=True)


def settings_path() -> Path:
    return Path.home() / ".gemini" / "antigravity-cli" / "settings.json"


def bridge_path() -> Path:
    return DATA_DIR / "antigravity_statusline_bridge.py"


def bridge_script() -> str:
    folder = str(STATUS_DIR).replace("\\", "\\\\")
    return (
        f'import hashlib, json, os, sys, tempfile\n'
        f'from datetime import datetime, timezone\n'
        f'from pathlib import Path\n'
        f'STATUS_DIR = Path(r"{folder}")\n'
        f'STATUS_DIR.mkdir(parents=True, exist_ok=True)\n'
        f'try:\n'
        f'    payload = json.load(sys.stdin)\n'
        f'except Exception:\n'
        f'    print("AI Quota: waiting"); raise SystemExit(0)\n'
        f'email = str(payload.get("email") or "").strip().lower()\n'
        f'if not email:\n'
        f'    print("AI Quota: account unavailable"); raise SystemExit(0)\n'
        f'keep = {{\n'
        f'    "captured_at": datetime.now(timezone.utc).isoformat(),\n'
        f'    "email": email,\n'
        f'    "product": payload.get("product"),\n'
        f'    "version": payload.get("version"),\n'
        f'    "plan_tier": payload.get("plan_tier"),\n'
        f'    "model": payload.get("model"),\n'
        f'    "context_window": payload.get("context_window", {{}}),\n'
        f'    "quota": payload.get("quota", {{}})\n'
        f'}}\n'
        f'key = hashlib.sha256(email.encode()).hexdigest()[:24]\n'
        f'out = STATUS_DIR / f"{{key}}.json"\n'
        f'fd, tmp = tempfile.mkstemp(dir=STATUS_DIR, prefix=".aiquota-", suffix=".tmp"); os.close(fd)\n'
        f'Path(tmp).write_text(json.dumps(keep, separators=(",", ":")), encoding="utf-8")\n'
        f'os.replace(tmp, out)\n'
        f'print(f"AI Quota: {{email}}")\n'
    )


def install_antigravity_bridge() -> dict[str, Any]:
    settings = settings_path()
    settings.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {}
    previous = None
    if settings.exists():
        try:
            data = json.loads(settings.read_text(encoding="utf-8"))
            previous = data.get("statusLine")
        except Exception as exc:
            return {"ok": False, "error": f"Could not read Antigravity settings.json: {exc}"}
    bridge = bridge_path()
    bridge.write_text(bridge_script(), encoding="utf-8")
    backup = DATA_DIR / "antigravity_previous_statusline.json"
    if previous is not None and not backup.exists():
        backup.write_text(json.dumps(previous, indent=2), encoding="utf-8")
    data["statusLine"] = {"type": "command", "command": f'"{sys.executable}" "{bridge}"', "enabled": True}
    settings.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {
        "ok": True,
        "settings_path": str(settings),
        "bridge_path": str(bridge),
        "previous_saved": previous is not None,
    }


def normalize_bucket_name(bucket_id: str) -> str:
    s = bucket_id.replace("_", "-").lower()
    if any(x in s for x in ("5hour", "5-hour", "five", "hourly")):
        return "Five Hour Limit"
    if "daily" in s or "day" in s:
        return "Daily Limit"
    if "weekly" in s or "week" in s:
        return "Weekly Limit"
    if "monthly" in s or "month" in s:
        return "Monthly Limit"
    return bucket_id


def load_status_files() -> list[dict[str, Any]]:
    out = []
    for path in STATUS_DIR.glob("*.json"):
        try:
            out.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            pass
    return out


class AntigravityCLIAdapter(ProviderAdapter):
    """
    Adapter for Antigravity CLI.
    Uses status-line telemetry bridge to extract quota, context-window, and account identity.
    """

    @property
    def id(self) -> str:
        return "antigravity_cli"

    @property
    def display_name(self) -> str:
        return "Antigravity CLI"

    @property
    def supported_clients(self) -> list[str]:
        return ["Antigravity CLI", "Antigravity CLI Collector"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="antigravity_cli",
            label="Antigravity CLI",
            priority=80,
            live=True,
            truth="CLI-derived",
            authority_type="cli_local",
            note="Reads local status-line telemetry emitted by Antigravity CLI.",
            source_description="Status-line bridge JSON telemetry (~/.gemini/antigravity-cli)",
        )

    def sync(self) -> dict[str, Any]:
        changed = 0
        matched = 0
        discovered = 0

        for item in load_status_files():
            email = str(item.get("email") or "").strip().lower()
            if not email:
                continue

            account = ensure_auto_discovered_account(
                email=email,
                provider="Antigravity",
                client="Antigravity CLI",
                display_name=email,
                plan_tier=item.get("plan_tier"),
            )
            if not account:
                continue

            if account.get("source_kind") == "auto_discovered":
                discovered += 1

            age = payload_age(item)
            quota = item.get("quota") or {}
            percentages = [
                float(b["remaining_fraction"]) * 100
                for b in quota.values()
                if isinstance(b, dict) and b.get("remaining_fraction") is not None
            ]

            status = "stale" if (age is None or age > 3600) else (
                "exhausted" if (percentages and max(percentages) <= 0) else (
                    "live" if age <= 60 else "stale"
                )
            )
            captured = str(item.get("captured_at") or now_iso())

            update_account_telemetry(
                account["id"],
                status=status,
                plan_tier=item.get("plan_tier"),
                last_seen_at=captured,
                last_error=None,
            )
            matched += 1

            for bucket_id, bucket in quota.items():
                if not isinstance(bucket, dict):
                    continue
                pct = bucket.get("remaining_fraction")
                pct = None if pct is None else max(0.0, min(100.0, float(pct) * 100.0))
                window = normalize_bucket_name(str(bucket_id))
                reset = bucket.get("reset_time")
                record_snapshot(
                    account_id=account["id"],
                    service="Antigravity",
                    client="Antigravity CLI",
                    model=str(bucket_id),
                    window_name=window,
                    remaining_percent=pct,
                    unit="provider quota",
                    reset_at=reset,
                    source="antigravity-statusline",
                    captured_at=captured,
                )
                changed += 1

            ctx = item.get("context_window") or {}
            size = ctx.get("context_window_size")
            used = ctx.get("used_percentage")
            if size is not None and used is not None:
                record_snapshot(
                    account_id=account["id"],
                    service="Antigravity",
                    client="Antigravity CLI",
                    model="Context Window",
                    window_name="Context Window",
                    remaining_percent=max(0.0, min(100.0, 100.0 - float(used))),
                    used_units=float(size) * float(used) / 100.0,
                    limit_units=float(size),
                    unit="tokens",
                    source="antigravity-statusline",
                    captured_at=captured,
                )
                changed += 1

        return {"ok": True, "changed": changed, "matched": matched, "discovered": discovered}

    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        res = install_antigravity_bridge()
        if not res.get("ok"):
            return res
        return {
            "ok": True,
            "mode": "global_active_session_telemetry",
            "message": (
                "The Antigravity CLI collector is installed globally. "
                "Restart Antigravity CLI. AI Quota matches the active session email and keeps last-known quota."
            ),
            **res,
        }
