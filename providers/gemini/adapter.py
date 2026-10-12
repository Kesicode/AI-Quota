"""
providers/gemini/adapter.py

Google Gemini API provider adapter — v2 monorepo wrapper.
IMPORTANT: Gemini API quotas (RPM, TPM, RPD) are STRICTLY SEPARATE from:
  - Cloud Code weekly hours
  - Google Cloud project quotas
  - Antigravity quota
Never combine these in any metric or display.
"""
from __future__ import annotations

from typing import Any

from app.providers.gemini import GeminiAdapter as _Base

try:
    from packages.core.models import ProviderCapabilities  # type: ignore
except ImportError:
    ProviderCapabilities = None  # type: ignore


class GeminiProviderAdapter(_Base):
    """v2 monorepo wrapper around the existing GeminiAdapter."""

    def capabilities(self) -> Any:
        caps = dict(
            supports_quota=True,
            supports_usage=True,
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
        Gemini API is accessed via project keys — no local process to detect.
        """
        return {
            "detected": False,
            "hub_url": None,
            "note": (
                "Gemini API quotas are project/model specific. "
                "Register project identities manually. "
                "IMPORTANT: Gemini API RPM is NOT the same as Cloud Code weekly hours."
            ),
        }

    def health_check(self) -> dict[str, Any]:
        from app.services.account_service import list_accounts
        accounts = [a for a in list_accounts() if self.can_handle(a.get("provider", ""), a.get("client", ""))]
        return {
            "status": "ok",
            "registered_accounts": len(accounts),
            "note": "Gemini API rate limits (RPM/TPM/RPD) — separate from Cloud Code and Google Cloud project quota.",
        }


def create_adapter() -> GeminiProviderAdapter:
    return GeminiProviderAdapter()
