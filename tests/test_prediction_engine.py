"""
tests/test_prediction_engine.py

Unit tests for packages/core/prediction_engine.py.
No database or network required — pure unit tests.
"""
from __future__ import annotations

import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys

# Ensure repo root is on path
sys.path.insert(0, str(Path(__file__).parent.parent))

from packages.core.prediction_engine import (
    predict_for_account,
    recommend,
    QuotaPrediction,
)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _snaps(pcts: list[float], hours_ago_start: float = 12) -> list[dict]:
    """Generate a synthetic list of snapshots with the given remaining_percent values."""
    now = datetime.now(timezone.utc)
    interval = hours_ago_start / max(len(pcts) - 1, 1)
    snaps = []
    for i, pct in enumerate(pcts):
        t = now - timedelta(hours=hours_ago_start - i * interval)
        snaps.append({
            "captured_at": _iso(t),
            "remaining_percent": pct,
            "window_name": "default",
            "reset_at": _iso(now + timedelta(hours=5)),
        })
    return snaps


class PredictionEngineTestCase(unittest.TestCase):

    def test_stable_quota(self) -> None:
        snaps = _snaps([80, 80, 80, 80])
        pred = predict_for_account(1, "TestProvider", snaps)
        self.assertEqual(pred.trend, "stable")
        self.assertIsNone(pred.exhausted_at)
        self.assertIn(pred.risk_level, ("none", "low"))

    def test_consuming_quota_predicts_exhaustion(self) -> None:
        # 80% → 20% over 12 hours = -5%/h velocity
        snaps = _snaps([80, 60, 40, 20])
        pred = predict_for_account(1, "TestProvider", snaps)
        self.assertEqual(pred.trend, "consuming")
        self.assertIsNotNone(pred.hours_until_exhausted)
        self.assertGreater(pred.hours_until_exhausted, 0)
        self.assertLess(pred.hours_until_exhausted, 10)

    def test_recovering_quota(self) -> None:
        snaps = _snaps([20, 40, 60, 80])
        pred = predict_for_account(1, "TestProvider", snaps)
        self.assertEqual(pred.trend, "recovering")
        self.assertIsNone(pred.exhausted_at)   # recovering, won't exhaust

    def test_critical_risk_low_quota(self) -> None:
        snaps = _snaps([8, 7, 5, 3])
        pred = predict_for_account(1, "TestProvider", snaps)
        self.assertIn(pred.risk_level, ("high", "critical"))
        self.assertIsNotNone(pred.warning)

    def test_exhausted_account(self) -> None:
        snaps = _snaps([0, 0, 0, 0])
        pred = predict_for_account(1, "TestProvider", snaps)
        self.assertEqual(pred.trend, "exhausted")
        self.assertEqual(pred.risk_level, "critical")

    def test_no_snapshots(self) -> None:
        pred = predict_for_account(1, "TestProvider", [])
        self.assertIsNone(pred.current_pct)
        self.assertEqual(pred.trend, "unknown")
        self.assertIsNone(pred.velocity_pph)

    def test_single_snapshot_no_velocity(self) -> None:
        snaps = _snaps([75])
        pred = predict_for_account(1, "TestProvider", snaps)
        self.assertEqual(pred.current_pct, 75.0)
        self.assertIsNone(pred.velocity_pph)   # need 2+ points

    def test_reset_at_populated(self) -> None:
        snaps = _snaps([50, 45])
        pred = predict_for_account(1, "TestProvider", snaps)
        self.assertIsNotNone(pred.reset_at)
        self.assertIsNotNone(pred.hours_until_reset)
        self.assertGreater(pred.hours_until_reset, 0)

    # ── Recommendation engine ────────────────────────────────────────────

    def test_recommend_picks_highest_quota(self) -> None:
        p1 = predict_for_account(1, "P1", _snaps([80, 80]))
        p2 = predict_for_account(2, "P2", _snaps([30, 30]))
        result = recommend([p1, p2])
        self.assertEqual(result.best_account_id, 1)

    def test_recommend_skips_exhausted(self) -> None:
        p1 = predict_for_account(1, "P1", _snaps([0, 0]))    # exhausted
        p2 = predict_for_account(2, "P2", _snaps([35, 34]))  # low but alive
        result = recommend([p1, p2])
        self.assertEqual(result.best_account_id, 2)

    def test_recommend_marks_best(self) -> None:
        p1 = predict_for_account(1, "P1", _snaps([90, 88]))
        p2 = predict_for_account(2, "P2", _snaps([50, 49]))
        result = recommend([p1, p2])
        self.assertTrue(result.predictions[0].recommended)
        self.assertFalse(result.predictions[1].recommended)

    def test_recommend_no_accounts(self) -> None:
        result = recommend([])
        self.assertIsNone(result.best_account_id)
        self.assertIn("No accounts", result.reason)

    def test_recommend_all_exhausted(self) -> None:
        p1 = predict_for_account(1, "P1", _snaps([0, 0]))
        p2 = predict_for_account(2, "P2", _snaps([0, 0]))
        result = recommend([p1, p2])
        self.assertIsNone(result.best_account_id)


if __name__ == "__main__":
    unittest.main()
