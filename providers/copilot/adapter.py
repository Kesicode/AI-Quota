"""
providers/copilot/adapter.py

GitHub Copilot provider adapter — v2 monorepo wrapper.
"""
from __future__ import annotations

from typing import Any

from app.providers.copilot import CopilotAdapter as _Base

try:
    from packages.core.models import ProviderCapabilities  # type: ignore
except ImportError:
    ProviderCapabilities = None  # type: ignore


class CopilotProviderAdapter(_Base):
    """v2 monorepo wrapper around the existing CopilotAdapter."""

    def capabilities(self) -> Any:
        caps = dict(
            supports_quota=True,
            supports_usage=False,
            supports_account_detection=False,
            supports_account_switching=False,
            supports_instant_switch=False,
            supports_credential_vault=False,
            supports_history=True,
            supports_realtime=False,
            switch_method="unsupported",
        )
        if ProviderCapabilities is not None:
            return ProviderCapabilities(**caps)
        return caps

    def detect(self) -> dict[str, Any]:
        """
        Copilot can sometimes be detected via VS Code extension storage,
        but this requires optional OS integration. Report as partial.
        """
        return {
            "detected": False,
            "hub_url": None,
            "note": "GitHub Copilot detection requires VS Code extension. Register accounts manually.",
        }

    def health_check(self) -> dict[str, Any]:
        from app.services.account_service import list_accounts
        accounts = [a for a in list_accounts() if self.can_handle(a.get("provider", ""), a.get("client", ""))]
        return {
            "status": "ok",
            "registered_accounts": len(accounts),
            "note": "Copilot usage data is manually tracked.",
        }


def create_adapter() -> CopilotProviderAdapter:
    return CopilotProviderAdapter()
