"""
providers/antigravity-cli/adapter.py

Antigravity CLI provider adapter — v2 monorepo wrapper around the existing
app/providers/antigravity_cli.py implementation. Adds capabilities() and
create_adapter() factory so the provider registry can auto-discover it.
"""
from __future__ import annotations

from typing import Any

# Re-use the proven existing implementation
from app.providers.antigravity_cli import AntigravityCLIAdapter as _Base

try:
    from packages.core.provider_adapter import ProviderAdapter  # type: ignore
    from packages.core.models import ProviderCapabilities  # type: ignore
except ImportError:
    from app.providers.base import ProviderAdapter  # type: ignore
    ProviderCapabilities = None  # type: ignore


class AntigravityCLIProviderAdapter(_Base):
    """
    Monorepo v2 wrapper.  Inherits all sync/connect_account logic from the
    existing AntigravityCLIAdapter and adds the new capabilities() contract.
    """

    def capabilities(self) -> Any:
        caps = dict(
            supports_quota=True,
            supports_usage=False,
            supports_account_detection=True,
            supports_account_switching=False,
            supports_instant_switch=False,
            supports_credential_vault=False,
            supports_history=True,
            supports_realtime=True,
            switch_method="unsupported",
        )
        if ProviderCapabilities is not None:
            return ProviderCapabilities(**caps)
        return caps

    def detect(self) -> dict[str, Any]:
        from pathlib import Path
        settings = Path.home() / ".gemini" / "antigravity-cli" / "settings.json"
        detected = settings.exists()
        return {
            "detected": detected,
            "hub_url": None,
            "note": "Antigravity CLI settings.json found" if detected else "Not installed",
        }

    def health_check(self) -> dict[str, Any]:
        from app.providers.antigravity_cli import STATUS_DIR
        files = list(STATUS_DIR.glob("*.json"))
        return {
            "status": "ok" if files else "no_data",
            "status_files": len(files),
            "note": f"{len(files)} status file(s) found in {STATUS_DIR}",
        }


def create_adapter() -> AntigravityCLIProviderAdapter:
    return AntigravityCLIProviderAdapter()
