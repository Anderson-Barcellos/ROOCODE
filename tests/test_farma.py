import json
import unittest
import tempfile
from datetime import datetime, timedelta, timezone
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


class DoseEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_dose_path = farma_router.DOSE_LOG_PATH
        farma_router.DOSE_LOG_PATH = Path(self.temp_dir.name) / "dose_log.json"
        app = FastAPI()
        app.include_router(farma_router.router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        farma_router.DOSE_LOG_PATH = self.original_dose_path
        self.temp_dir.cleanup()

    def test_log_dose_rejects_invalid_timestamp(self) -> None:
        response = self.client.post(
            "/doses",
            json={
                "substance": "lexapro",
                "dose_mg": 40,
                "taken_at": "not-an-iso-timestamp",
                "note": "",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("taken_at", response.json()["detail"])

    def test_log_dose_rejects_non_positive_dose(self) -> None:
        response = self.client.post(
            "/doses",
            json={
                "substance": "lexapro",
                "dose_mg": 0,
                "taken_at": datetime.now(timezone.utc).isoformat(),
                "note": "",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("dose_mg", response.json()["detail"])

    def test_log_dose_accepts_valid_payload(self) -> None:
        taken_at = datetime.now(timezone.utc).isoformat()
        response = self.client.post(
            "/doses",
            json={
                "substance": "lexapro",
                "dose_mg": 40,
                "taken_at": taken_at,
                "note": "ok",
            },
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["substance"], "lexapro")
        self.assertEqual(payload["dose_mg"], 40)
        self.assertEqual(payload["taken_at"], taken_at)
        self.assertTrue(farma_router.DOSE_LOG_PATH.exists())


class ConcentrationSeriesEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_dose_path = farma_router.DOSE_LOG_PATH
        self.original_regimen_path = farma_router.REGIMEN_CONFIG_PATH
        farma_router.DOSE_LOG_PATH = Path(self.temp_dir.name) / "dose_log.json"
        farma_router.REGIMEN_CONFIG_PATH = Path(self.temp_dir.name) / "regimen.json"
        app = FastAPI()
        app.include_router(farma_router.router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        farma_router.DOSE_LOG_PATH = self.original_dose_path
        farma_router.REGIMEN_CONFIG_PATH = self.original_regimen_path
        self.temp_dir.cleanup()

    def _seed_doses(self, doses: list[dict]) -> None:
        farma_router.DOSE_LOG_PATH.write_text(
            json.dumps(doses, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def test_returns_daily_series_using_logged_doses(self) -> None:
        # Seed: 7 daily venvanse doses ending today
        today = datetime.now(timezone.utc).date()
        from_date = today - timedelta(days=6)
        doses = []
        for offset in range(7):
            dose_day = from_date + timedelta(days=offset)
            doses.append({
                "id": f"d{offset}",
                "substance": "venvanse",
                "dose_mg": 200.0,
                "taken_at": datetime(
                    dose_day.year, dose_day.month, dose_day.day, 7, 0,
                    tzinfo=timezone.utc,
                ).isoformat(),
                "note": "",
                "logged_at": datetime.now(timezone.utc).isoformat(),
            })
        self._seed_doses(doses)

        response = self.client.get(
            "/concentration-series",
            params={
                "substance": "venvanse",
                "from": from_date.isoformat(),
                "to": today.isoformat(),
                "weight_kg": 70.0,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["source"], "dose_log")
        self.assertEqual(payload["substance"], "venvanse")
        self.assertEqual(len(payload["series"]), 7)
        # Cmax must be > Cmin > 0 once at steady state (last day)
        last = payload["series"][-1]
        self.assertGreater(last["cmax_est"], last["cmin_est"])
        self.assertGreater(last["cmin_est"], 0.0)
        self.assertGreater(last["auc_est"], 0.0)
        # Unit check: cmax_est must be in ng/mL (×1000 from mg/L source).
        # Venvanse 200mg/day SS for weight 70kg should yield Cmax ~100-200 ng/mL,
        # not ~0.1-0.2 mg/L. Anything < 5 here means the ng/mL conversion was lost.
        self.assertGreater(
            last["cmax_est"], 5.0,
            "cmax_est should be in ng/mL (×1000 mg/L). Got value too small → conversion missing.",
        )

    def test_falls_back_to_regimen_when_dose_log_empty(self) -> None:
        # No doses logged; regimen will autoload defaults including venvanse
        today = datetime.now(timezone.utc).date()
        from_date = today - timedelta(days=4)

        response = self.client.get(
            "/concentration-series",
            params={
                "substance": "venvanse",
                "from": from_date.isoformat(),
                "to": today.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["source"], "regimen_fallback")
        self.assertEqual(len(payload["series"]), 5)
        self.assertGreater(payload["events_count"], 0)

    def test_rejects_range_exceeding_5_years(self) -> None:
        response = self.client.get(
            "/concentration-series",
            params={
                "substance": "venvanse",
                "from": "2020-01-01",
                "to": "2026-01-01",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("5 anos", response.json()["detail"])

    def test_rejects_unknown_substance(self) -> None:
        response = self.client.get(
            "/concentration-series",
            params={
                "substance": "xpto-fake",
                "from": "2026-04-01",
                "to": "2026-04-07",
            },
        )

        self.assertEqual(response.status_code, 404)

    def test_regimen_synthetic_doses_use_user_timezone(self) -> None:
        """Regimen times são horários locais (BRT) — devem ser interpretados em
        America/Sao_Paulo, não UTC. Antes do fix, "07:00" virava 07:00 UTC
        (04:00 BRT), deslocando todos os picos 3h pra trás."""
        from zoneinfo import ZoneInfo

        # Seed regimen com lexapro às 07:00 (hora local)
        regimen_data = [{
            "id": "lex-test",
            "substance": "lexapro",
            "dose_mg": 40.0,
            "times": ["07:00"],
            "days_of_week": [0, 1, 2, 3, 4, 5, 6],
            "active": True,
            "start_date": None,
            "end_date": None,
            "color": "#0f766e",
        }]
        farma_router.REGIMEN_CONFIG_PATH.write_text(
            json.dumps(regimen_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        range_start = datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc)
        range_end = datetime(2026, 4, 1, 23, 59, 59, tzinfo=timezone.utc)
        events = farma_router._expand_regimen_to_doses(
            regimen_data, "lexapro", range_start, range_end
        )

        self.assertEqual(len(events), 1, "Deve gerar 1 evento sintético no dia")
        taken_dt, _ = events[0]

        # Esperado: 07:00 em America/Sao_Paulo = 10:00 UTC.
        # Bug antigo geraria 07:00 UTC = 04:00 BRT.
        self.assertEqual(taken_dt.hour, 7, "Hora local (BRT) deve ser 07:00")
        self.assertEqual(
            taken_dt.astimezone(timezone.utc).hour, 10,
            "07:00 BRT = 10:00 UTC. Se virou 07:00 UTC, o fix de TZ regrediu.",
        )
        self.assertEqual(
            taken_dt.tzinfo, ZoneInfo("America/Sao_Paulo"),
            "tzinfo deve ser America/Sao_Paulo, não UTC",
        )


if __name__ == "__main__":
    unittest.main()
