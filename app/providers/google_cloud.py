from __future__ import annotations

from typing import Any
from .base import ProviderAdapter, ProviderTruth
from ..services.account_service import list_accounts, update_account_telemetry
from ..services.snapshot_service import get_latest_snapshots
from ..utils.time import payload_age


class GoogleCloudAdapter(ProviderAdapter):
    """
    Adapter for Google Cloud project/service quotas.
    Managed through Cloud Quotas and gcloud CLI surfaces. These are distinct
    from Cloud Code's 50h weekly usage quota.
    """

    @property
    def id(self) -> str:
        return "google_cloud"

    @property
    def display_name(self) -> str:
        return "Google Cloud project quotas"

    @property
    def supported_clients(self) -> list[str]:
        return ["Google Cloud quotas", "Google Cloud", "GCP Quotas"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="google_cloud",
            label="Google Cloud quotas",
            priority=65,
            live=False,
            truth="API / CLI-derived",
            authority_type="official_api_derived",
            note="Google Cloud project/service quotas belong to GCP projects and are distinct from Cloud Code weekly hours.",
            source_description="Cloud Quotas API / gcloud quotas info",
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
            "message": "Google Cloud quotas are service-specific and distinct from Cloud Code weekly allowance.",
        }
