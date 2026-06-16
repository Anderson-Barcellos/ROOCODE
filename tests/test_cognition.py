import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import Cognition.router as cognition_router
import Cognition.storage as cognition_storage


def _now_local(hour: int = 12, minute: int = 15) -> str:
    return datetime.now(timezone.utc).astimezone(cognition_router.APP_TIMEZONE).replace(
        hour=hour,
        minute=minute,
        second=0,
        microsecond=0,
    ).astimezone(timezone.utc).isoformat()


def _session_payload(started_at: str | None = None) -> dict[str, Any]:
    started_at = started_at or _now_local()
    span_kind = cognition_router._span_kind_for_today()
    return {
        "started_at": started_at,
        "plan": {
            "rotating_type": "A",
            "span_kind": span_kind,
            "fluency_mode": "phonemic",
            "fluency_criterion": "F",
            "reading_passage": None,
            "reading_idea_units": [],
            "reading_source_theme": None,
        },
        "context": {
            "sleep_hours": 6.5,
            "caffeine_taken": True,
            "caffeine_amount_mg": 120,
            "vyvanse_taken_at": "08:15",
            "lunch_completed": False,
        },
        "vas": {
            "mood": 61,
            "energy": 58,
            "anxiety": 29,
            "rested": 47,
        },
        "pvt": {
            "duration_ms": 180000,
            "trials": [
                {"stimulus_delay_ms": 2200, "false_starts": 0, "reaction_time_ms": 280},
                {"stimulus_delay_ms": 3100, "false_starts": 1, "reaction_time_ms": 520},
                {"stimulus_delay_ms": 2800, "false_starts": 0, "reaction_time_ms": 305},
            ],
        },
        "span": {
            "kind": span_kind,
            "attempts": [
                {"direction": "forward", "length": 3, "sequence": [3, 7, 2], "response": [3, 7, 2], "correct": True},
                {"direction": "forward", "length": 4, "sequence": [6, 1, 5, 8], "response": [6, 1, 5, 8], "correct": True},
                {"direction": "backward", "length": 3, "sequence": [2, 9, 4], "response": [4, 9, 2], "correct": True},
            ],
        },
        "fluency": {
            "words": ["faca", "fada", "faro", "fivela", "feno"],
        },
        "reading": None,
        "flanker": None,
    }


class CognitionEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_path = cognition_storage.SESSIONS_PATH
        cognition_storage.SESSIONS_PATH = Path(self.temp_dir.name) / "sessions.json"
        app = FastAPI()
        app.include_router(cognition_router.router, prefix="/cognition")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        cognition_storage.SESSIONS_PATH = self.original_path
        self.temp_dir.cleanup()

    def test_status_empty_exposes_first_plan(self) -> None:
        response = self.client.get("/cognition/status")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["baseline_complete"])
        self.assertEqual(payload["baseline_session_count"], 0)
        self.assertEqual(payload["session_count"], 0)
        self.assertEqual(payload["next_plan"]["rotating_type"], "A")
        self.assertEqual(payload["next_plan"]["span_kind"], cognition_router._span_kind_for_today())

    @patch("Cognition.router.score_verbal_fluency")
    @patch("Cognition.router.generate_reading_passage")
    def test_complete_fluency_session_persists_and_advances_rotation(
        self,
        mock_generate_reading: Any,
        mock_score_fluency: Any,
    ) -> None:
        mock_score_fluency.return_value = {
            "valid_count": 5,
            "invalid": [],
            "repeats": [],
            "clusters": [{"members": ["faca", "fada"]}, {"members": ["faro", "feno"]}],
            "mean_cluster_size": 2.0,
            "switch_count": 1,
        }
        mock_generate_reading.return_value = {
            "passage": "Texto curto de teste.",
            "idea_units": ["Ideia 1", "Ideia 2"],
            "theme_tag": "rio urbano",
        }

        response = self.client.post("/cognition/complete", json=_session_payload())
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["session"]["rotating_type"], "A")
        self.assertEqual(payload["session"]["fluency"]["valid_count"], 5)
        self.assertEqual(payload["session"]["pvt"]["lapses_count"], 1)
        self.assertTrue(cognition_storage.SESSIONS_PATH.exists())

        status = self.client.get("/cognition/status")
        self.assertEqual(status.status_code, 200)
        status_payload = status.json()
        self.assertIsNotNone(status_payload["today_session"])
        self.assertEqual(len(status_payload["timeline"]), 1)
        self.assertIsNone(status_payload["next_plan"])

    @patch("Cognition.router.generate_reading_passage")
    def test_materials_advance_to_reading_after_prior_a_session(self, mock_generate_reading: Any) -> None:
        yesterday = (
            datetime.now(timezone.utc)
            .astimezone(cognition_router.APP_TIMEZONE)
            .replace(hour=12, minute=15, second=0, microsecond=0)
            - timedelta(days=1)
        ).astimezone(timezone.utc).isoformat()
        cognition_storage.save_sessions(
            [
                {
                    "id": "seed-a",
                    "user_id": "default",
                    "started_at": yesterday,
                    "rotating_type": "A",
                    "context": {},
                    "vas": {"mood": 50, "energy": 50, "anxiety": 20},
                    "pvt": {},
                    "span": {"kind": "digit", "primary_score": 4},
                    "fluency": {"type": "phonemic", "criterion": "F", "valid_count": 10},
                    "reading": None,
                    "flanker": None,
                    "baseline_phase": True,
                    "created_at": yesterday,
                }
            ]
        )
        mock_generate_reading.return_value = {
            "passage": "Um texto inédito sobre uma pequena travessia de barco no fim da tarde.",
            "idea_units": ["Havia um barco", "A travessia ocorreu ao entardecer"],
            "theme_tag": "travessia de barco",
        }

        response = self.client.post("/cognition/materials")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["rotating_type"], "B")
        self.assertIn("reading", payload)
        self.assertEqual(payload["reading"]["source_theme"], "travessia de barco")

    @patch("Cognition.router.score_verbal_fluency")
    def test_duplicate_same_day_session_is_blocked(self, mock_score_fluency: Any) -> None:
        mock_score_fluency.return_value = {
            "valid_count": 5,
            "invalid": [],
            "repeats": [],
            "clusters": [],
            "mean_cluster_size": 1.0,
            "switch_count": 0,
        }

        first = self.client.post("/cognition/complete", json=_session_payload())
        self.assertEqual(first.status_code, 200)
        second = self.client.post("/cognition/complete", json=_session_payload())
        self.assertEqual(second.status_code, 409)


