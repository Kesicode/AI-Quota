from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from app.database import init_db, set_db_path, get_connection
from app.services.account_service import (
    create_account,
    delete_account,
    get_account_by_id,
    list_accounts,
    ensure_auto_discovered_account,
    is_ignored,
)
from app.services.snapshot_service import (
    record_snapshot,
    get_latest_snapshots,
    list_snapshots,
)


class DatabaseTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_ai_quota.db"
        set_db_path(self.db_path)
        init_db(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_create_and_list_accounts(self) -> None:
        acc = create_account(
            email="test@example.com",
            provider="Cloud Code",
            client="Cloud Code / Cloud Shell",
            display_name="My Cloud Project",
        )
        self.assertEqual(acc["email"], "test@example.com")
        self.assertEqual(acc["provider"], "Cloud Code")
        self.assertEqual(acc["client"], "Cloud Code / Cloud Shell")
        self.assertEqual(acc["status"], "not_connected")

        accounts = list_accounts()
        self.assertEqual(len(accounts), 1)
        self.assertEqual(accounts[0]["id"], acc["id"])

    def test_duplicate_account_prevention(self) -> None:
        create_account("user@example.com", "Antigravity", "Antigravity 2.0")
        # Same email + same client must raise KeyError
        with self.assertRaises(KeyError):
            create_account("user@example.com", "Antigravity", "Antigravity 2.0")

        # Case-insensitive duplicate check
        with self.assertRaises(KeyError):
            create_account("USER@EXAMPLE.COM", "Antigravity", "Antigravity 2.0")

    def test_same_email_different_client_allowed(self) -> None:
        acc1 = create_account("shared@example.com", "Antigravity", "Antigravity 2.0")
        acc2 = create_account("shared@example.com", "Antigravity", "Antigravity CLI")
        acc3 = create_account("shared@example.com", "Cloud Code", "Cloud Code / Cloud Shell")

        self.assertNotEqual(acc1["id"], acc2["id"])
        self.assertNotEqual(acc2["id"], acc3["id"])
        self.assertEqual(len(list_accounts()), 3)

    def test_delete_account_and_ignore_list(self) -> None:
        acc = create_account("del@example.com", "Antigravity", "Antigravity 2.0")
        record_snapshot(
            account_id=acc["id"],
            service="Antigravity",
            client="Antigravity 2.0",
            model="Gemini",
            window_name="Weekly Limit",
            remaining_percent=90.0,
        )

        self.assertEqual(len(get_latest_snapshots(acc["id"])), 1)

        # Delete account
        deleted = delete_account(acc["id"])
        self.assertIsNotNone(deleted)
        self.assertIsNone(get_account_by_id(acc["id"]))
        self.assertEqual(len(list_accounts()), 0)

        # Snapshots should be cascade-deleted
        self.assertEqual(len(get_latest_snapshots(acc["id"])), 0)

        # Account must be in ignore list
        self.assertTrue(is_ignored("del@example.com", "Antigravity", "Antigravity 2.0"))

        # Auto-discovery should NOT resurrect an ignored account
        resurrected = ensure_auto_discovered_account(
            "del@example.com", "Antigravity", "Antigravity 2.0"
        )
        self.assertIsNone(resurrected)

    def test_snapshots_idempotent_and_latest(self) -> None:
        acc = create_account("snap@example.com", "Antigravity", "Antigravity CLI")
        snap1_id = record_snapshot(
            account_id=acc["id"],
            service="Antigravity",
            client="Antigravity CLI",
            model="gemini",
            window_name="Weekly Limit",
            remaining_percent=80.0,
            captured_at="2026-09-20T00:00:00Z",
        )
        # Duplicate record with exact same timestamp should return same ID
        snap2_id = record_snapshot(
            account_id=acc["id"],
            service="Antigravity",
            client="Antigravity CLI",
            model="gemini",
            window_name="Weekly Limit",
            remaining_percent=80.0,
            captured_at="2026-09-20T00:00:00Z",
        )
        self.assertEqual(snap1_id, snap2_id)

        # New snapshot with later timestamp
        record_snapshot(
            account_id=acc["id"],
            service="Antigravity",
            client="Antigravity CLI",
            model="gemini",
            window_name="Weekly Limit",
            remaining_percent=75.0,
            captured_at="2026-09-20T01:00:00Z",
        )

        latest = get_latest_snapshots(acc["id"])
        self.assertEqual(len(latest), 1)
        self.assertEqual(latest[0]["remaining_percent"], 75.0)


if __name__ == "__main__":
    unittest.main()
