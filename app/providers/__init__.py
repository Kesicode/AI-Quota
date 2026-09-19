from __future__ import annotations

from typing import Any

from .base import ProviderAdapter, ProviderTruth
from .cloud_code import CloudCodeAdapter
from .antigravity_2 import Antigravity2Adapter
from .antigravity_cli import AntigravityCLIAdapter
from .codex import CodexAdapter
from .gemini import GeminiAdapter
from .google_cloud import GoogleCloudAdapter
from .copilot import GitHubCopilotAdapter
from .vscode import VSCodeAdapter

_ADAPTERS: list[ProviderAdapter] = [
    CloudCodeAdapter(),
    Antigravity2Adapter(),
    AntigravityCLIAdapter(),
    CodexAdapter(),
    GoogleCloudAdapter(),
    GeminiAdapter(),
    GitHubCopilotAdapter(),
    VSCodeAdapter(),
]


def get_all_adapters() -> list[ProviderAdapter]:
    return list(_ADAPTERS)


def get_adapter_by_id(adapter_id: str) -> ProviderAdapter | None:
    norm = adapter_id.strip().lower()
    for adapter in _ADAPTERS:
        if adapter.id.lower() == norm:
            return adapter
    return None


def find_adapter(provider: str, client: str) -> ProviderAdapter | None:
    for adapter in _ADAPTERS:
        if adapter.can_handle(provider, client):
            return adapter
    return None


def get_provider_truth(account: dict[str, Any]) -> ProviderTruth:
    provider = account.get("provider", "")
    client = account.get("client", "")
    adapter = find_adapter(provider, client)
    if adapter:
        return adapter.truth
    return ProviderTruth(
        key="other",
        label=provider or "Other",
        priority=10,
        live=False,
        truth="unknown",
        authority_type="unknown",
        note="No authoritative collector is implemented yet.",
        source_description="Unknown source",
    )
