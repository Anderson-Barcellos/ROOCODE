import unittest
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from Farma import (
    available_substances,
    get_substance_profile,
    load_medication_database,
)
import Farma.router as farma_router


class FarmaTests(unittest.TestCase):
    def test_database_contains_requested_profiles(self) -> None:
        database = load_medication_database()
        substances = database["substances"]

        self.assertIn("venvanse", substances)
        self.assertIn("lexapro", substances)
        self.assertIn("lamictal", substances)
        self.assertIn("bacopa_monnieri", substances)
        self.assertIn("magnesio_treonato", substances)
        self.assertIn("vitamina_d3_10000_ui", substances)
        self.assertIn("omega_3", substances)
        self.assertIn("piracetam", substances)

    def test_alias_lookup_resolves_expected_profiles(self) -> None:
        self.assertEqual(get_substance_profile("vyvanse")["id"], "venvanse")
        self.assertEqual(get_substance_profile("a 3")["id"], "omega_3")
        self.assertIn("lexapro", available_substances())


class RegimenEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_path = farma_router.REGIMEN_CONFIG_PATH
        farma_router.REGIMEN_CONFIG_PATH = Path(self.temp_dir.name) / "regimen.json"
        app = FastAPI()
        app.include_router(farma_router.router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        farma_router.REGIMEN_CONFIG_PATH = self.original_path
        self.temp_dir.cleanup()

    def test_get_regimen_creates_defaults_when_missing(self) -> None:
        response = self.client.get("/regimen")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(farma_router.REGIMEN_CONFIG_PATH.exists())
        self.assertEqual([item["substance"] for item in payload], ["lexapro", "venvanse", "lamictal"])
        self.assertEqual(payload[1]["days_of_week"], [1, 2, 3, 4, 5])


if __name__ == "__main__":
    unittest.main()
