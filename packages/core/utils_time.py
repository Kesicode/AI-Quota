"""Shared time utilities — used across all packages."""
from __future__ import annotations

from datetime import datetime, timezone


def now_iso() -> str:
    """Return current UTC time in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def payload_age(ts_iso: str | None) -> float | None:
    """Return age in seconds of an ISO timestamp, or None if None/invalid."""
    if not ts_iso:
        return None
    try:
        dt = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds()
    except (ValueError, TypeError):
        return None


def staleness_tier(age_seconds: float | None) -> str:
    """
    Classify data freshness into a named tier.

    Tiers:
      LIVE        — received within the last 30 s (real-time feed)
      RECENT      — 30 s – 2 min
      STALE       — 2 min – 10 min
      VERY_STALE  — older than 10 min
      UNKNOWN     — no timestamp available
    """
    if age_seconds is None:
        return "UNKNOWN"
    if age_seconds <= 30:
        return "LIVE"
    if age_seconds <= 120:
        return "RECENT"
    if age_seconds <= 600:
        return "STALE"
    return "VERY_STALE"
