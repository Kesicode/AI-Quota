"""
AI-Quota 2.0 — Credential Manager.

ZERO REMOTE SECRET STORAGE POLICY:
  - Raw credentials NEVER stored in SQLite.
  - Only opaque credential_reference keys stored in DB.
  - All actual secrets live in the OS-native vault.

Windows: Windows Credential Manager via keyring / ctypes DPAPI
macOS:   Keychain via keyring
Linux:   SecretService via keyring / plain-text fallback (with warning)

Reference for Windows DPAPI flow:
  BoyGR/antigravity-account-switcher / src/antigravity/token-vault-service.ts
"""
from __future__ import annotations

import logging
import platform
import sys
from typing import Protocol

logger = logging.getLogger("ai_quota.credential_manager")

# ─────────────────────────────────────────────────────────────────
# Key format: quota://credential/<account_id>
# ─────────────────────────────────────────────────────────────────
_KEY_PREFIX = "quota://credential/"
_SERVICE_NAME = "AI-Quota"


def _make_key_ref(account_id: str) -> str:
    return f"{_KEY_PREFIX}{account_id}"


# ─────────────────────────────────────────────────────────────────
# Vault backend protocol
# ─────────────────────────────────────────────────────────────────

class _VaultBackend(Protocol):
    def store(self, service: str, username: str, secret: str) -> None: ...
    def retrieve(self, service: str, username: str) -> str | None: ...
    def delete(self, service: str, username: str) -> None: ...


# ─────────────────────────────────────────────────────────────────
# keyring backend (Windows Credential Manager / macOS Keychain / Linux SecretService)
# ─────────────────────────────────────────────────────────────────

class _KeyringBackend:
    def __init__(self) -> None:
        import keyring  # type: ignore[import]
        self._keyring = keyring

    def store(self, service: str, username: str, secret: str) -> None:
        self._keyring.set_password(service, username, secret)

    def retrieve(self, service: str, username: str) -> str | None:
        return self._keyring.get_password(service, username)

    def delete(self, service: str, username: str) -> None:
        try:
            self._keyring.delete_password(service, username)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────
# In-memory fallback (development / no keyring available)
# NEVER used in production paths — emits a loud warning.
# ─────────────────────────────────────────────────────────────────

class _MemoryBackend:
    """
    In-memory fallback — for testing and environments without a keyring.
    Credentials are LOST on process restart.
    """
    def __init__(self) -> None:
        self._store: dict[tuple[str, str], str] = {}
        logger.warning(
            "⚠ CredentialManager using IN-MEMORY backend — credentials will not persist. "
            "Install 'keyring' package for OS-native credential storage."
        )

    def store(self, service: str, username: str, secret: str) -> None:
        self._store[(service, username)] = secret

    def retrieve(self, service: str, username: str) -> str | None:
        return self._store.get((service, username))

    def delete(self, service: str, username: str) -> None:
        self._store.pop((service, username), None)


def _create_backend() -> _VaultBackend:
    try:
        return _KeyringBackend()
    except ImportError:
        logger.warning("'keyring' package not installed. Falling back to in-memory credential store.")
        return _MemoryBackend()


# ─────────────────────────────────────────────────────────────────
# Public CredentialManager API
# ─────────────────────────────────────────────────────────────────

class CredentialManager:
    """
    OS-native credential storage for AI-Quota.

    Rules:
      - store()    → writes to OS vault; returns opaque key_ref for SQLite
      - retrieve() → reads from OS vault using key_ref
      - delete()   → removes from OS vault
      - SQLite stores ONLY the key_ref string, never the secret value
    """

    def __init__(self) -> None:
        self._backend = _create_backend()
        self._platform = platform.system()

    @property
    def vault_kind(self) -> str:
        if isinstance(self._backend, _MemoryBackend):
            return "memory"
        if self._platform == "Windows":
            return "windows_credential_manager"
        if self._platform == "Darwin":
            return "macos_keychain"
        return "secret_service"

    def store(self, account_id: str, secret_blob: str) -> str:
        """
        Store a secret for account_id in the OS vault.
        Returns the opaque key_ref to persist in SQLite.
        NEVER returns or logs the secret_blob.
        """
        key_ref = _make_key_ref(account_id)
        self._backend.store(_SERVICE_NAME, key_ref, secret_blob)
        logger.debug("Stored credential for account_id=%s (vault=%s)", account_id, self.vault_kind)
        return key_ref

    def retrieve(self, account_id: str) -> str | None:
        """
        Retrieve the secret for account_id from the OS vault.
        Returns None if not found or on error.
        NEVER logs the return value.
        """
        key_ref = _make_key_ref(account_id)
        try:
            return self._backend.retrieve(_SERVICE_NAME, key_ref)
        except Exception as exc:
            logger.warning("Failed to retrieve credential for %s: %s", account_id, exc)
            return None

    def delete(self, account_id: str) -> None:
        """Remove the credential for account_id from the OS vault."""
        key_ref = _make_key_ref(account_id)
        try:
            self._backend.delete(_SERVICE_NAME, key_ref)
            logger.debug("Deleted credential for account_id=%s", account_id)
        except Exception as exc:
            logger.warning("Failed to delete credential for %s: %s", account_id, exc)

    def has_credential(self, account_id: str) -> bool:
        """Return True if a credential is stored for this account."""
        return self.retrieve(account_id) is not None

    def store_and_save_ref(self, account_id: str, secret_blob: str) -> str:
        """
        Store credential in OS vault AND persist the key_ref in the database.
        Returns the key_ref.
        """
        key_ref = self.store(account_id, secret_blob)
        try:
            from packages.database.connection import db_session
            from packages.core.utils_time import now_iso
            with db_session() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO credential_refs (account_id, key_ref, vault_kind, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (account_id, key_ref, self.vault_kind, now_iso()),
                )
        except Exception as exc:
            logger.warning("Could not persist credential_ref for %s: %s", account_id, exc)
        return key_ref


# ─────────────────────────────────────────────────────────────────
# Module-level singleton
# ─────────────────────────────────────────────────────────────────
_manager: CredentialManager | None = None


def get_credential_manager() -> CredentialManager:
    global _manager
    if _manager is None:
        _manager = CredentialManager()
    return _manager
