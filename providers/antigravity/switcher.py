"""
AI-Quota 2.0 — Antigravity account switcher.

Instant switch workflow (Windows):
  1. Retrieve credential blob from OS vault (CredentialManager)
  2. POST credential to AGY hub via HubClient
  3. Optionally restart AGY backend process if hub requires it
  4. Wait for readiness
  5. Call get_current_account() to verify active account matches requested
  6. Return SwitchResult — never report success without verification

Assisted fallback (macOS/Linux/unsupported):
  1. Instruct user to sign in via browser auth flow
  2. Monitor for account change
  3. Verify once change is detected
"""
from __future__ import annotations

import logging
import platform
import time

from packages.core.models import (
    AccountIdentity,
    SwitchMethod,
    SwitchResult,
    SwitchStatus,
)

logger = logging.getLogger("ai_quota.antigravity.switcher")

_READINESS_TIMEOUT = 20.0   # seconds to wait for hub to come back after restart
_READINESS_POLL = 1.0


class AntigravitySwitcher:
    """
    Handles account switching for the Antigravity provider.
    Uses instant (DPAPI) on Windows, assisted fallback on others.
    """

    def __init__(self, hub_client: "HubClient", credential_manager: "CredentialManager") -> None:  # noqa: F821
        from providers.antigravity.hub_client import HubClient
        from packages.security.credential_manager import CredentialManager
        self._hub = hub_client
        self._creds = credential_manager
        self._platform = platform.system()

    def can_instant_switch(self) -> bool:
        """Instant switch requires Windows + credential stored in vault."""
        return self._platform == "Windows"

    def switch(self, target_account_id: str) -> SwitchResult:
        """
        Perform account switch. Chooses instant or assisted based on platform.
        """
        if self.can_instant_switch():
            return self._instant_switch(target_account_id)
        else:
            return self._assisted_switch(target_account_id)

    def _instant_switch(self, target_account_id: str) -> SwitchResult:
        """Windows instant switch via credential vault + hub POST."""
        logger.info("Starting instant switch to %s (Windows DPAPI path)", target_account_id)

        # 1. Retrieve credential blob from OS vault
        secret = self._creds.retrieve(target_account_id)
        if not secret:
            logger.warning("No credential stored for account %s — falling back to assisted", target_account_id)
            return self._assisted_switch(target_account_id)

        # 2. POST credential to hub
        try:
            import json
            # The credential blob is expected to be the account session/token data
            # wrapped in the format AGY hub expects
            payload: dict = {}
            try:
                payload = json.loads(secret)
            except Exception:
                payload = {"credential": secret}

            payload["accountId"] = target_account_id

            result = self._hub.switch_account(payload)
            if not result.get("ok", False) and not result.get("success", False):
                raise RuntimeError(result.get("error") or "Hub switch returned not-ok")
        except Exception as exc:
            logger.error("Hub switch POST failed: %s — falling back to assisted", exc)
            return self._assisted_switch(target_account_id)

        # 3. Wait for hub readiness
        self._wait_for_readiness()

        # 4. Verify (caller SwitchEngine does the final verification)
        logger.info("Instant switch posted successfully for %s", target_account_id)
        return SwitchResult(
            requested_account_id=target_account_id,
            status=SwitchStatus.PENDING,    # SwitchEngine will verify and set final status
            method_used=SwitchMethod.INSTANT,
            verified=False,
        )

    def _assisted_switch(self, target_account_id: str) -> SwitchResult:
        """
        Assisted switch — instructs user to complete auth flow.
        On platforms where instant switching isn't possible.
        """
        logger.info("Assisted switch required for account %s on %s", target_account_id, self._platform)
        # On assisted path, we signal the IDE to open the auth flow
        # The actual verification happens through the SwitchEngine's polling
        return SwitchResult(
            requested_account_id=target_account_id,
            status=SwitchStatus.PENDING,
            method_used=SwitchMethod.ASSISTED,
            verified=False,
            reason="Assisted authentication flow initiated. Complete sign-in to proceed.",
        )

    def _wait_for_readiness(self, timeout: float = _READINESS_TIMEOUT) -> bool:
        """Wait until the hub is responsive again (after restart/reload)."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self._hub.ping():
                return True
            time.sleep(_READINESS_POLL)
        logger.warning("Hub did not become ready within %ss", timeout)
        return False
