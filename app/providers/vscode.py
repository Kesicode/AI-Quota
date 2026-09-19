from __future__ import annotations

from typing import Any
from .base import ProviderAdapter, ProviderTruth


class VSCodeAdapter(ProviderAdapter):
    """
    Adapter representing VS Code as a host client surface.
    VS Code does not own quotas; actual authority belongs to installed extensions.
    """

    @property
    def id(self) -> str:
        return "vscode"

    @property
    def display_name(self) -> str:
        return "VS Code"

    @property
    def supported_clients(self) -> list[str]:
        return ["VS Code", "Visual Studio Code"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="vscode",
            label="VS Code",
            priority=30,
            live=False,
            truth="host client only",
            authority_type="host_client",
            note="VS Code is an IDE host. Quota authority belongs to the installed provider extension.",
            source_description="Host IDE environment",
        )

    def sync(self) -> dict[str, Any]:
        return {"ok": True, "changed": 0, "matched": 0, "discovered": 0}

    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        return {
            "ok": False,
            "mode": "host_only",
            "message": "VS Code is an editor host; quota belongs to the underlying AI provider extension.",
        }
