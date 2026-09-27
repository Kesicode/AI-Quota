"""
AI-Quota 2.0 — Antigravity hub CSRF-aware HTTP client.

Reads CSRF token before each mutating request.
Mirrors the patterns from:
  BoyGR/antigravity-account-switcher / src/antigravity/hub-auth-client.ts
"""
from __future__ import annotations

import json
import logging
import urllib.request
import urllib.error
from typing import Any

logger = logging.getLogger("ai_quota.antigravity.hub_client")

_DEFAULT_TIMEOUT = 8.0


class HubClient:
    """
    CSRF-safe HTTP client for the Antigravity hub.

    All state-changing requests (POST/PUT/DELETE) acquire a fresh CSRF token
    before sending. GET requests are read-only and do not need CSRF.
    """

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._csrf_token: str | None = None

    def _url(self, path: str) -> str:
        return f"{self.base_url}/{path.lstrip('/')}"

    def _acquire_csrf(self) -> str | None:
        """Fetch a fresh CSRF token from the hub."""
        for path in ["/api/csrf", "/api/auth/csrf", "/_csrf", "/api/token"]:
            try:
                req = urllib.request.Request(self._url(path))
                with urllib.request.urlopen(req, timeout=_DEFAULT_TIMEOUT) as resp:
                    data = json.loads(resp.read(4096))
                    token = (
                        data.get("csrf_token")
                        or data.get("csrfToken")
                        or data.get("token")
                    )
                    if token:
                        self._csrf_token = token
                        return token
            except Exception:
                continue
        return None

    def get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        """HTTP GET — no CSRF needed."""
        url = self._url(path)
        if params:
            from urllib.parse import urlencode
            url = f"{url}?{urlencode(params)}"
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=_DEFAULT_TIMEOUT) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            logger.warning("GET %s → %s %s", path, exc.code, exc.reason)
            raise
        except Exception as exc:
            logger.warning("GET %s failed: %s", path, exc)
            raise

    def post(self, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """HTTP POST with CSRF token."""
        token = self._acquire_csrf()
        payload = json.dumps(body or {}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if token:
            headers["X-CSRF-Token"] = token
            headers["X-Csrf-Token"] = token  # some AGY versions use different casing
        req = urllib.request.Request(self._url(path), data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=_DEFAULT_TIMEOUT) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            logger.warning("POST %s → %s %s", path, exc.code, exc.reason)
            raise
        except Exception as exc:
            logger.warning("POST %s failed: %s", path, exc)
            raise

    def get_quota(self) -> dict[str, Any]:
        """Fetch quota information from the hub."""
        for path in ["/api/quota", "/api/usage", "/v1/quota", "/api/stats"]:
            try:
                return self.get(path)
            except Exception:
                continue
        return {}

    def get_current_account(self) -> dict[str, Any]:
        """Fetch the currently active account from the hub."""
        for path in ["/api/auth/account", "/api/account", "/api/user", "/api/auth/user"]:
            try:
                return self.get(path)
            except Exception:
                continue
        return {}

    def switch_account(self, account_data: dict[str, Any]) -> dict[str, Any]:
        """
        POST the account switch request to the hub.
        Account data should contain the credential/session blob.
        """
        for path in ["/api/auth/switch", "/api/switch-account", "/api/auth/set-account"]:
            try:
                return self.post(path, body=account_data)
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    continue
                raise
            except Exception:
                continue
        return {"ok": False, "error": "No switch endpoint found on hub"}

    def ping(self) -> bool:
        """Return True if the hub is reachable."""
        try:
            self.get("/api/health")
            return True
        except Exception:
            return False
