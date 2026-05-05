import json
import unittest
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch

import Forecast.router as forecast_router


def _build_snapshots() -> List[Dict[str, Any]]:
    snapshots: List[Dict[str, Any]] = []
    base_values = [
        ("2026-04-01", 6.5, 55.0),
        ("2026-04-02", 7.0, 54.0),
        ("2026-04-03", 6.0, 56.0),
        ("2026-04-04", 5.5, 60.0),
        ("2026-04-05", 7.5, 53.0),
        ("2026-04-06", 6.8, 57.0),
        ("2026-04-07", 7.2, 52.0),
    ]
    for date_str, sleep_hours, resting_hr in base_values:
        snapshots.append(
            {
                "date": date_str,
                "values": {
                    "sleepTotalHours": sleep_hours,
                    "hrvSdnn": 110.0,
                    "restingHeartRate": resting_hr,
                    "activeEnergyKcal": 500.0,
                    "exerciseMinutes": 45.0,
                    "valence": 0.2,
                },
            }
        )
    return snapshots


def _build_payload() -> Dict[str, Any]:
    rolling_summary = {
        "window_days": 7,
        "sample_days": 7,
        "means": {
            "sleepTotalHours": 6.5,
            "hrvSdnn": 110.0,
            "restingHeartRate": 55.0,
            "activeEnergyKcal": 500.0,
            "exerciseMinutes": 45.0,
            "valence": 0.2,
        },
    }
    return {
        "snapshots": _build_snapshots(),
        "horizon": 5,
        "valid_real_days": 10,
        "rolling_summary": rolling_summary,
    }


class ForecastEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        forecast_router._cache.clear()
        app = FastAPI()
        app.include_router(forecast_router.router, prefix="/forecast")
        self.client = TestClient(app)

    @patch("Forecast.router._call_model")
    def test_returns_clamped_and_monotonic_confidence(self, mock_call_model: Any) -> None:
        mock_payload = {
            "forecasts": [
                {"date": "2026-04-08", "values": {"sleepTotalHours": 20, "hrvSdnn": 400, "restingHeartRate": 10, "activeEnergyKcal": 12000, "exerciseMinutes": 2000, "valence": 2}, "confidence": 0.95, "rationale": "dia 1"},
                {"date": "2026-04-09", "values": {"sleepTotalHours": 15, "hrvSdnn": 300, "restingHeartRate": 25, "activeEnergyKcal": 9000, "exerciseMinutes": 1700, "valence": -2}, "confidence": 0.8, "rationale": "dia 2"},
                {"date": "2026-04-10", "values": {"sleepTotalHours": 8, "hrvSdnn": 120, "restingHeartRate": 70, "activeEnergyKcal": 700, "exerciseMinutes": 90, "valence": 0.4}, "confidence": 0.6, "rationale": "dia 3"},
                {"date": "2026-04-11", "values": {"sleepTotalHours": 7, "hrvSdnn": 100, "restingHeartRate": 65, "activeEnergyKcal": 600, "exerciseMinutes": 60, "valence": 0.1}, "confidence": 0.5, "rationale": "dia 4"},
                {"date": "2026-04-12", "values": {"sleepTotalHours": 6, "hrvSdnn": 90, "restingHeartRate": 62, "activeEnergyKcal": 550, "exerciseMinutes": 50, "valence": -0.1}, "confidence": 0.4, "rationale": "dia 5"},
            ],
            "signals": [{"field": "valence", "observation": "Tendência estável"}],
        }
        mock_call_model.return_value = json.dumps(mock_payload)

        response = self.client.post("/forecast", json=_build_payload())

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNone(data["meta"]["error"])
        snapshots = data["forecasted_snapshots"]
        self.assertEqual(len(snapshots), 5)

        confidences: List[float] = []
        for snap in snapshots:
            self.assertLessEqual(snap["forecastConfidence"], 0.4)
            confidences.append(snap["forecastConfidence"])
            health = snap["health"]
            if health:
                self.assertGreaterEqual(health["sleepTotalHours"], 0.0)
                self.assertLessEqual(health["sleepTotalHours"], 16.0)
                self.assertGreaterEqual(health["hrvSdnn"], 0.0)
                self.assertLessEqual(health["hrvSdnn"], 250.0)
                self.assertGreaterEqual(health["restingHeartRate"], 30.0)
                self.assertLessEqual(health["restingHeartRate"], 220.0)
                self.assertGreaterEqual(health["activeEnergyKcal"], 0.0)
                self.assertLessEqual(health["activeEnergyKcal"], 8000.0)
                self.assertGreaterEqual(health["exerciseMinutes"], 0.0)
                self.assertLessEqual(health["exerciseMinutes"], 1440.0)
            mood = snap["mood"]
            if mood:
                self.assertGreaterEqual(mood["valence"], -1.0)
                self.assertLessEqual(mood["valence"], 1.0)

        for index in range(1, len(confidences)):
            self.assertLessEqual(confidences[index], confidences[index - 1] + 1e-9)

    @patch("Forecast.router._call_model")
    def test_filters_out_of_window_dates_and_deduplicates(self, mock_call_model: Any) -> None:
        mock_payload = {
            "forecasts": [
                {"date": "2026-04-08", "values": {"sleepTotalHours": 6.5}, "confidence": 0.4, "rationale": "primeira"},
                {"date": "2026-04-08", "values": {"sleepTotalHours": 8.0}, "confidence": 0.3, "rationale": "duplicada"},
                {"date": "2026-04-09", "values": {"sleepTotalHours": 7.0}, "confidence": 0.35, "rationale": "segunda"},
                {"date": "2026-04-20", "values": {"sleepTotalHours": 9.0}, "confidence": 0.3, "rationale": "fora janela"},
            ],
            "signals": [],
        }
        mock_call_model.return_value = json.dumps(mock_payload)

        response = self.client.post("/forecast", json=_build_payload())

        self.assertEqual(response.status_code, 200)
        data = response.json()
        snapshots = data["forecasted_snapshots"]
        self.assertEqual([snapshot["date"] for snapshot in snapshots], ["2026-04-08", "2026-04-09"])
        self.assertEqual(snapshots[0]["health"]["sleepTotalHours"], 6.5)

    def test_invalid_horizon_returns_400(self) -> None:
        payload = _build_payload()
        payload["horizon"] = 3

        response = self.client.post("/forecast", json=payload)

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIsNotNone(data["meta"]["error"])
        self.assertEqual(data["forecasted_snapshots"], [])

    @patch("Forecast.router._call_model")
    def test_provider_failure_returns_502(self, mock_call_model: Any) -> None:
        mock_call_model.side_effect = RuntimeError("provider offline")

        response = self.client.post("/forecast", json=_build_payload())

        self.assertEqual(response.status_code, 502)
        data = response.json()
        self.assertIn("RuntimeError", data["meta"]["error"])
        self.assertEqual(data["forecasted_snapshots"], [])


if __name__ == "__main__":
    unittest.main()
