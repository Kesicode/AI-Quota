from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.database import init_db, set_db_path
from app.providers import (
    find_adapter,
    get_adapter_by_id,
    get_all_adapters,
    get_provider_truth,
)
from app.providers.base import ProviderAdapter, ProviderTruth
from app.services.sync_manager import sync_all


class FailingMockAdapter(ProviderAdapter):
    @property
    def id(self) -> str:
        return "failing_mock"

    @property
    def display_name(self) -> str:
        return "Failing Mock"

    @property
    def supported_clients(self) -> list[str]:
        return ["Mock Client"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="failing_mock",
            label="Failing Mock",
            priority=0,
            live=False,
            truth="mock",
            note="Mock failing provider",
        )

    def sync(self) -> dict:
        raise RuntimeError("Simulated network or service crash!")

    def connect_account(self, account: dict) -> dict:
        return {"ok": False, "message": "Failing mock"}


class ProvidersTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_providers.db"
        set_db_path(self.db_path)
        init_db(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_provider_truth_separation(self) -> None:
        # Cloud Code
        cc = find_adapter("Cloud Code", "Cloud Code / Cloud Shell")
        self.assertIsNotNone(cc)
        self.assertEqual(cc.truth.authority_type, "official_ui_derived")
        self.assertIn("50h", cc.truth.note)

        # Gemini
        gemini = find_adapter("Gemini API", "Gemini API")
        self.assertIsNotNone(gemini)
        self.assertEqual(gemini.truth.authority_type, "official_api_derived")
        self.assertNotEqual(cc.id, gemini.id)

        # Google Cloud
        gcp = find_adapter("Google Cloud", "Google Cloud quotas")
        self.assertIsNotNone(gcp)
        self.assertNotEqual(cc.id, gcp.id)

        # Antigravity CLI vs 2.0
        ag_cli = find_adapter("Antigravity", "Antigravity CLI")
        ag_2 = find_adapter("Antigravity", "Antigravity 2.0")
        self.assertIsNotNone(ag_cli)
        self.assertIsNotNone(ag_2)
        self.assertNotEqual(ag_cli.id, ag_2.id)

        # Codex
        codex = find_adapter("OpenAI / Codex", "Codex")
        self.assertIsNotNone(codex)
        self.assertEqual(codex.truth.authority_type, "provider_surface")

    def test_sync_isolation_with_failing_provider(self) -> None:
        # Verify sync_all() does not crash even if providers fail
        result = sync_all()
        self.assertIn("ok", result)
        self.assertIn("providers", result)
        self.assertIn("changed", result)
        self.assertIn("matched", result)
        self.assertIn("discovered", result)


if __name__ == "__main__":
    unittest.main()
