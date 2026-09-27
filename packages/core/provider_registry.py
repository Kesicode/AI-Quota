"""
AI-Quota 2.0 — Dynamic ProviderRegistry.

Replaces the static list in app/providers/__init__.py with a registry that
adapters can register themselves into. The existing app/providers/__init__.py
still works — it just registers its adapters into this registry at startup.
"""
from __future__ import annotations

import importlib
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .provider_adapter import ProviderAdapter

logger = logging.getLogger("ai_quota.registry")

_ADAPTERS: dict[str, "ProviderAdapter"] = {}


def register(adapter: "ProviderAdapter") -> None:
    """Register a provider adapter instance. Replaces any existing adapter with the same id."""
    _ADAPTERS[adapter.id] = adapter
    logger.debug("Registered provider adapter: %s", adapter.id)


def get_all() -> list["ProviderAdapter"]:
    """Return all registered adapters."""
    return list(_ADAPTERS.values())


def get_by_id(provider_id: str) -> "ProviderAdapter | None":
    """Return adapter by id, or None if not registered."""
    return _ADAPTERS.get(provider_id)


def get_for_account(provider: str, client: str) -> "ProviderAdapter | None":
    """Return the first adapter that can_handle(provider, client)."""
    for adapter in _ADAPTERS.values():
        if adapter.can_handle(provider, client):
            return adapter
    return None


def load_builtin_adapters() -> None:
    """
    Discover and load all built-in provider adapters.
    Attempts to import each known provider module; missing ones are skipped silently.
    """
    _builtin_modules = [
        "providers.antigravity.adapter",
        "providers.antigravity_cli.adapter",
        "providers.codex.adapter",
        "providers.copilot.adapter",
        "providers.gemini.adapter",
        "providers.google_cloud.adapter",
        "providers.cloud_code.adapter",
        # Legacy adapters (old paths — for backward compat during migration)
        "app.providers.antigravity_2",
        "app.providers.antigravity_cli",
        "app.providers.codex",
        "app.providers.copilot",
        "app.providers.gemini",
        "app.providers.google_cloud",
        "app.providers.cloud_code",
        "app.providers.vscode",
    ]

    loaded = []
    for module_path in _builtin_modules:
        try:
            mod = importlib.import_module(module_path)
            # Each adapter module is expected to call register() on import,
            # or expose a create_adapter() factory function.
            if hasattr(mod, "create_adapter"):
                adapter = mod.create_adapter()
                register(adapter)
                loaded.append(module_path)
            elif hasattr(mod, "_register"):
                mod._register()
                loaded.append(module_path)
            else:
                loaded.append(f"{module_path} (auto-registered)")
        except ImportError:
            pass  # Provider not yet implemented — skip silently
        except Exception as exc:
            logger.warning("Failed to load provider adapter %s: %s", module_path, exc)

    logger.info("Loaded %d provider adapters: %s", len(loaded), loaded)
