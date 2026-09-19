from __future__ import annotations

from typing import Any
from .base import ProviderAdapter, ProviderTruth
from ..services.account_service import list_accounts, update_account_telemetry
from ..services.snapshot_service import get_latest_snapshots
from ..utils.time import payload_age


class GitHubCopilotAdapter(ProviderAdapter):
    """
    Adapter for GitHub Copilot.
    Tracks Copilot plan usage / AI credits separately from GitHub REST API limits.
    """

    @property
    def id(self) -> str:
        return "copilot"

    @property
    def display_name(self) -> str:
        return "GitHub Copilot"

    @property
    def supported_clients(self) -> list[str]:
        return ["GitHub Copilot", "Copilot"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="copilot",
            label="GitHub Copilot",
            priority=50,
            live=False,
            truth="provider surface",
            authority_type="provider_surface",
            note="Usage and AI credits depend on current GitHub Copilot subscription.",
            source_description="GitHub Copilot subscription usage",
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
            "message": "GitHub Copilot live telemetry collection is planned for supported surfaces.",
        }
