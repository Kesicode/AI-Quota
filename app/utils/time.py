from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def now_iso() -> str:
    """Return the current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def parse_iso(val: str | None) -> datetime | None:
    """Parse an ISO 8601 string to a timezone-aware UTC datetime."""
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def payload_age(payload: dict[str, Any] | str | None) -> float | None:
    """Compute age in seconds from a payload dict or ISO timestamp string."""
    if not payload:
        return None
    raw = payload.get("captured_at") if isinstance(payload, dict) else payload
    dt = parse_iso(raw)
    if not dt:
        return None
    return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())


def format_duration(seconds: float | int | None) -> str:
    """Format duration in seconds into human-readable format."""
    if seconds is None:
        return "—"
    try:
        s = max(0, int(round(float(seconds))))
    except (ValueError, TypeError):
        return "—"
    if s <= 0:
        return "Ready"
    d = s // 86400
    s %= 86400
    h = s // 3600
    s %= 3600
    m = s // 60
    s %= 60
    if d > 0:
        return f"{d}d {h}h"
    if h > 0:
        return f"{h}h {m:02d}m"
    if m > 0:
        return f"{m}m {s:02d}s"
    return f"{s}s"
