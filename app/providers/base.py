from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProviderTruth:
    key: str
    label: str
    priority: int
    live: bool
    truth: str
    note: str
    authority_type: str = "unknown"
    source_description: str = ""


@dataclass
class QuotaWindowResult:
    window_name: str
    model: str = ""
    remaining_percent: float | None = None
    used_units: float | None = None
    limit_units: float | None = None
    unit: str | None = None
    reset_at: str | None = None
    source: str = ""
    description: str | None = None


class ProviderAdapter(ABC):
    """Abstract base class for all AI Quota provider adapters."""

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique identifier for the provider adapter."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable provider name."""
        pass

    @property
    @abstractmethod
    def supported_clients(self) -> list[str]:
        """List of client names supported by this adapter."""
        pass

    @property
    @abstractmethod
    def truth(self) -> ProviderTruth:
        """Truth metadata for the provider and authority classification."""
        pass

    def can_handle(self, provider: str, client: str) -> bool:
        """Check whether this adapter handles the specified provider/client pair."""
        p = (provider or "").strip().lower()
        c = (client or "").strip().lower()
        if p == self.id.lower() or p in [x.lower() for x in self.supported_clients]:
            return True
        return any(c == sc.lower() or sc.lower() in c for sc in self.supported_clients)

    @abstractmethod
    def sync(self) -> dict[str, Any]:
        """
        Execute collection for all accounts associated with this provider.
        Must be isolated and exception-safe.
        Returns a summary dictionary: { "ok": bool, "changed": int, "matched": int, "discovered": int, "error": str | None }
        """
        pass

    @abstractmethod
    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        """
        Attempt to connect or enable telemetry for a specific registered account.
        Returns a result dict with at least { "ok": bool, "message": str }.
        """
        pass

    def health(self) -> dict[str, Any]:
        """Return health and availability status for this provider adapter."""
        return {
            "id": self.id,
            "display_name": self.display_name,
            "live_supported": self.truth.live,
            "truth": self.truth.truth,
            "authority_type": self.truth.authority_type,
        }
