from __future__ import annotations

from typing import Any
from .base import ProviderAdapter, ProviderTruth
from ..services.account_service import list_accounts, update_account_telemetry
from ..services.snapshot_service import get_latest_snapshots
from ..utils.time import payload_age


class CodexAdapter(ProviderAdapter):
    """
    Adapter for OpenAI / Codex.
    Tracks Codex usage allowances (e.g. 5-hour, weekly windows) under ChatGPT plans,
    strictly separate from OpenAI API rate limits and developer platform token buckets.
    """

    @property
    def id(self) -> str:
        return "codex"

    @property
    def display_name(self) -> str:
        return "OpenAI / Codex"

    @property
    def supported_clients(self) -> list[str]:
        return ["Codex", "OpenAI / Codex", "ChatGPT Codex"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="codex",
            label="OpenAI / Codex",
            priority=75,
            live=False,
            truth="supported provider surface",
            authority_type="provider_surface",
            note="Codex usage windows and credits are separate from OpenAI API rate limits.",
            source_description="OpenAI / Codex official client usage surfaces",
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

        return {
            "ok": True,
            "changed": changed,
            "matched": len(accounts),
            "discovered": 0,
            "message": "Codex usage collection requires supported OpenAI/Codex local surfaces.",
        }

    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        return {
            "ok": False,
            "mode": "planned",
            "message": (
                "OpenAI / Codex live collection is planned for supported OpenAI surfaces. "
                "OpenAI API keys or browser cookies are never stored in AI Quota."
            ),
        }
