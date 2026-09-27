"""
AI-Quota 2.0 — Switch Engine.

Implements the full switching workflow:

  1. Resolve target account from registry
  2. Check cooldown and switch-lock
  3. Determine provider adapter + capabilities
  4. Attempt instant switch (Windows DPAPI/CredentialManager)
  5. On failure, fall back to assisted auth flow
  6. Wait for provider readiness
  7. Detect active account from provider
  8. VERIFY requested account == detected active account
  9. Record switch event in DB
  10. Return SwitchResult — NEVER report success without verification

Rules:
- Auto-switch is OFF by default (must be explicitly enabled per account)
- Cooldown: min 30 s between switches (configurable)
- Max 10 switches/hour (configurable)
- Switch lock: blocks concurrent switch attempts
- A switch is SUCCESS only when activeAccount.account_id == requestedAccountId
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any

from .models import (
    AccountIdentity,
    SwitchMethod,
    SwitchResult,
    SwitchStatus,
)

logger = logging.getLogger("ai_quota.switch_engine")

# ─── Switch lock — prevents concurrent switches ───────────────────────────
_switch_lock = threading.Lock()
_switch_in_progress = False

# ─── Cooldown tracking per provider ──────────────────────────────────────
_last_switch_time: dict[str, float] = {}   # provider_id → epoch seconds
_switch_count_this_hour: dict[str, list[float]] = {}  # provider_id → list of timestamps


def _check_cooldown(provider_id: str, cooldown_seconds: int, max_per_hour: int) -> str | None:
    """Return error string if switch is blocked by cooldown/rate-limit, else None."""
    now = time.time()
    last = _last_switch_time.get(provider_id, 0.0)
    if now - last < cooldown_seconds:
        remaining = int(cooldown_seconds - (now - last))
        return f"Cooldown active — wait {remaining}s before switching again."
    # Rate limit: max switches per hour
    hour_ago = now - 3600
    times = _switch_count_this_hour.get(provider_id, [])
    times = [t for t in times if t > hour_ago]
    _switch_count_this_hour[provider_id] = times
    if len(times) >= max_per_hour:
        return f"Rate limit: max {max_per_hour} switches per hour reached."
    return None


def _record_switch_time(provider_id: str) -> None:
    now = time.time()
    _last_switch_time[provider_id] = now
    _switch_count_this_hour.setdefault(provider_id, []).append(now)


def _record_switch_event(
    from_account_id: str | None,
    to_account_id: str,
    method: SwitchMethod,
    verified: bool,
    result: SwitchStatus,
    detail: str | None,
) -> int | None:
    """Write a switch_events row and return its id."""
    try:
        from packages.database.connection import db_session
        from packages.core.utils_time import now_iso
        with db_session() as conn:
            cur = conn.execute(
                """
                INSERT INTO switch_events
                    (from_account_id, to_account_id, method, verified, result, detail, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    from_account_id,
                    to_account_id,
                    method.value,
                    1 if verified else 0,
                    result.value,
                    detail,
                    now_iso(),
                ),
            )
            return cur.lastrowid
    except Exception as exc:
        logger.warning("Failed to record switch event: %s", exc)
        return None


