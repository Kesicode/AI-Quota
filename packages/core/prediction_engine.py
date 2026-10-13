"""
packages/core/prediction_engine.py

Quota Prediction & Reset Forecasting Engine.

Uses historical snapshot data to:
  1. Compute velocity (quota consumption rate)
  2. Predict when quota will be exhausted at current rate
  3. Predict when quota will reset (based on recorded reset_at timestamps)
  4. Flag early-warning conditions (quota dropping fast, < 15% remaining)

All math is simple linear extrapolation — no ML needed.
This keeps it offline, fast, and explainable.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Optional


@dataclass
class QuotaPrediction:
    account_id: int
    provider: str
    window_name: str

    # Current state
    current_pct: Optional[float]       # 0-100 or None
    trend: str                         # "stable" | "consuming" | "recovering" | "exhausted" | "unknown"

    # Velocity (percentage points per hour, negative = consuming)
    velocity_pph: Optional[float]      # positive = recovering, negative = consuming

    # Predictions
    exhausted_at: Optional[datetime]   # when quota hits 0 at current rate
    reset_at: Optional[datetime]       # next scheduled reset (from snapshot data)
    hours_until_exhausted: Optional[float]
    hours_until_reset: Optional[float]

    # Recommendation
    recommended: bool                  # True if this account is currently best choice
    recommendation_reason: str

    # Risk level
    risk_level: str                    # "none" | "low" | "medium" | "high" | "critical"
    warning: Optional[str]             # human-readable early warning, if any


@dataclass
class RecommendationResult:
    """Result of the multi-account recommendation engine."""
    best_account_id: Optional[int]
    best_account_name: str
    reason: str
    predictions: list[QuotaPrediction] = field(default_factory=list)
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Helpers ───────────────────────────────────────────────────────────────

def _parse_iso(s: str | None) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Python 3.11+ fromisoformat handles Z; for 3.10 and below, normalise
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _risk_level(pct: Optional[float], velocity_pph: Optional[float]) -> str:
    if pct is None:
        return "unknown"
    if pct <= 0:
        return "critical"
    if pct < 10:
        return "critical"
    if pct < 25:
        return "high"
    # Check if consuming fast (will exhaust within 2h)
    if velocity_pph is not None and velocity_pph < 0:
        hours_left = pct / abs(velocity_pph) if abs(velocity_pph) > 0 else math.inf
        if hours_left < 2:
            return "high"
        if hours_left < 8:
            return "medium"
    if pct < 40:
        return "low"
    return "none"


def _trend(velocity_pph: Optional[float]) -> str:
    if velocity_pph is None:
        return "unknown"
    if abs(velocity_pph) < 0.5:
        return "stable"
    return "consuming" if velocity_pph < 0 else "recovering"


# ── Core prediction function ──────────────────────────────────────────────

def predict_for_account(
    account_id: int,
    provider: str,
    snapshots: list[dict],
    window_name: str = "default",
) -> QuotaPrediction:
    """
    Given a list of snapshot dicts (ordered by captured_at ASC),
    compute a QuotaPrediction for a single account/window.

    Snapshot dict schema:
      captured_at: ISO string
      remaining_percent: float | None
      reset_at: ISO string | None
      window_name: str
    """
    now = _now()

    # Filter to matching window and last 24h (enough for velocity)
    cutoff = now - timedelta(hours=24)
    relevant = [
        s for s in snapshots
        if (s.get("window_name") == window_name or window_name == "default")
        and s.get("remaining_percent") is not None
        and _parse_iso(s.get("captured_at")) is not None
        and _parse_iso(s.get("captured_at")) >= cutoff
    ]
    relevant.sort(key=lambda s: s.get("captured_at", ""))

    # Current state
    current_pct: Optional[float] = None
    reset_at: Optional[datetime] = None

    if relevant:
        latest = relevant[-1]
        current_pct = float(latest["remaining_percent"])
        reset_at = _parse_iso(latest.get("reset_at"))

    # Velocity calculation (linear regression over at least 2 points)
    velocity_pph: Optional[float] = None
    if len(relevant) >= 2:
        first = relevant[0]
        last  = relevant[-1]
        t0 = _parse_iso(first["captured_at"])
        t1 = _parse_iso(last["captured_at"])
        p0 = float(first["remaining_percent"])
        p1 = float(last["remaining_percent"])
        if t0 and t1:
            hours = (t1 - t0).total_seconds() / 3600
            if hours > 0.1:   # need at least 6 minutes of history
                velocity_pph = (p1 - p0) / hours

    # Exhaustion prediction
    exhausted_at: Optional[datetime] = None
    hours_until_exhausted: Optional[float] = None
    if current_pct is not None and velocity_pph is not None and velocity_pph < 0:
        hours_left = current_pct / abs(velocity_pph)
        hours_until_exhausted = round(hours_left, 2)
        exhausted_at = now + timedelta(hours=hours_left)

    # Reset timing
    hours_until_reset: Optional[float] = None
    if reset_at and reset_at > now:
        hours_until_reset = round((reset_at - now).total_seconds() / 3600, 2)

    # Risk and trend
    trend = _trend(velocity_pph)
    if current_pct is not None and current_pct <= 0:
        trend = "exhausted"
    risk = _risk_level(current_pct, velocity_pph)

    # Warning message
    warning: Optional[str] = None
    if risk == "critical" and exhausted_at:
        warning = f"Quota critical — exhausted in ~{hours_until_exhausted:.1f}h"
    elif risk == "critical":
        warning = "Quota at 0% or unavailable"
    elif risk == "high" and hours_until_exhausted is not None:
        warning = f"Quota dropping fast — ~{hours_until_exhausted:.1f}h remaining"
    elif risk == "medium":
        warning = f"Quota low ({current_pct:.0f}%)"

    return QuotaPrediction(
        account_id=account_id,
        provider=provider,
        window_name=window_name,
        current_pct=current_pct,
        trend=trend,
        velocity_pph=round(velocity_pph, 4) if velocity_pph is not None else None,
        exhausted_at=exhausted_at,
        reset_at=reset_at,
        hours_until_exhausted=hours_until_exhausted,
        hours_until_reset=hours_until_reset,
        recommended=False,    # set by recommendation engine
        recommendation_reason="",
        risk_level=risk,
        warning=warning,
    )


# ── Multi-account recommendation engine ──────────────────────────────────

def recommend(predictions: list[QuotaPrediction]) -> RecommendationResult:
    """
    Given a list of predictions for all accounts, select the best account
    to use and explain the choice.

    Scoring:
      +  current_pct  (higher = better)
      +  live status  (not exhausted)
      +  low velocity_consumption (stable or recovering)
      -  critical / high risk
      +  more time until exhaustion
    """
    candidates = [p for p in predictions if p.current_pct is not None and p.current_pct > 0]

    if not candidates:
        return RecommendationResult(
            best_account_id=None,
            best_account_name="—",
            reason="No accounts have available quota.",
            predictions=predictions,
        )

    def score(p: QuotaPrediction) -> float:
        s = float(p.current_pct or 0)
        # Reward stability / recovery
        if p.trend == "recovering":
            s += 20
        elif p.trend == "stable":
            s += 10
        # Penalise high risk
        penalty = {"none": 0, "low": 0, "medium": -10, "high": -25, "critical": -50}
        s += penalty.get(p.risk_level, 0)
        # Reward more time until exhaustion
        if p.hours_until_exhausted is not None:
            s += min(p.hours_until_exhausted, 24)   # cap at 24h bonus
        return s

    best = max(candidates, key=score)

    # Build reason string
    pct_str = f"{best.current_pct:.0f}%" if best.current_pct is not None else "—"
    trend_str = best.trend
    if best.hours_until_exhausted is not None:
        trend_str += f", ~{best.hours_until_exhausted:.1f}h remaining"
    reason = f"Highest available quota ({pct_str}, {trend_str}, risk: {best.risk_level})"

    # Mark best as recommended
    for p in predictions:
        p.recommended = p.account_id == best.account_id
        if p.recommended:
            p.recommendation_reason = reason

    return RecommendationResult(
        best_account_id=best.account_id,
        best_account_name=f"Account {best.account_id}",
        reason=reason,
        predictions=predictions,
    )
