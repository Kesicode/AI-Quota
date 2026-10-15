"""
AI-Quota 2.0 — Account Serializer

Centralized single source of truth for normalizing and serializing account records
across all API layers (legacy /api/ and modern /api/v1/).

Attaches:
  - latest quota snapshots
  - telemetry age (seconds)
  - context window metrics
  - best_remaining quota percentage (max of non-context windows)
  - provider truth metadata
"""
from __future__ import annotations

from typing import Any


def normalize_account(account: dict[str, Any]) -> dict[str, Any]:
    """
    Given a raw account row or dict from the database, normalize and enrich it
    with snapshots, telemetry age, context window stats, best remaining quota,
    and provider truth metadata.
    """
    from app.services.snapshot_service import get_latest_snapshots
    from app.utils.time import payload_age
    from app.providers import get_provider_truth

    item = dict(account)
    snaps = get_latest_snapshots(item["id"])
    item["snapshots"] = snaps

    # Compute telemetry age based on last_seen_at or the latest snapshot
    age = None
    if item.get("last_seen_at"):
        age = payload_age(item["last_seen_at"])
    elif snaps:
        latest = max(snaps, key=lambda s: s.get("captured_at", ""))
        age = payload_age(latest.get("captured_at"))
    item["telemetry_age_seconds"] = age

    # Extract context window snapshot if present
    context = next((s for s in snaps if s.get("window_name") == "Context Window"), None)
    if context:
        item["context_window"] = {
            "used_percentage": (100.0 - float(context["remaining_percent"]))
            if context.get("remaining_percent") is not None
            else None,
            "context_window_size": context.get("limit_units"),
        }

    # Best remaining percentage for non-context quota (highest available window)
    usable = [
        float(s["remaining_percent"])
        for s in snaps
        if s.get("remaining_percent") is not None and s.get("window_name") != "Context Window"
    ]
    item["best_remaining"] = max(usable) if usable else None

    # Attach provider truth metadata
    truth = get_provider_truth(item)
    item["provider_truth"] = {
        "authority_type": truth.authority_type,
        "label": truth.label,
        "priority": truth.priority,
        "live": truth.live,
        "truth": truth.truth,
        "note": truth.note,
    }

    return item


def serialize_accounts(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Serialize and normalize a list of account dicts."""
    return [normalize_account(acc) for acc in accounts]
