from __future__ import annotations

from typing import Any
from .base import ProviderAdapter, ProviderTruth
from ..services.account_service import list_accounts, update_account_telemetry
from ..services.snapshot_service import get_latest_snapshots
from ..utils.time import payload_age


class GeminiAdapter(ProviderAdapter):
    """
    Adapter for Google Gemini / Gemini API.
    Tracks project/model rate limits (RPM, TPM, RPD). Strictly separated
    from Cloud Code weekly hours.
    """

    @property
    def id(self) -> str:
        return "gemini"

    @property
    def display_name(self) -> str:
        return "Gemini API"

    @property
    def supported_clients(self) -> list[str]:
        return ["Gemini API", "Gemini", "Google Gemini"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="gemini",
            label="Gemini API",
            priority=60,
            live=False,
            truth="project/API-derived",
            authority_type="official_api_derived",
            note="Gemini API rate limits (RPM, TPM, RPD) are project/model dependent and never substitute for Cloud Code.",
            source_description="Gemini API project limits",
        )

    def sync(self) -> dict[str, Any]:
        accounts = [
            a for a in list_accounts()
            if self.can_handle(a.get("provider", ""), a.get("client", ""))
        ]
        changed = 0
        for account in accounts:
            snaps = get_latest_snapshots(account["id"])
            if not snaps:
                if account.get("status") != "not_connected":
                    update_account_telemetry(account["id"], status="not_connected")
                    changed += 1
            else:
                latest = max(snaps, key=lambda s: s.get("captured_at", ""))
                age = payload_age(latest)
                new_status = "stale" if (age is None or age > 3600 * 24) else "live"
                if account.get("status") != new_status:
                    update_account_telemetry(account["id"], status=new_status)
                    changed += 1

        return {"ok": True, "changed": changed, "matched": len(accounts), "discovered": 0}

    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        return {
            "ok": False,
            "mode": "planned",
            "message": "Gemini API telemetry is project/model dependent and separate from Cloud Code.",
        }
