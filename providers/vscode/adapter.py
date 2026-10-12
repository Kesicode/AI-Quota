"""
providers/vscode/adapter.py

VS Code host adapter — v2 monorepo wrapper.
VS Code does not own quotas. Authority belongs to the installed AI provider
extension (Copilot, Gemini, Antigravity, etc.) — never to VS Code itself.
"""
from __future__ import annotations

import shutil
from typing import Any

from app.providers.vscode import VSCodeAdapter as _Base

try:
    from packages.core.models import ProviderCapabilities  # type: ignore
except ImportError:
    ProviderCapabilities = None  # type: ignore


class VSCodeProviderAdapter(_Base):
    """v2 monorepo wrapper around the existing VSCodeAdapter."""

    def capabilities(self) -> Any:
        caps = dict(
            supports_quota=False,
            supports_usage=False,
            supports_account_detection=True,
            supports_account_switching=False,
            supports_instant_switch=False,
            supports_credential_vault=False,
            supports_history=False,
            supports_realtime=False,
            switch_method="unsupported",
        )
        if ProviderCapabilities is not None:
            return ProviderCapabilities(**caps)
        return caps

    def detect(self) -> dict[str, Any]:
        """Detect whether VS Code or a VS Code-compatible IDE is installed."""
        import os, sys

        candidates = ["code", "code-insiders", "codium", "cursor"]
        found = [c for c in candidates if shutil.which(c) is not None]

        # Also check for VSCODE_PID env var (running inside VS Code integrated terminal)
        inside_vscode = bool(
            os.environ.get("VSCODE_PID")
            or os.environ.get("TERM_PROGRAM", "") == "vscode"
        )

        return {
            "detected": bool(found) or inside_vscode,
            "hub_url": None,
            "found_executables": found,
            "inside_vscode_terminal": inside_vscode,
            "note": (
                "VS Code is an IDE host — quota authority belongs to the installed "
                "provider extension (Copilot, Gemini, Antigravity, etc.)."
            ),
        }

    def health_check(self) -> dict[str, Any]:
        detection = self.detect()
        return {
            "status": "ok",
            "detected": detection["detected"],
            "found_executables": detection["found_executables"],
            "note": "VS Code host — no quota tracked directly.",
        }


def create_adapter() -> VSCodeProviderAdapter:
    return VSCodeProviderAdapter()
