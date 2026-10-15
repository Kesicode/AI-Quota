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


def kill_antigravity_language_servers() -> bool:
    """Terminate running language server processes so official extension respawns them with new credential."""
    import subprocess
    cmd = r'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match "language[-_]server" -and $_.CommandLine -match "antigravity" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'
    try:
        subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd], timeout=6, check=False)
        return True
    except Exception as exc:
        logger.warning("Failed to terminate language server: %s", exc)
        return False


class AntigravitySwitcher:
    """
    Handles account switching for the Antigravity provider.
    Uses instant (gemini:antigravity OS vault + process respawn) on Windows,
    assisted fallback on others.
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
        """Windows instant switch via OS Credential Manager (gemini:antigravity) + process respawn."""
        logger.info("Starting instant switch to %s (Windows Credential Manager path)", target_account_id)

        # 1. Retrieve credential blob from OS vault
        if not self._creds.has_credential(target_account_id):
            logger.warning("No credential stored in vault for account %s — falling back to assisted", target_account_id)
            return self._assisted_switch(target_account_id)

        # 2. Apply target credential into gemini:antigravity target in Windows Credential Manager
        applied = self._creds.apply_antigravity_credential(target_account_id)
        if not applied:
            logger.error("Failed to write credential to gemini:antigravity — falling back to assisted")
            return self._assisted_switch(target_account_id)

        # 3. Invalidate probe caches so verification sees fresh process
        try:
            from app.providers.antigravity_2 import _PROBE_CACHE, _WORKING_ENDPOINT
            _PROBE_CACHE["expires"] = 0.0
            _WORKING_ENDPOINT.update({"pid": None, "port": None, "csrf": None})
        except Exception:
            pass

        # 4. Terminate language server process so official IDE extension respawns it with new credential
        kill_antigravity_language_servers()

        # 5. Wait for hub readiness
        self._wait_for_readiness(timeout=10.0)

        logger.info("Instant switch credential applied and process respawned for %s", target_account_id)
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
