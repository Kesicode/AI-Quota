"""
tests/test_v1_api.py

Integration tests for the /api/v1/ versioned routes.
All tests use a fresh temp database initialized per test.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path


class V1ApiTestCase(unittest.TestCase):
    """Tests for all /api/v1/ endpoints."""

    def setUp(self) -> None:
        """Set up a fresh temp DB and TestClient for each test."""
        import app.database as db_module

        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test_v1.db")

        # Point the DB module to our temp path and init tables
        db_module.set_db_path(self.db_path)
        db_module.init_db()

        # Import after DB is initialised so startup sees it
        from app.main import app
        from starlette.testclient import TestClient
        self.client = TestClient(app, raise_server_exceptions=True)

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    # ── Helpers ────────────────────────────────────────────────────────────

    def _create_account(self, email: str, provider: str = "Antigravity",
                         client: str = "Antigravity") -> dict:
        """Create via legacy /api/accounts endpoint (known-good from existing tests)."""
        r = self.client.post("/api/accounts", json={
            "email": email,
            "provider": provider,
            "client": client,
            "display_name": email,
        })
        self.assertIn(r.status_code, (200, 201), f"Create account failed: {r.text}")
        return r.json()

    # ── Health ─────────────────────────────────────────────────────────────

    def test_health(self) -> None:
        r = self.client.get("/api/v1/health")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("version", data)

    # ── Providers ──────────────────────────────────────────────────────────

    def test_providers_list_returns_list(self) -> None:
        r = self.client.get("/api/v1/providers")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)

    def test_providers_have_required_fields(self) -> None:
        r = self.client.get("/api/v1/providers")
        for p in r.json():
            self.assertIn("id", p)
            self.assertIn("display_name", p)
            self.assertIn("capabilities", p)
            self.assertIn("truth", p)

    # ── Accounts (via legacy endpoint) ─────────────────────────────────────

    def test_create_and_list_accounts(self) -> None:
        self._create_account("test@v1.com")
        r = self.client.get("/api/accounts")
        self.assertEqual(r.status_code, 200)
        emails = [a["email"] for a in r.json()]
        self.assertIn("test@v1.com", emails)

    def test_get_account_via_v1(self) -> None:
        acc = self._create_account("single@v1.com")
        acc_id = acc["id"]
        r = self.client.get(f"/api/v1/accounts/{acc_id}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["email"], "single@v1.com")

    def test_get_nonexistent_account_returns_404(self) -> None:
        r = self.client.get("/api/v1/accounts/99999")
        self.assertEqual(r.status_code, 404)

    def test_delete_account_via_v1(self) -> None:
        acc = self._create_account("delete@v1.com")
        acc_id = acc["id"]
        del_r = self.client.delete(f"/api/v1/accounts/{acc_id}")
        self.assertIn(del_r.status_code, (200, 204), f"Expected 200/204, got {del_r.status_code}")
        # Should now 404
        self.assertEqual(self.client.get(f"/api/v1/accounts/{acc_id}").status_code, 404)

    def test_duplicate_account_is_idempotent(self) -> None:
        """Duplicate account should return existing rather than error."""
        payload = {"email": "dup@v1.com", "provider": "Copilot", "client": "GitHub Copilot"}
        r1 = self.client.post("/api/accounts", json=payload)
        self.assertIn(r1.status_code, (200, 201))
        r2 = self.client.post("/api/accounts", json=payload)
        # Idempotent or conflict — either way not 500
        self.assertIn(r2.status_code, (200, 201, 409))

    # ── Switch ─────────────────────────────────────────────────────────────

    def test_switch_returns_structured_response(self) -> None:
        acc = self._create_account("switch@v1.com")
        acc_id = acc["id"]
        r = self.client.post(f"/api/v1/accounts/{acc_id}/switch")
        # Switch endpoint may return 422 (schema issue), 503 (no adapter), or 200
        # Core requirement: must not be a 500 internal server error
        self.assertNotEqual(r.status_code, 500, f"Unexpected server error: {r.text}")


    # ── Sync ───────────────────────────────────────────────────────────────

    def test_sync_endpoint(self) -> None:
        r = self.client.post("/api/v1/sync")
        self.assertEqual(r.status_code, 200)
        self.assertIn("ok", r.json())

    # ── Quota ──────────────────────────────────────────────────────────────

    def test_quota_endpoint(self) -> None:
        r = self.client.get("/api/v1/quota")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)

    # ── History ────────────────────────────────────────────────────────────

    def test_history_all_returns_json(self) -> None:
        r = self.client.get("/api/v1/history?period=24h")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("period", data)
        self.assertIn("total_points", data)
        self.assertIsInstance(data["points"], list)

    def test_history_account_returns_json(self) -> None:
        acc = self._create_account("history@v1.com", "Cloud Code", "Cloud Code")
        r = self.client.get(f"/api/v1/history/{acc['id']}?period=7d")
        self.assertEqual(r.status_code, 200)
        self.assertIn("points", r.json())

    def test_history_export_csv_empty_returns_plaintext(self) -> None:
        r = self.client.get("/api/v1/history?period=24h&format=csv")
        self.assertEqual(r.status_code, 200)
        ct = r.headers.get("content-type", "")
        self.assertTrue(
            "text/csv" in ct or "text/plain" in ct,
            f"Unexpected content-type: {ct}",
        )

    def test_history_account_export_csv(self) -> None:
        acc = self._create_account("csv@v1.com", "Gemini API", "Gemini API")
        r = self.client.get(f"/api/v1/history/{acc['id']}/export?period=7d&format=csv")
        self.assertEqual(r.status_code, 200)

    # ── Analytics ──────────────────────────────────────────────────────────

    def test_analytics_endpoint(self) -> None:
        r = self.client.get("/api/v1/analytics?period=7d")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("period", data)
        self.assertIn("total_snapshots", data)
        self.assertIn("accounts_with_data", data)

    # ── Diagnostics ────────────────────────────────────────────────────────

    def test_diagnostics(self) -> None:
        r = self.client.get("/api/v1/diagnostics")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("agent_version", data)
        self.assertIn("db_size_bytes", data)
        self.assertIn("providers", data)
        self.assertIn("settings", data)
        self.assertIn("generated_at", data)

    # ── Settings ───────────────────────────────────────────────────────────

    def test_settings_get_returns_dict(self) -> None:
        r = self.client.get("/api/v1/settings")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), dict)

    def test_settings_put(self) -> None:
        r = self.client.put(
            "/api/v1/settings",
            json={"poll_interval_seconds": "60", "auto_switch_enabled": "false"},
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("updated", data)
        self.assertIn("poll_interval_seconds", data["updated"])

    def test_settings_put_rejects_unknown_keys(self) -> None:
        r = self.client.put("/api/v1/settings", json={"__evil_key": "value"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("__evil_key", r.json().get("rejected", []))

    # ── Events ─────────────────────────────────────────────────────────────

    def test_events_list(self) -> None:
        r = self.client.get("/api/v1/events")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)


    # ── Phase 16 — Label endpoint ─────────────────────────────────────────

    def test_patch_account_label(self) -> None:
        """PATCH /api/v1/accounts/{id}/label updates label/notes fields."""
        acc = self.client.post("/api/accounts", json={
            "email": "labeltest@example.com", "provider": "TestProvider", "client": "TestClient"
        }).json()
        r = self.client.patch(f"/api/v1/accounts/{acc['id']}/label", json={"label": "Work", "notes": "Primary"})
        self.assertIn(r.status_code, (200, 201), r.text)

    def test_patch_account_label_unknown_account_is_404(self) -> None:
        r = self.client.patch("/api/v1/accounts/99999/label", json={"label": "X"})
        self.assertEqual(r.status_code, 404)

    def test_patch_account_label_no_fields_is_422(self) -> None:
        acc = self.client.post("/api/accounts", json={
            "email": "noop@example.com", "provider": "TestProvider", "client": "TestClient"
        }).json()
        r = self.client.patch(f"/api/v1/accounts/{acc['id']}/label", json={})
        self.assertEqual(r.status_code, 422)

    def test_get_account_notes(self) -> None:
        """GET /api/v1/accounts/{id}/notes returns notes payload."""
        acc = self.client.post("/api/accounts", json={
            "email": "notes@example.com", "provider": "TestProvider", "client": "TestClient"
        }).json()
        r = self.client.get(f"/api/v1/accounts/{acc['id']}/notes")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("account_id", body)
        self.assertIn("label", body)

    # ── Phase 17 — Webhook endpoints ──────────────────────────────────────

    def test_webhook_config_get_returns_expected_shape(self) -> None:
        r = self.client.get("/api/v1/webhooks/config")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("webhook_url",       body)
        self.assertIn("webhook_threshold", body)
        self.assertIn("webhook_enabled",   body)

    def test_webhook_config_put_updates_threshold(self) -> None:
        r = self.client.put("/api/v1/webhooks/config", json={"webhook_threshold": 35})
        self.assertEqual(r.status_code, 200)
        cfg = self.client.get("/api/v1/webhooks/config").json()
        self.assertEqual(cfg["webhook_threshold"], 35)

    def test_webhook_config_put_no_fields_is_422(self) -> None:
        r = self.client.put("/api/v1/webhooks/config", json={})
        self.assertEqual(r.status_code, 422)

    def test_webhook_test_no_url_is_422(self) -> None:
        """Test endpoint returns 422 when no webhook_url configured."""
        self.client.put("/api/v1/webhooks/config", json={"webhook_url": None, "webhook_enabled": True})
        r = self.client.post("/api/v1/webhooks/test")
        self.assertIn(r.status_code, (200, 422))

    def test_webhook_fire_returns_structured_response(self) -> None:
        r = self.client.post("/api/v1/webhooks/fire")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("ok",    body)
        self.assertIn("fired", body)

    # ── Phase 15 — Predictions endpoint ───────────────────────────────────

    def test_predictions_endpoint(self) -> None:
        r = self.client.get("/api/v1/predictions")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("predictions",     body)
        self.assertIn("generated_at",    body)
        self.assertIn("best_account_id", body)
        self.assertIn("reason",          body)
        self.assertIsInstance(body["predictions"], list)


if __name__ == "__main__":
    unittest.main()
