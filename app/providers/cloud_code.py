from __future__ import annotations

from typing import Any
from .base import ProviderAdapter, ProviderTruth
from ..services.account_service import list_accounts, update_account_telemetry
from ..services.snapshot_service import get_latest_snapshots
from ..utils.time import now_iso, payload_age


class CloudCodeAdapter(ProviderAdapter):
    """
    Adapter for Google Cloud Code / Cloud Shell.
    Official 50-hour weekly usage quota is currently displayed in the Cloud Shell
    session information UI. This adapter enforces strict separation from Gemini
    and Google Cloud project quotas.
    """

    @property
    def id(self) -> str:
        return "cloud_code"

    @property
    def display_name(self) -> str:
        return "Cloud Code / Cloud Shell"

    @property
    def supported_clients(self) -> list[str]:
        return ["Cloud Code", "Cloud Shell", "Cloud Code / Cloud Shell"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="cloud_code",
            label="Cloud Code / Cloud Shell",
            priority=100,
            live=False,
            truth="official UI-derived",
            authority_type="official_ui_derived",
            note="Cloud Code weekly usage (50h default allowance) is separate from Gemini and Google Cloud project quotas.",
            source_description="Cloud Shell Session Info -> Usage Quota UI",
        )

    def sync(self) -> dict[str, Any]:
        """
        Cloud Code has no public unauthenticated API for weekly hours.
        Sync inspects registered Cloud Code accounts, preserves existing snapshots,
        and marks accounts honestly without inventing fake numbers.
        """
        accounts = [
            a for a in list_accounts()
            if self.can_handle(a.get("provider", ""), a.get("client", ""))
        ]
        changed = 0
        matched = len(accounts)

        for account in accounts:
            snaps = get_latest_snapshots(account["id"])
            if not snaps:
                # No snapshots yet -> keep as not_connected
                if account.get("status") != "not_connected":
                    update_account_telemetry(account["id"], status="not_connected")
                    changed += 1
            else:
                # Check age of most recent snapshot
                latest_snap = max(snaps, key=lambda s: s.get("captured_at", ""))
                age = payload_age(latest_snap)
                new_status = "stale" if (age is None or age > 3600 * 24) else "live"
                if account.get("status") != new_status:
                    update_account_telemetry(account["id"], status=new_status)
                    changed += 1

        return {
            "ok": True,
            "changed": changed,
            "matched": matched,
            "discovered": 0,
            "message": "Cloud Code quota requires official UI-derived entry or supported local session.",
        }

    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        return {
            "ok": False,
            "mode": "official_ui_derived",
            "message": (
                "Cloud Code / Cloud Shell usage quota (50h weekly allowance) is viewable "
                "in Cloud Shell: Session Information -> Usage Quota. "
                "AI Quota does not substitute Gemini or Google Cloud project quotas for this value."
            ),
        }
