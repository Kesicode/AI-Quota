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
    # Python modules can't have hyphens — use importlib with path manipulation
    _MONOREPO_ADAPTERS = [
        # New monorepo providers/ adapters (hyphenated dirs require sys.path trick)
        ("providers.antigravity.adapter",     "providers/antigravity/adapter.py"),
        ("providers.antigravity_cli.adapter", "providers/antigravity-cli/adapter.py"),
        ("providers.codex.adapter",           "providers/codex/adapter.py"),
        ("providers.copilot.adapter",         "providers/copilot/adapter.py"),
        ("providers.gemini.adapter",          "providers/gemini/adapter.py"),
        ("providers.google_cloud.adapter",    "providers/google-cloud/adapter.py"),
        ("providers.cloud_code.adapter",      "providers/cloud-code/adapter.py"),
        ("providers.vscode.adapter",          "providers/vscode/adapter.py"),
    ]
    # Legacy adapters (fully intact — still loaded as fallback)
    _LEGACY_MODULES = [
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

    # Pass 1 — monorepo providers/ adapters (file-based import via importlib.util)
    import importlib.util
    import sys
    from pathlib import Path

    _repo_root = Path(__file__).parent.parent.parent  # AI-Quota root

    for module_name, rel_path in _MONOREPO_ADAPTERS:
        abs_path = _repo_root / rel_path
        if not abs_path.exists():
            continue
        try:
            if module_name not in sys.modules:
                spec = importlib.util.spec_from_file_location(module_name, abs_path)
                if spec is None:
                    continue
                mod = importlib.util.module_from_spec(spec)
                sys.modules[module_name] = mod
                spec.loader.exec_module(mod)  # type: ignore[union-attr]
            else:
                mod = sys.modules[module_name]

            if hasattr(mod, "create_adapter"):
                adapter = mod.create_adapter()
                register(adapter)
                loaded.append(f"{module_name} (monorepo)")
        except Exception as exc:
            logger.warning("Failed to load monorepo adapter %s: %s", module_name, exc)

    # Pass 2 — legacy app/providers/ adapters (only for providers not yet in monorepo)
    for module_path in _LEGACY_MODULES:
        try:
            mod = importlib.import_module(module_path)
            if hasattr(mod, "create_adapter"):
                adapter = mod.create_adapter()
                if adapter.id not in _ADAPTERS:   # don't overwrite monorepo version
                    register(adapter)
                    loaded.append(f"{module_path} (legacy)")
            elif hasattr(mod, "_register"):
                mod._register()
                loaded.append(f"{module_path} (legacy _register)")
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("Failed to load legacy adapter %s: %s", module_path, exc)

    logger.info("Loaded %d provider adapters: %s", len(loaded), loaded)

