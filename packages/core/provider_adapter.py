"""
AI-Quota 2.0 — Extended ProviderAdapter abstract base class.

Backward-compatible with existing AI-Quota adapters:
  - All existing abstract methods preserved (id, display_name, supported_clients, truth, sync, connect_account)
  - New optional methods have default implementations so existing adapters don't break
  - New abstract methods: capabilities()
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .models import (
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


class ProviderAdapter(ABC):
    """
    Abstract base class for all AI-Quota provider adapters.

    Implementing adapters must override:
      - id, display_name, supported_clients, truth  (existing contract)
      - capabilities()                              (new in v2)
      - sync()                                      (existing contract)
      - connect_account()                           (existing contract)

    Adapters MAY optionally override:
      - detect()            — whether the provider/IDE is currently running
      - get_current_account() — which account is currently active
      - get_quota()          — quota snapshot for a specific account
      - switch_account()     — perform account switch
      - health_check()       — provider health status
    """

    # ─── Existing abstract properties (backward-compatible) ───────────────

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique provider identifier (e.g. 'antigravity', 'codex')."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable provider name."""

    @property
    @abstractmethod
    def supported_clients(self) -> list[str]:
        """List of client strings this adapter handles."""

    @property
    @abstractmethod
    def truth(self) -> ProviderTruth:
        """Authority classification metadata."""

    @abstractmethod
    def capabilities(self) -> ProviderCapabilities:
        """Declare what this adapter can do. Must not raise."""

    # ─── Existing abstract methods (backward-compatible) ─────────────────

    @abstractmethod
    def sync(self) -> dict[str, Any]:
        """
        Execute quota collection for all accounts this provider manages.
        Must be fully exception-safe. Returns summary dict:
        { "ok": bool, "changed": int, "matched": int, "discovered": int, "error": str|None }
        """

    @abstractmethod
    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        """
        Attempt to connect/enable telemetry for a specific registered account.
        Returns: { "ok": bool, "message": str }
        """

    # ─── New optional methods (v2) — safe defaults provided ──────────────

    def detect(self) -> ProviderDetection:
        """
        Detect whether this provider (IDE/backend) is running locally.
        Override in adapters that can probe processes or ports.
        Default: not detected.
        """
        return ProviderDetection(detected=False, detail="detection not implemented")

    def get_current_account(self) -> AccountIdentity | None:
        """
        Return the currently active account identity for this provider, or None.
        Override in adapters where the provider exposes active-account information.
        """
        return None

    def get_quota(self, account_id: str) -> list[QuotaWindowResult]:
        """
        Return quota windows for a specific account.
        Default: empty list (quota fetched via sync()).
        """
        return []

    def switch_account(self, account_id: str, *, force: bool = False) -> SwitchResult:
        """
        Attempt to switch to the specified account.
        Default: returns unsupported.
        Override in adapters that support account switching.
        """
        caps = self.capabilities()
        if not caps.supports_account_switching:
            return SwitchResult(
                requested_account_id=account_id,
                status=SwitchStatus.FAILED,
                method_used=SwitchMethod.UNSUPPORTED,
                reason=f"Provider '{self.id}' does not support account switching.",
            )
        # Subclass must implement the actual switch logic
        raise NotImplementedError(
            f"Provider '{self.id}' declared supports_account_switching=True "
            "but did not implement switch_account()."
        )

    def health_check(self) -> ProviderHealth:
        """
        Return a health snapshot for this provider.
        Default: unknown status.
        """
        return ProviderHealth(provider_id=self.id, status="unknown")

    # ─── Existing utility methods (backward-compatible) ───────────────────

    def can_handle(self, provider: str, client: str) -> bool:
        """Check whether this adapter handles the given provider/client pair."""
        p = (provider or "").strip().lower()
        c = (client or "").strip().lower()
        supported = [sc.lower() for sc in self.supported_clients]
        if any(c == sc or sc in c for sc in supported if c):
            return True
        if not c or c in ("other", "provider", "default"):
            if p == self.id.lower() or any(p == sc or sc in p for sc in supported):
                return True
        return False

    def health(self) -> dict[str, Any]:
        """Legacy health dict — preserved for backward compat."""
        caps = self.capabilities()
        return {
            "id": self.id,
            "display_name": self.display_name,
            "live_supported": self.truth.live,
            "truth": self.truth.truth,
            "authority_type": self.truth.authority_type,
            "capabilities": {
                "quota": caps.supports_quota,
                "detection": caps.supports_account_detection,
                "switching": caps.supports_account_switching,
                "instant_switch": caps.supports_instant_switch,
                "switch_method": caps.switch_method.value,
            },
        }
