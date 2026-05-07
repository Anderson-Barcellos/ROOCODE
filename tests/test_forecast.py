import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch

import Forecast.router as forecast_router
import Forecast.storage as forecast_storage


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
        # Isola persistência do storage pra não poluir Forecast/forecast_history.json real
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_history_path = forecast_storage.HISTORY_PATH
        forecast_storage.HISTORY_PATH = Path(self.temp_dir.name) / "history.json"
        app = FastAPI()
        app.include_router(forecast_router.router, prefix="/forecast")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        forecast_storage.HISTORY_PATH = self.original_history_path
        self.temp_dir.cleanup()

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


class ForecastSummaryEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(forecast_router.router, prefix="/forecast")
        self.client = TestClient(app)

    def test_summary_returns_field_trends_and_weekday_effect(self) -> None:
        response = self.client.post("/forecast/summary", json={"snapshots": _build_snapshots()})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("field_trends", data)
        self.assertIn("weekday_effect", data)
        self.assertEqual(data["context_days"], 7)
        self.assertEqual(data["context_range"]["from"], "2026-04-01")
        self.assertEqual(data["context_range"]["to"], "2026-04-07")

        sleep_trends = data["field_trends"]["sleepTotalHours"]
        self.assertIsNotNone(sleep_trends["mean_last7"])
        self.assertEqual(sleep_trends["available_days"], 7)
        # 7 dias = só last7, sem prev7
        self.assertIsNone(sleep_trends["mean_prev7"])
        self.assertIsNone(sleep_trends["delta_last7_vs_prev7"])

        weekday_sleep = data["weekday_effect"]["sleepTotalHours"]
        self.assertIsNotNone(weekday_sleep["weekday_mean"])
        self.assertIsNotNone(weekday_sleep["weekend_mean"])
        self.assertIsNotNone(weekday_sleep["weekend_minus_weekday"])

    def test_summary_rejects_empty_snapshots(self) -> None:
        response = self.client.post("/forecast/summary", json={"snapshots": []})
        self.assertEqual(response.status_code, 400)

    def test_summary_does_not_call_model(self) -> None:
        with patch("Forecast.router._call_model") as mock_call:
            response = self.client.post(
                "/forecast/summary", json={"snapshots": _build_snapshots()}
            )
            self.assertEqual(response.status_code, 200)
            mock_call.assert_not_called()


class ForecastStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_path = forecast_storage.HISTORY_PATH
        forecast_storage.HISTORY_PATH = Path(self.temp_dir.name) / "history.json"

    def tearDown(self) -> None:
        forecast_storage.HISTORY_PATH = self.original_path
        self.temp_dir.cleanup()

    def test_record_forecast_persists_each_field_per_target_date(self) -> None:
        forecasted = [
            {
                "date": "2026-04-08",
                "forecastConfidence": 0.42,
                "health": {
                    "sleepTotalHours": 7.2,
                    "hrvSdnn": 110.0,
                    "restingHeartRate": 55.0,
                },
                "mood": {"valence": 0.3},
            },
            {
                "date": "2026-04-09",
                "forecastConfidence": 0.4,
                "health": {"sleepTotalHours": 6.8, "hrvSdnn": 108.0},
                "mood": {"valence": None},
            },
        ]
        forecast_storage.record_forecast(forecasted, "2026-04-07T20:00:00+00:00")

        self.assertTrue(forecast_storage.HISTORY_PATH.exists())
        with forecast_storage.HISTORY_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertEqual(data["_schema_version"], forecast_storage.SCHEMA_VERSION)
        # Day 1: sleep + hrv + rhr + valence = 4. Day 2: sleep + hrv = 2 (valence None pulado). Total 6.
        self.assertEqual(len(data["entries"]), 6)
        fields_day_1 = {
            entry["field"] for entry in data["entries"] if entry["target_date"] == "2026-04-08"
        }
        self.assertSetEqual(
            fields_day_1, {"sleepTotalHours", "hrvSdnn", "restingHeartRate", "valence"}
        )

    def test_load_history_filters_by_days_back(self) -> None:
        today = datetime.now(timezone.utc).date()
        old_date = (today - timedelta(days=60)).isoformat()
        recent_date = (today - timedelta(days=5)).isoformat()
        forecasted_old = [{
            "date": old_date,
            "forecastConfidence": 0.4,
            "health": {"sleepTotalHours": 7.0},
        }]
        forecasted_recent = [{
            "date": recent_date,
            "forecastConfidence": 0.5,
            "health": {"sleepTotalHours": 7.5},
        }]
        forecast_storage.record_forecast(forecasted_old, "2026-01-01T00:00:00+00:00")
        forecast_storage.record_forecast(forecasted_recent, "2026-04-01T00:00:00+00:00")

        all_entries = forecast_storage.load_history(days_back=None)
        self.assertEqual(len(all_entries), 2)

        recent_only = forecast_storage.load_history(days_back=30)
        self.assertEqual(len(recent_only), 1)
        self.assertEqual(recent_only[0]["target_date"], recent_date)

    def test_compute_accuracy_returns_mape_per_field(self) -> None:
        history = [
            {"target_date": "2026-04-08", "field": "sleepTotalHours", "predicted": 7.0, "confidence": 0.4},
            {"target_date": "2026-04-09", "field": "sleepTotalHours", "predicted": 8.0, "confidence": 0.4},
            {"target_date": "2026-04-08", "field": "hrvSdnn", "predicted": 100.0, "confidence": 0.4},
        ]
        snapshots_real = [
            {"date": "2026-04-08", "health": {"sleepTotalHours": 7.5, "hrvSdnn": 90.0}},
            {"date": "2026-04-09", "health": {"sleepTotalHours": 7.0}},
        ]
        result = forecast_storage.compute_accuracy(snapshots_real, history, days_back=30)
        sleep_acc = result["accuracy_by_field"]["sleepTotalHours"]
        self.assertEqual(sleep_acc["n"], 2)
        # MAE: (|7-7.5| + |8-7|) / 2 = 0.75
        self.assertAlmostEqual(sleep_acc["mae"], 0.75, places=4)
        # MAPE: ((0.5/7.5) + (1.0/7.0)) / 2 * 100 ≈ 10.48
        self.assertAlmostEqual(sleep_acc["mape"], 10.48, places=1)
        self.assertEqual(result["window_days"], 30)
        self.assertIsNotNone(result["warning"])  # history_size = 3 < 14

    def test_compute_accuracy_handles_empty_history(self) -> None:
        result = forecast_storage.compute_accuracy([], [], days_back=30)
        self.assertEqual(result["accuracy_by_field"], {})
        self.assertEqual(result["history_size"], 0)
        self.assertIsNotNone(result["warning"])


class ForecastAccuracyEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_path = forecast_storage.HISTORY_PATH
        forecast_storage.HISTORY_PATH = Path(self.temp_dir.name) / "history.json"
        app = FastAPI()
        app.include_router(forecast_router.router, prefix="/forecast")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        forecast_storage.HISTORY_PATH = self.original_path
        self.temp_dir.cleanup()

    def test_accuracy_endpoint_with_empty_history_returns_warning(self) -> None:
        response = self.client.post(
            "/forecast/accuracy",
            json={"snapshots": _build_snapshots(), "days_back": 30},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["accuracy_by_field"], {})
        self.assertEqual(body["history_size"], 0)
        self.assertIsNotNone(body["warning"])

    def test_accuracy_endpoint_happy_path(self) -> None:
        # Seed history with 14 entries pra evitar warning de history-size
        today = datetime.now(timezone.utc).date()
        forecasted = []
        snapshots_real = []
        for offset in range(14):
            target = (today - timedelta(days=offset)).isoformat()
            forecasted.append({
                "date": target,
                "forecastConfidence": 0.4,
                "health": {"sleepTotalHours": 7.0 + offset * 0.05},
            })
            snapshots_real.append({
                "date": target,
                "health": {"sleepTotalHours": 7.0 + offset * 0.05 + 0.1},
            })
        forecast_storage.record_forecast(forecasted, "2026-04-01T00:00:00+00:00")

        response = self.client.post(
            "/forecast/accuracy",
            json={"snapshots": snapshots_real, "days_back": 30},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("sleepTotalHours", body["accuracy_by_field"])
        self.assertEqual(body["accuracy_by_field"]["sleepTotalHours"]["n"], 14)
        self.assertIsNone(body["warning"])


if __name__ == "__main__":
    unittest.main()
