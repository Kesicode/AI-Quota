"""
providers/cloud-code/adapter.py

Cloud Code / Cloud Shell provider adapter — v2 monorepo wrapper.
IMPORTANT: Cloud Code weekly hours (50h) are STRICTLY SEPARATE from:
  - Gemini API RPM/TPM/RPD
  - Google Cloud project quotas
  - Antigravity quota
"""
from __future__ import annotations

from typing import Any

from app.providers.cloud_code import CloudCodeAdapter as _Base

try:
    from packages.core.models import ProviderCapabilities  # type: ignore
except ImportError:
    ProviderCapabilities = None  # type: ignore


class CloudCodeProviderAdapter(_Base):
    """v2 monorepo wrapper around the existing CloudCodeAdapter."""

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
        """Cloud Code has no local process — check for gcloud and cloudshell env."""
        import os, shutil
        in_cloudshell = bool(os.environ.get("CLOUD_SHELL"))
        gcloud_found = shutil.which("gcloud") is not None
        return {
            "detected": in_cloudshell or gcloud_found,
            "hub_url": None,
            "note": (
                "Running in Cloud Shell — Cloud Code quota viewable in Session Information." if in_cloudshell
                else ("gcloud CLI detected — Cloud Code accounts can be registered manually." if gcloud_found
                      else "Register Cloud Code accounts manually with your Google account email.")
            ),
        }

    def health_check(self) -> dict[str, Any]:
        from app.services.account_service import list_accounts
        accounts = [a for a in list_accounts() if self.can_handle(a.get("provider", ""), a.get("client", ""))]
        return {
            "status": "ok",
            "registered_accounts": len(accounts),
            "note": "Cloud Code 50h weekly allowance — separate from Gemini API and Google Cloud project quota.",
        }


def create_adapter() -> CloudCodeProviderAdapter:
    return CloudCodeProviderAdapter()
