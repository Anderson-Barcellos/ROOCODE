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


if __name__ == "__main__":
    unittest.main()
