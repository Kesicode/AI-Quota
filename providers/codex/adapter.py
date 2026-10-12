"""
providers/codex/adapter.py

OpenAI / Codex provider adapter — v2 monorepo wrapper.
Adds capabilities() and create_adapter() factory.
"""
from __future__ import annotations

from typing import Any

from app.providers.codex import CodexAdapter as _Base

try:
    from packages.core.models import ProviderCapabilities  # type: ignore
except ImportError:
    ProviderCapabilities = None  # type: ignore


class CodexProviderAdapter(_Base):
    """v2 monorepo wrapper around the existing CodexAdapter."""

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
        """Codex has no local process to detect — returns not_detected."""
        return {
            "detected": False,
            "hub_url": None,
            "note": "Codex has no detectable local process. Track via manual account registration.",
        }

    def health_check(self) -> dict[str, Any]:
        from app.services.account_service import list_accounts
        from app.services.snapshot_service import get_latest_snapshots
        accounts = [a for a in list_accounts() if self.can_handle(a.get("provider", ""), a.get("client", ""))]
        return {
            "status": "ok",
            "registered_accounts": len(accounts),
            "note": "Codex telemetry is manually entered or snapshot-based.",
        }


def create_adapter() -> CodexProviderAdapter:
    return CodexProviderAdapter()
