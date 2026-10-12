"""
providers/google-cloud/adapter.py

Google Cloud project quota adapter — v2 monorepo wrapper.
IMPORTANT: Google Cloud project quotas are STRICTLY SEPARATE from:
  - Gemini API rate limits
  - Cloud Code weekly hours
  - Antigravity quota
"""
from __future__ import annotations

from typing import Any

from app.providers.google_cloud import GoogleCloudAdapter as _Base

try:
    from packages.core.models import ProviderCapabilities  # type: ignore
except ImportError:
    ProviderCapabilities = None  # type: ignore


class GoogleCloudProviderAdapter(_Base):
    """v2 monorepo wrapper around the existing GoogleCloudAdapter."""

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
        """Google Cloud projects are identified via project IDs — no local process."""
        # Check if gcloud is installed as a weak signal
        import shutil
        gcloud_found = shutil.which("gcloud") is not None
        return {
            "detected": gcloud_found,
            "hub_url": None,
            "note": (
                "gcloud CLI found — register project IDs manually. "
                "Google Cloud project quotas are SEPARATE from Gemini API and Cloud Code."
            ) if gcloud_found else "Register Google Cloud project IDs manually.",
        }

    def health_check(self) -> dict[str, Any]:
        from app.services.account_service import list_accounts
        accounts = [a for a in list_accounts() if self.can_handle(a.get("provider", ""), a.get("client", ""))]
        return {
            "status": "ok",
            "registered_accounts": len(accounts),
            "note": "Google Cloud project quota tracking — separate from Gemini API.",
        }


def create_adapter() -> GoogleCloudProviderAdapter:
    return GoogleCloudProviderAdapter()