class CognitionPKEnrichmentTests(unittest.TestCase):
    def test_concentration_deterministic(self) -> None:
        from Cognition import pk_enrichment
        from Farma.math import (
            concentration_at_time,
            get_substance_profile,
            _profile_volume_of_distribution,
        )
        from Profile import DEFAULT_BODY_WEIGHT_KG

        dose_at = datetime(2026, 4, 20, 12, 0, tzinfo=timezone.utc)
        with patch.object(
            pk_enrichment,
            "_load_venvanse_doses_from_log",
            return_value=[(dose_at, 210.0)],
        ):
            result = pk_enrichment.enrich_session_pk(
                "2026-04-20T15:00:00+00:00", {"vyvanse_taken_at": None}
            )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["dose_source"], "dose_log")
        self.assertEqual(result["hours_since_dose"], 3.0)

        profile = get_substance_profile("venvanse")
        vd = _profile_volume_of_distribution(profile, DEFAULT_BODY_WEIGHT_KG)
        expected = (
            concentration_at_time(
                210.0, profile["ka_per_hour"], profile["ke_per_hour"], vd, 3.0,
                bioavailability=profile.get("bioavailability", 1.0),
            )
            * 1000.0
        )
        self.assertAlmostEqual(result["venvanse_ng_ml"], round(expected, 4), places=4)

    def test_pk_context_null_when_no_dose(self) -> None:
        from Cognition import pk_enrichment

        with patch.object(pk_enrichment, "_load_venvanse_doses_from_log", return_value=[]):
            result = pk_enrichment.enrich_session_pk(
                "2026-04-20T15:00:00+00:00", {"vyvanse_taken_at": None}
            )
        self.assertIsNone(result)

    def test_fallback_hhmm_dose_source(self) -> None:
        from Cognition import pk_enrichment

        with patch.object(pk_enrichment, "_load_venvanse_doses_from_log", return_value=[]):
            # started_at 15:00 UTC = 12:00 BRT; dose "08:30" BRT = 3.5h antes
            result = pk_enrichment.enrich_session_pk(
                "2026-06-16T15:00:00+00:00", {"vyvanse_taken_at": "08:30"}
            )
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["dose_source"], "context_hhmm")
        self.assertAlmostEqual(result["hours_since_dose"], 3.5, places=3)
        self.assertEqual(result["dose_mg"], pk_enrichment.DEFAULT_REGIMEN_DOSE_MG)

    @patch("Cognition.router.score_verbal_fluency")
    @patch(
        "Cognition.router.enrich_session_pk",
        return_value={
            "venvanse_ng_ml": 42.5,
            "hours_since_dose": 3.0,
            "dose_mg": 210.0,
            "dose_source": "dose_log",
        },
    )
    def test_complete_session_persists_pk_context(
        self, _mock_pk: Any, mock_score_fluency: Any
    ) -> None:
        mock_score_fluency.return_value = {
            "valid_count": 5,
            "invalid": [],
            "repeats": [],
            "clusters": [],
            "mean_cluster_size": 1.0,
            "switch_count": 0,
        }
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        original_path = cognition_storage.SESSIONS_PATH
        cognition_storage.SESSIONS_PATH = Path(temp_dir.name) / "sessions.json"
        self.addCleanup(lambda: setattr(cognition_storage, "SESSIONS_PATH", original_path))
        app = FastAPI()
        app.include_router(cognition_router.router, prefix="/cognition")
        client = TestClient(app)

        response = client.post("/cognition/complete", json=_session_payload())
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["session"]["pk_context"]["venvanse_ng_ml"], 42.5)
        self.assertEqual(payload["session"]["scoring_model"], cognition_router.DEFAULT_CHAT_MODEL)
        self.assertEqual(payload["summary"]["venvanse_ng_ml"], 42.5)
        self.assertEqual(payload["summary"]["hours_since_dose"], 3.0)

    def test_old_session_without_pk_context_tolerates_chart_row(self) -> None:
        row = cognition_router._session_chart_row(
            {
                "id": "legacy",
                "started_at": "2026-04-01T15:00:00+00:00",
                "rotating_type": "C",
                "vas": {"mood": 50, "energy": 50, "anxiety": 20},
                "pvt": {"lapses_count": 1},
                "span": {"primary_score": 5},
                "flanker": {"interference_ms": 40.0},
            }
        )
        self.assertIsNone(row["venvanse_ng_ml"])
        self.assertIsNone(row["hours_since_dose"])


if __name__ == "__main__":
    unittest.main()
