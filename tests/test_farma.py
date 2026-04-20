import unittest
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from Farma import (
    available_substances,
    concentration_at_time,
    concentration_for_substance,
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

    def test_concentration_for_substance_uses_profile_parameters(self) -> None:
        profile = get_substance_profile("lexapro")
        expected = concentration_at_time(
            dose=10.0,
            ka=profile["ka_per_hour"],
            ke=profile["ke_per_hour"],
            vd=profile["vd_l_per_kg"] * 70.0,
            t=6.0,
            bioavailability=profile["bioavailability"],
        )
        actual = concentration_for_substance("lexapro", dose=10.0, t=6.0)

        self.assertAlmostEqual(actual, expected, places=12)

    def test_multiple_doses_require_tau(self) -> None:
        with self.assertRaises(ValueError):
            concentration_for_substance("piracetam", dose=800.0, t=12.0, n_doses=3)


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

    def test_put_regimen_persists_valid_entries(self) -> None:
        payload = [
            {
                "id": "lexapro-test",
                "substance": "escitalopram",
                "dose_mg": 20,
                "times": ["08:30"],
                "days_of_week": [1, 3, 5],
                "active": True,
                "start_date": "2026-04-01",
                "end_date": None,
                "color": "#123456",
            }
        ]

        response = self.client.put("/regimen", json=payload)

        self.assertEqual(response.status_code, 200)
        saved = response.json()
        self.assertEqual(saved[0]["substance"], "lexapro")
        self.assertEqual(saved[0]["times"], ["08:30"])
        self.assertEqual(self.client.get("/regimen").json(), saved)

    def test_put_regimen_rejects_invalid_values(self) -> None:
        payload = [
            {
                "id": "bad",
                "substance": "lexapro",
                "dose_mg": 0,
                "times": ["28:99"],
                "days_of_week": [9],
                "active": True,
                "start_date": None,
                "end_date": None,
                "color": None,
            }
        ]

        response = self.client.put("/regimen", json=payload)

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