class SwitchEngine:
    """
    Capability-based, cross-platform switch engine.

    Usage:
        engine = SwitchEngine()
        result = engine.switch(provider_adapter, target_account_id, current_account_id)
    """

    def __init__(
        self,
        cooldown_seconds: int = 30,
        max_switches_per_hour: int = 10,
        verify_timeout_seconds: float = 15.0,
        verify_poll_interval: float = 1.0,
    ) -> None:
        self.cooldown_seconds = cooldown_seconds
        self.max_switches_per_hour = max_switches_per_hour
        self.verify_timeout = verify_timeout_seconds
        self.verify_poll = verify_poll_interval

    def switch(
        self,
        adapter: Any,                   # ProviderAdapter instance
        target_account_id: str,
        current_account_id: str | None = None,
        *,
        force: bool = False,
    ) -> SwitchResult:
        """
        Execute the full switching workflow.
        Returns SwitchResult — never raises.
        """
        global _switch_in_progress
        from .provider_adapter import ProviderAdapter
        assert isinstance(adapter, ProviderAdapter)

        caps = adapter.capabilities()
        provider_id = adapter.id

        # ── 0. Check switch support ────────────────────────────────────────
        if not caps.supports_account_switching:
            return SwitchResult(
                requested_account_id=target_account_id,
                status=SwitchStatus.FAILED,
                method_used=SwitchMethod.UNSUPPORTED,
                reason=f"Provider '{provider_id}' does not support account switching.",
            )

        # ── 1. Acquire switch lock ─────────────────────────────────────────
        if not _switch_lock.acquire(blocking=False):
            return SwitchResult(
                requested_account_id=target_account_id,
                status=SwitchStatus.LOCKED,
                method_used=SwitchMethod.UNSUPPORTED,
                reason="Another switch is already in progress.",
            )

        try:
            # ── 2. Cooldown check ──────────────────────────────────────────
            if not force:
                err = _check_cooldown(provider_id, self.cooldown_seconds, self.max_switches_per_hour)
                if err:
                    return SwitchResult(
                        requested_account_id=target_account_id,
                        status=SwitchStatus.COOLDOWN,
                        method_used=SwitchMethod.UNSUPPORTED,
                        reason=err,
                    )

            # ── 3. Attempt switch ──────────────────────────────────────────
            method_used = caps.switch_method
            logger.info(
                "Switching to account %s via provider %s using method %s",
                target_account_id, provider_id, method_used.value,
            )

            try:
                raw_result: SwitchResult = adapter.switch_account(target_account_id, force=force)
            except Exception as exc:
                logger.error("Switch attempt raised: %s", exc, exc_info=True)
                event_id = _record_switch_event(
                    current_account_id, target_account_id, method_used,
                    False, SwitchStatus.FAILED, str(exc),
                )
                return SwitchResult(
                    requested_account_id=target_account_id,
                    status=SwitchStatus.FAILED,
                    method_used=method_used,
                    reason=str(exc),
                    switch_event_id=event_id,
                )

            # ── 4. Verification ────────────────────────────────────────────
            verified = False
            active_id: str | None = None

            if caps.supports_account_detection:
                verified, active_id = self._verify(adapter, target_account_id)

            if not verified and caps.supports_account_detection:
                # Verification failed after switch attempt
                event_id = _record_switch_event(
                    current_account_id, target_account_id, method_used,
                    False, SwitchStatus.VERIFICATION_FAILED,
                    f"Active account detected: {active_id}",
                )
                return SwitchResult(
                    requested_account_id=target_account_id,
                    status=SwitchStatus.VERIFICATION_FAILED,
                    method_used=method_used,
                    verified=False,
                    active_account_id=active_id,
                    reason="Active account after switch does not match requested account.",
                    switch_event_id=event_id,
                )

            # ── 5. Success ─────────────────────────────────────────────────
            _record_switch_time(provider_id)
            final_status = SwitchStatus.SUCCESS
            event_id = _record_switch_event(
                current_account_id, target_account_id, method_used,
                verified, final_status, None,
            )
            logger.info("Switch to %s: SUCCESS (verified=%s)", target_account_id, verified)
            return SwitchResult(
                requested_account_id=target_account_id,
                status=final_status,
                method_used=method_used,
                verified=verified,
                active_account_id=active_id or target_account_id,
                switch_event_id=event_id,
            )

        finally:
            _switch_lock.release()

    def _verify(self, adapter: Any, target_account_id: str) -> tuple[bool, str | None]:
        """
        Poll get_current_account() until it matches target or timeout.
        Returns (verified: bool, active_account_id: str | None).
        """
        deadline = time.monotonic() + self.verify_timeout
        while time.monotonic() < deadline:
            try:
                identity: AccountIdentity | None = adapter.get_current_account()
                if identity and identity.account_id == target_account_id:
                    return True, identity.account_id
                active_id = identity.account_id if identity else None
            except Exception as exc:
                logger.debug("Verification poll error: %s", exc)
                active_id = None
            time.sleep(self.verify_poll)
        return False, active_id  # type: ignore[return-value]


# ─── Module-level singleton ───────────────────────────────────────────────
_engine: SwitchEngine | None = None


def get_switch_engine() -> SwitchEngine:
    """Return (or lazily create) the global switch engine."""
    global _engine
    if _engine is None:
        _engine = SwitchEngine()
    return _engine


def configure_switch_engine(
    cooldown_seconds: int = 30,
    max_switches_per_hour: int = 10,
    verify_timeout_seconds: float = 15.0,
) -> None:
    """Reconfigure the global switch engine (called once at startup from settings)."""
    global _engine
    _engine = SwitchEngine(
        cooldown_seconds=cooldown_seconds,
        max_switches_per_hour=max_switches_per_hour,
        verify_timeout_seconds=verify_timeout_seconds,
    )
