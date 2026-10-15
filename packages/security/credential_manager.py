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
    # Official Antigravity (gemini:antigravity) Windows Credential Vault
    # ─────────────────────────────────────────────────────────────────

    def read_system_antigravity_credential(self) -> dict[str, Any] | None:
        """Read the live credential target (gemini:antigravity) from OS Credential Manager."""
        return _read_win_cred("gemini:antigravity")

    def write_system_antigravity_credential(
        self, secret_str: str, username: str = "antigravity", persist: int = 2
    ) -> bool:
        """Write a credential blob directly into OS Credential Manager (gemini:antigravity)."""
        return _write_win_cred("gemini:antigravity", secret_str, username=username, persist=persist)

    def capture_active_antigravity_credential(
        self, account_id: str, expected_email: str | None = None
    ) -> bool:
        """
        Capture the current active Antigravity credential from Windows Credential Manager
        and store it in AI-Quota's vault under account_id.
        If expected_email is given, verifies the internal token identity matches.
        """
        cred = self.read_system_antigravity_credential()
        if not cred or not cred.get("secret"):
            return False
        if expected_email:
            token_email = cred.get("email")
            if token_email and token_email.lower() != expected_email.lower():
                logger.warning(
                    "Token email mismatch: credential has %s, expected %s",
                    token_email, expected_email
                )
                return False
        self.store_and_save_ref(account_id, cred["secret"])
        logger.info("Captured active Antigravity credential for account_id=%s", account_id)
        return True

    def apply_antigravity_credential(self, account_id: str) -> bool:
        """
        Retrieve stored credential for account_id from AI-Quota vault and write it
        into the live gemini:antigravity target in OS Credential Manager.
        """
        secret = self.retrieve(account_id)
        if not secret:
            logger.warning("No vaulted credential found for account_id=%s", account_id)
            return False
        ok = self.write_system_antigravity_credential(secret)
        if ok:
            logger.info("Applied vaulted credential to gemini:antigravity for account_id=%s", account_id)
        return ok


# ─── Windows Advapi32.dll CredRead / CredWrite helpers ───────────────────────

def extract_email_from_jwt(jwt_token: str | None) -> str | None:
    if not jwt_token or not isinstance(jwt_token, str):
        return None
    try:
        import base64
        import json
        parts = jwt_token.split(".")
        if len(parts) >= 2:
            payload = parts[1] + "=" * (-len(parts[1]) % 4)
            data = json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")))
            if isinstance(data, dict) and data.get("email"):
                return str(data["email"]).strip().lower()
    except Exception:
        pass
    return None


def extract_email_from_credential_blob(secret_str: str | None) -> str | None:
    if not secret_str:
        return None
    try:
        import json
        data = json.loads(secret_str)
        if isinstance(data, dict):
            if data.get("id_token"):
                em = extract_email_from_jwt(data["id_token"])
                if em:
                    return em
            if data.get("email"):
                return str(data["email"]).strip().lower()
    except Exception:
        pass
    return None


def _read_win_cred(target_name: str = "gemini:antigravity") -> dict[str, Any] | None:
    if platform.system() != "Windows":
        return None
    try:
        import ctypes
        from ctypes import wintypes
        advapi32 = ctypes.windll.advapi32

        class FILETIME(ctypes.Structure):
            _fields_ = [("dwLowDateTime", wintypes.DWORD), ("dwHighDateTime", wintypes.DWORD)]

        class CREDENTIALW(ctypes.Structure):
            _fields_ = [
                ("Flags", wintypes.DWORD),
                ("Type", wintypes.DWORD),
                ("TargetName", wintypes.LPWSTR),
                ("Comment", wintypes.LPWSTR),
                ("LastWritten", FILETIME),
                ("CredentialBlobSize", wintypes.DWORD),
                ("CredentialBlob", ctypes.POINTER(ctypes.c_byte)),
                ("Persist", wintypes.DWORD),
                ("AttributeCount", wintypes.DWORD),
                ("Attributes", ctypes.c_void_p),
                ("TargetAlias", wintypes.LPWSTR),
                ("UserName", wintypes.LPWSTR),
            ]

        PCREDENTIALW = ctypes.POINTER(CREDENTIALW)
        advapi32.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(PCREDENTIALW)]
        advapi32.CredReadW.restype = wintypes.BOOL
        advapi32.CredFree.argtypes = [ctypes.c_void_p]

        p_cred = PCREDENTIALW()
        if advapi32.CredReadW(target_name, 1, 0, ctypes.byref(p_cred)):
            c = p_cred.contents
            raw_bytes = ctypes.string_at(c.CredentialBlob, c.CredentialBlobSize)
            username = c.UserName or "antigravity"
            persist = c.Persist
            advapi32.CredFree(p_cred)
            raw_str = raw_bytes.decode("utf-8", errors="replace")
            email = extract_email_from_credential_blob(raw_str)
            return {
                "target_name": target_name,
                "username": username,
                "secret": raw_str,
                "persist": persist,
                "email": email,
            }
    except Exception as exc:
        logger.debug("CredReadW failed for %s: %s", target_name, exc)
    return None


def _write_win_cred(
    target_name: str, secret_str: str, username: str = "antigravity", persist: int = 2
) -> bool:
    if platform.system() != "Windows":
        return False
    try:
        import ctypes
        from ctypes import wintypes
        advapi32 = ctypes.windll.advapi32

        class FILETIME(ctypes.Structure):
            _fields_ = [("dwLowDateTime", wintypes.DWORD), ("dwHighDateTime", wintypes.DWORD)]

        class CREDENTIALW(ctypes.Structure):
            _fields_ = [
                ("Flags", wintypes.DWORD),
                ("Type", wintypes.DWORD),
                ("TargetName", wintypes.LPWSTR),
                ("Comment", wintypes.LPWSTR),
                ("LastWritten", FILETIME),
                ("CredentialBlobSize", wintypes.DWORD),
                ("CredentialBlob", ctypes.POINTER(ctypes.c_byte)),
                ("Persist", wintypes.DWORD),
                ("AttributeCount", wintypes.DWORD),
                ("Attributes", ctypes.c_void_p),
                ("TargetAlias", wintypes.LPWSTR),
                ("UserName", wintypes.LPWSTR),
            ]

        advapi32.CredWriteW.argtypes = [ctypes.POINTER(CREDENTIALW), wintypes.DWORD]
        advapi32.CredWriteW.restype = wintypes.BOOL

        raw_bytes = secret_str.encode("utf-8")
        blob_ptr = (ctypes.c_byte * len(raw_bytes)).from_buffer_copy(raw_bytes)

        cred = CREDENTIALW()
        cred.Flags = 0
        cred.Type = 1  # CRED_TYPE_GENERIC
        cred.TargetName = target_name
        cred.Comment = "Managed by AI-Quota"
        cred.CredentialBlobSize = len(raw_bytes)
        cred.CredentialBlob = ctypes.cast(blob_ptr, ctypes.POINTER(ctypes.c_byte))
        cred.Persist = persist
        cred.AttributeCount = 0
        cred.Attributes = None
        cred.TargetAlias = None
        cred.UserName = username

        ok = advapi32.CredWriteW(ctypes.byref(cred), 0)
        return bool(ok)
    except Exception as exc:
        logger.error("CredWriteW failed for %s: %s", target_name, exc)
        return False


# ─────────────────────────────────────────────────────────────────
# Module-level singleton
# ─────────────────────────────────────────────────────────────────
_manager: CredentialManager | None = None


def get_credential_manager() -> CredentialManager:
    global _manager
    if _manager is None:
        _manager = CredentialManager()
    return _manager

