from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from starlette.testclient import TestClient

from app.database import init_db, set_db_path
from app.main import app


class ApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_api.db"
        set_db_path(self.db_path)
        init_db(self.db_path)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_health_check(self) -> None:
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["app"], "AI Quota")

    def test_account_crud_and_duplicates(self) -> None:
        # Create account 1
        payload1 = {
            "email": "alpha@example.com",
            "provider": "Cloud Code",
            "client": "Cloud Code / Cloud Shell",
            "display_name": "Alpha Cloud",
        }
        res1 = self.client.post("/api/accounts", json=payload1)
        self.assertEqual(res1.status_code, 201)
        acc1 = res1.json()
        self.assertEqual(acc1["email"], "alpha@example.com")
        self.assertEqual(acc1["status"], "not_connected")

        # Duplicate account must fail with 409
        res_dup = self.client.post("/api/accounts", json=payload1)
        self.assertEqual(res_dup.status_code, 409)

        # Same email with different client must succeed
        payload2 = {
            "email": "alpha@example.com",
            "provider": "Antigravity",
            "client": "Antigravity 2.0",
            "display_name": "Alpha Antigravity",
        }
        res2 = self.client.post("/api/accounts", json=payload2)
        self.assertEqual(res2.status_code, 201)
        acc2 = res2.json()
        self.assertNotEqual(acc1["id"], acc2["id"])

        # List accounts
        res_list = self.client.get("/api/accounts")
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(len(res_list.json()), 2)

        # Delete account
        res_del = self.client.delete(f"/api/accounts/{acc1['id']}")
        self.assertEqual(res_del.status_code, 204)

        # Nonexistent account delete should 404
        res_del_404 = self.client.delete(f"/api/accounts/{acc1['id']}")
        self.assertEqual(res_del_404.status_code, 404)

    def test_dashboard_endpoint(self) -> None:
        # Test dashboard without sync
        res = self.client.get("/api/dashboard?sync=false")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("summary", data)
        self.assertIn("accounts", data)
        self.assertIn("ranking", data)
        self.assertIn("sync", data)

    def test_sync_endpoint(self) -> None:
        res = self.client.post("/api/sync")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("ok", data)
        self.assertIn("providers", data)


if __name__ == "__main__":
    unittest.main()
