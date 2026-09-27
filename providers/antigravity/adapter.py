"""
AI-Quota 2.0 — Antigravity 2.0 Provider Adapter.

Full ProviderAdapter implementation for the Antigravity IDE platform.
Handles:
  - Hub detection (dynamic port discovery)
  - Account detection (who is currently logged in)
  - Quota reading (5-hour + weekly buckets)
  - Account switching (instant Windows + assisted fallback)
  - Provider health check
"""
from __future__ import annotations

import logging
from typing import Any

from packages.core.provider_adapter import ProviderAdapter
from packages.core.models import (
    AccountIdentity,
    ProviderCapabilities,
    ProviderDetection,
    ProviderHealth,
    ProviderTruth,
    QuotaWindowResult,
    SwitchMethod,
    SwitchResult,
    SwitchStatus,
)
from packages.core.utils_time import now_iso, payload_age, staleness_tier as compute_staleness

logger = logging.getLogger("ai_quota.providers.antigravity")


class AntigravityAdapter(ProviderAdapter):
    """
    Provider adapter for Google Antigravity (Antigravity IDE / VS Code extension).

    Data source: Antigravity Hub HTTP API (dynamically discovered port)
    Authority: LIVE telemetry from the hub (highest authority)
    Switching: Instant (Windows) + Assisted fallback
    """

    def __init__(self) -> None:
        self._hub_client: Any | None = None
        self._switcher: Any | None = None

    # ─── Identity ──────────────────────────────────────────────────────────

    @property
    def id(self) -> str:
        return "antigravity"

    @property
    def display_name(self) -> str:
        return "Antigravity"

    @property
    def supported_clients(self) -> list[str]:
        return [
            "antigravity",
            "antigravity ide",
            "agy",
            "agy ide",
            "antigravity 2",
            "antigravity 2.0",
        ]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="antigravity",
            label="Antigravity",
            priority=10,
            live=True,
            truth="hub_api",
            note="Live telemetry from Antigravity Hub HTTP API",
            authority_type="live_hub",
            source_description="Direct poll of the running Antigravity Language Server hub",
        )

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supports_quota=True,
            supports_usage=True,
            supports_account_detection=True,
            supports_account_switching=True,
            supports_instant_switch=True,   # Windows only — runtime check in switcher
            supports_credential_vault=True,
            supports_history=True,
            supports_realtime=True,
            switch_method=SwitchMethod.INSTANT,
            switch_requires_restart=False,
            switch_cooldown_seconds=30,
            switch_max_per_hour=10,
        )

    # ─── Hub client (lazy init) ────────────────────────────────────────────

    def _get_hub_client(self) -> Any | None:
        from providers.antigravity.hub_detector import detect_hub
        from providers.antigravity.hub_client import HubClient

        hub = detect_hub()
        if hub is None:
            return None
        if self._hub_client is None or self._hub_client.base_url != hub.url:
            self._hub_client = HubClient(hub.url)
        return self._hub_client

    def _get_switcher(self) -> Any | None:
        client = self._get_hub_client()
        if client is None:
            return None
        if self._switcher is None:
            from providers.antigravity.switcher import AntigravitySwitcher
            from packages.security.credential_manager import get_credential_manager
            self._switcher = AntigravitySwitcher(client, get_credential_manager())
        return self._switcher

    # ─── Detection ────────────────────────────────────────────────────────

    def detect(self) -> ProviderDetection:
        from providers.antigravity.hub_detector import detect_hub
        hub = detect_hub()
        if hub is None:
            return ProviderDetection(detected=False, detail="Antigravity hub not found")
        return ProviderDetection(
            detected=True,
            port=hub.port,
            hub_url=hub.url,
            version=hub.version,
            detail=f"Hub found at {hub.url}",
        )

    # ─── Active account ────────────────────────────────────────────────────

    def get_current_account(self) -> AccountIdentity | None:
        client = self._get_hub_client()
        if client is None:
            return None
        try:
            data = client.get_current_account()
            email = data.get("email") or data.get("login") or data.get("user") or ""
            if not email:
                return None
            # Build deterministic account_id from email if we don't have one
            account_id = data.get("accountId") or data.get("account_id") or f"acc_{hash(email) & 0xFFFFFFFF:012d}"
            return AccountIdentity(
                account_id=account_id,
                email=email,
                provider="Antigravity",
                client="Antigravity",
                display_name=data.get("displayName") or data.get("name") or email,
                detected_at=now_iso(),
            )
        except Exception as exc:
            logger.debug("get_current_account failed: %s", exc)
            return None

    # ─── Quota ────────────────────────────────────────────────────────────

    def get_quota(self, account_id: str) -> list[QuotaWindowResult]:
        client = self._get_hub_client()
        if client is None:
            return []
        try:
            data = client.get_quota()
            results: list[QuotaWindowResult] = []

            # Parse 5-hour quota bucket
            five_hour = data.get("fiveHour") or data.get("5h") or data.get("shortTerm") or {}
            if five_hour:
                remaining = five_hour.get("remainingPercent") or five_hour.get("remaining_percent")
                results.append(QuotaWindowResult(
                    window_name="5-Hour",
                    quota_bucket="5h",
                    remaining_percent=remaining,
                    used_units=five_hour.get("used"),
                    limit_units=five_hour.get("limit"),
                    unit=five_hour.get("unit", "requests"),
                    reset_at=five_hour.get("resetAt") or five_hour.get("reset_at"),
                    source="hub_api",
                    staleness_tier="LIVE",
                ))

            # Parse weekly quota bucket
            weekly = data.get("weekly") or data.get("week") or data.get("longTerm") or {}
            if weekly:
                remaining = weekly.get("remainingPercent") or weekly.get("remaining_percent")
                results.append(QuotaWindowResult(
                    window_name="Weekly",
                    quota_bucket="weekly",
                    remaining_percent=remaining,
                    used_units=weekly.get("used"),
                    limit_units=weekly.get("limit"),
                    unit=weekly.get("unit", "requests"),
                    reset_at=weekly.get("resetAt") or weekly.get("reset_at"),
                    source="hub_api",
                    staleness_tier="LIVE",
                ))

            return results
        except Exception as exc:
            logger.debug("get_quota failed for %s: %s", account_id, exc)
            return []

    # ─── Switch ───────────────────────────────────────────────────────────

    def switch_account(self, account_id: str, *, force: bool = False) -> SwitchResult:
        switcher = self._get_switcher()
        if switcher is None:
            return SwitchResult(
                requested_account_id=account_id,
                status=SwitchStatus.FAILED,
                method_used=SwitchMethod.UNSUPPORTED,
                reason="Antigravity hub not detected — cannot switch account.",
            )
        return switcher.switch(account_id)

    # ─── Health ───────────────────────────────────────────────────────────

    def health_check(self) -> ProviderHealth:
        import time
        client = self._get_hub_client()
        if client is None:
            return ProviderHealth(provider_id=self.id, status="offline", error="Hub not detected")
        t0 = time.monotonic()
        try:
            ok = client.ping()
            latency = (time.monotonic() - t0) * 1000
            return ProviderHealth(
                provider_id=self.id,
                status="ok" if ok else "offline",
                last_check_at=now_iso(),
                latency_ms=latency,
            )
        except Exception as exc:
            return ProviderHealth(provider_id=self.id, status="error", error=str(exc))

    # ─── Sync (batch collection — preserves existing sync_manager compat) ─

    def sync(self) -> dict[str, Any]:
        """
        Batch sync — discovers accounts from hub and records quota snapshots.
        """
        from app.services.account_service import ensure_auto_discovered_account
        from app.services.snapshot_service import record_snapshot

        client = self._get_hub_client()
        if client is None:
            return {"ok": False, "error": "Hub not detected", "changed": 0, "matched": 0, "discovered": 0}

        changed = 0
        discovered = 0

        try:
            # Get current account
            identity = self.get_current_account()
            if identity:
                acc = ensure_auto_discovered_account(
                    email=identity.email,
                    provider="Antigravity",
                    client="Antigravity",
                    display_name=identity.display_name,
                )
                if acc:
                    discovered += 1
                    # Get quota and record snapshots
                    for quota_window in self.get_quota(identity.account_id):
                        snap_in = {
                            "account_id": acc["id"],
                            "service": "Antigravity",
                            "client": "Antigravity",
                            "window_name": quota_window.window_name,
                            "quota_bucket": quota_window.quota_bucket,
                            "remaining_percent": quota_window.remaining_percent,
                            "used_units": quota_window.used_units,
                            "limit_units": quota_window.limit_units,
                            "unit": quota_window.unit,
                            "reset_at": quota_window.reset_at,
                            "source": "hub_api",
                            "staleness_tier": "LIVE",
                        }
                        record_snapshot(snap_in)
                        changed += 1

            return {"ok": True, "changed": changed, "matched": 0, "discovered": discovered}
        except Exception as exc:
            logger.error("Antigravity sync failed: %s", exc, exc_info=True)
            return {"ok": False, "error": str(exc), "changed": changed, "matched": 0, "discovered": discovered}

    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        client = self._get_hub_client()
        if client is None:
            return {"ok": False, "message": "Antigravity hub not running."}
        if client.ping():
            return {"ok": True, "message": "Hub reachable. Account will be synced on next poll."}
        return {"ok": False, "message": "Hub not responding."}


def create_adapter() -> AntigravityAdapter:
    return AntigravityAdapter()
