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

    def test_extra_horizon_field_is_ignored(self) -> None:
        """Auditoria 2026-05-15: campo `horizon` foi removido do ForecastRequest
        (era inerte — backend sempre usa FORECAST_HORIZON=5). Pydantic v2 ignora
        campos extras silenciosamente; cliente enviando horizon=3 não recebe
        mais 400. Esse teste documenta o novo contrato."""
        payload = _build_payload()
        payload["horizon"] = 3  # ignorado

        response = self.client.post("/forecast", json=payload)

        # Não retorna mais 400 — horizon é silenciosamente desconsiderado.
        # Resposta de sucesso usa FORECAST_HORIZON (5) independentemente.
        self.assertNotEqual(response.status_code, 400)

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


class CompactSnapshotEnrichedTests(unittest.TestCase):
    """M6.2.b — _compact_snapshot extrai sleep_detail, derivations, interp flag."""

    def test_extracts_sleep_detail_from_health_block(self):
        snapshot = {
            "date": "2026-04-15",
            "health": {
                "sleepTotalHours": 7.0, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0,
                "sleepRemHours": 1.6, "sleepDeepHours": 1.2,
                "sleepCoreHours": 3.8, "sleepAwakeHours": 0.4,
                "sleepEfficiencyPct": 92.5,
            },
            "mood": {"valence": 0.3},
        }
        out = forecast_router._compact_snapshot(snapshot)
        self.assertIsNotNone(out)
        self.assertIn("sleep_detail", out)
        self.assertEqual(out["sleep_detail"]["sleepRemHours"], 1.6)
        self.assertEqual(out["sleep_detail"]["sleepEfficiencyPct"], 92.5)

    def test_extracts_sleep_detail_from_values_block(self):
        snapshot = {
            "date": "2026-04-15",
            "values": {
                "sleepTotalHours": 7.0, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0, "valence": 0.3,
                "sleepRemHours": 1.6, "sleepDeepHours": 1.2,
            },
        }
        out = forecast_router._compact_snapshot(snapshot)
        self.assertIsNotNone(out)
        self.assertEqual(out["sleep_detail"]["sleepRemHours"], 1.6)
        self.assertEqual(out["sleep_detail"]["sleepDeepHours"], 1.2)
        # Campos não fornecidos viram None
        self.assertIsNone(out["sleep_detail"]["sleepEfficiencyPct"])

    def test_extracts_derivations_block(self):
        snapshot = {
            "date": "2026-04-15",
            "values": {
                "sleepTotalHours": 7.0, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0, "valence": 0.3,
            },
            "derivations": {"recoveryScore": 72.5, "abi": 0.4, "wristTempDeviation": -0.1},
        }
        out = forecast_router._compact_snapshot(snapshot)
        self.assertIn("derivations", out)
        self.assertEqual(out["derivations"]["recoveryScore"], 72.5)
        self.assertEqual(out["derivations"]["abi"], 0.4)
        self.assertEqual(out["derivations"]["wristTempDeviation"], -0.1)

    def test_propagates_interpolated_flag_and_confidence(self):
        snapshot = {
            "date": "2026-04-15",
            "values": {
                "sleepTotalHours": 7.0, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0, "valence": 0.3,
            },
            "is_interpolated": True,
            "confidence": 0.5,
        }
        out = forecast_router._compact_snapshot(snapshot)
        self.assertTrue(out["is_interpolated"])
        self.assertEqual(out["confidence"], 0.5)

    def test_legacy_interpolated_key_also_recognized(self):
        # Frontend usa `interpolated`; backend de outras rotas usa `is_interpolated`.
        # Aceita ambos pra compatibilidade com snapshots já no formato DailySnapshot.
        snapshot = {
            "date": "2026-04-15",
            "values": {
                "sleepTotalHours": 7.0, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0, "valence": 0.3,
            },
            "interpolated": True,
        }
        out = forecast_router._compact_snapshot(snapshot)
        self.assertTrue(out["is_interpolated"])

    def test_omits_optional_blocks_when_absent(self):
        # Backward compat: snapshot só com 6 campos antigos ainda funciona, sem ruído.
        snapshot = {
            "date": "2026-04-15",
            "values": {
                "sleepTotalHours": 7.0, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0, "valence": 0.3,
            },
        }
        out = forecast_router._compact_snapshot(snapshot)
        self.assertNotIn("sleep_detail", out)
        self.assertNotIn("derivations", out)
        self.assertNotIn("is_interpolated", out)
        self.assertNotIn("confidence", out)


class BuildRecentSummaryEnrichedTests(unittest.TestCase):
    """M6.2.b — _build_recent_summary agrega sleep_detail + derivations + interp count."""

    def _enriched_snapshots(self) -> List[Dict[str, Any]]:
        return [
            {
                "date": "2026-04-08",
                "values": {
                    "sleepTotalHours": 7.2, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                    "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0, "valence": 0.2,
                },
                "sleep_detail": {
                    "sleepRemHours": 1.6, "sleepDeepHours": 1.2,
                    "sleepCoreHours": 4.0, "sleepAwakeHours": 0.4,
                    "sleepEfficiencyPct": 92.0,
                },
                "derivations": {"recoveryScore": 72.0, "abi": 0.4, "wristTempDeviation": -0.1},
            },
            {
                "date": "2026-04-09",
                "values": {
                    "sleepTotalHours": 6.8, "hrvSdnn": 105.0, "restingHeartRate": 56.0,
                    "activeEnergyKcal": 480.0, "exerciseMinutes": 30.0, "valence": 0.1,
                },
                "sleep_detail": {
                    "sleepRemHours": 1.4, "sleepDeepHours": 1.1,
                    "sleepCoreHours": 3.9, "sleepAwakeHours": 0.4,
                    "sleepEfficiencyPct": 90.5,
                },
                "derivations": {"recoveryScore": 68.0, "abi": 0.2, "wristTempDeviation": 0.0},
                "is_interpolated": True,
            },
        ]

    def test_field_trends_includes_sleep_detail(self):
        out = forecast_router._build_recent_summary(self._enriched_snapshots(), None)
        trends = out["field_trends"]
        self.assertIn("sleepRemHours", trends)
        self.assertIn("sleepEfficiencyPct", trends)
        self.assertEqual(trends["sleepRemHours"]["available_days"], 2)
        self.assertEqual(trends["sleepRemHours"]["last_value"], 1.4)
        # mean_last7 = (1.6 + 1.4) / 2 = 1.5
        self.assertEqual(trends["sleepRemHours"]["mean_last7"], 1.5)

    def test_derivations_summary_aggregates_composite_indices(self):
        out = forecast_router._build_recent_summary(self._enriched_snapshots(), None)
        d_summary = out["derivations_summary"]
        self.assertIn("recoveryScore", d_summary)
        self.assertIn("abi", d_summary)
        self.assertIn("wristTempDeviation", d_summary)
        self.assertEqual(d_summary["recoveryScore"]["available_days"], 2)
        self.assertEqual(d_summary["recoveryScore"]["last_value"], 68.0)
        self.assertEqual(d_summary["recoveryScore"]["mean_last7"], 70.0)

    def test_interpolated_days_in_context_counts_correctly(self):
        out = forecast_router._build_recent_summary(self._enriched_snapshots(), None)
        self.assertEqual(out["interpolated_days_in_context"], 1)

    def test_recent_trace_marks_interp_days(self):
        out = forecast_router._build_recent_summary(self._enriched_snapshots(), None)
        trace = out["recent_trace"]
        self.assertTrue(any(row.get("interp") is True for row in trace))
        # Real days NÃO carregam o flag (evita ruído visual no payload)
        self.assertFalse(all(row.get("interp") is True for row in trace))

    def test_legacy_payload_still_works_no_enriched_fields(self):
        # Backward compat: payload velho sem sleep_detail/derivations não quebra
        legacy_snapshots = _build_snapshots()  # 7 dias só com 6 fields
        # Compactar primeiro pra simular o pipeline real
        compact = [forecast_router._compact_snapshot(s) for s in legacy_snapshots]
        compact = [c for c in compact if c is not None]
        out = forecast_router._build_recent_summary(compact, None)
        self.assertEqual(out["derivations_summary"], {})
        self.assertEqual(out["interpolated_days_in_context"], 0)
        # Sleep detail ausente em todos os snapshots → não deve aparecer em field_trends
        self.assertNotIn("sleepRemHours", out["field_trends"])

    def test_empty_snapshots_returns_empty_enriched_blocks(self):
        out = forecast_router._build_recent_summary([], None)
        self.assertEqual(out["derivations_summary"], {})
        self.assertEqual(out["interpolated_days_in_context"], 0)


class BuildPromptEnrichedTests(unittest.TestCase):
    """M6.2.c — _build_prompt inclui PACIENTE + REGIME + PK + DERIVAÇÕES."""

    def _future_dates(self) -> List[Dict[str, str]]:
        return [
            {"date": "2026-04-08", "weekday": "Quarta-feira"},
            {"date": "2026-04-09", "weekday": "Quinta-feira"},
        ]

    def _enriched_recent(self) -> List[Dict[str, Any]]:
        # Compactado igual o pipeline real produz após M6.2.b
        return [
            {
                "date": "2026-04-04",
                "values": {
                    "sleepTotalHours": 7.0, "hrvSdnn": 110.0, "restingHeartRate": 55.0,
                    "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0, "valence": 0.2,
                },
                "derivations": {"recoveryScore": 70.0, "abi": 0.3, "wristTempDeviation": -0.05},
            },
            {
                "date": "2026-04-05",
                "values": {
                    "sleepTotalHours": 6.5, "hrvSdnn": 105.0, "restingHeartRate": 56.0,
                    "activeEnergyKcal": 450.0, "exerciseMinutes": 30.0, "valence": 0.0,
                },
                "derivations": {"recoveryScore": 65.0, "abi": 0.1, "wristTempDeviation": 0.1},
                "is_interpolated": True,
            },
        ]

    def test_prompt_contains_patient_block(self):
        prompt = forecast_router._build_prompt(self._enriched_recent(), self._future_dates(), cap=0.4)
        self.assertIn("PACIENTE", prompt)
        self.assertIn("39 anos, 91 kg", prompt)
        self.assertIn("Neuropsiquiatra", prompt)

    def test_prompt_contains_regimen_block(self):
        prompt = forecast_router._build_prompt(self._enriched_recent(), self._future_dates(), cap=0.4)
        self.assertIn("REGIME FARMACOLÓGICO", prompt)
        self.assertIn("Escitalopram 40 mg", prompt)
        self.assertIn("Lisdexanfetamina 200 mg", prompt)
        self.assertIn("Lamotrigina 200 mg", prompt)

    def test_prompt_contains_derivations_when_present(self):
        prompt = forecast_router._build_prompt(self._enriched_recent(), self._future_dates(), cap=0.4)
        self.assertIn("DERIVAÇÕES_COMPOSTAS_JSON", prompt)
        self.assertIn("recoveryScore", prompt)

    def test_prompt_contains_pk_context_block_with_real_regimen(self):
        # build_pk_series usa Farma/regimen_config.json + dose_log.json reais
        prompt = forecast_router._build_prompt(self._enriched_recent(), self._future_dates(), cap=0.4)
        # PK_CONTEXT é opcional — só aparece se build_pk_series retornar dados.
        # Com regimen real do Anders deve aparecer pra Lexapro/Lamictal/Venvanse.
        self.assertIn("PK_CONTEXT_JSON", prompt)

    def test_prompt_omits_derivations_block_when_absent(self):
        # Snapshots legacy sem derivations não devem ter o bloco
        legacy = [
            forecast_router._compact_snapshot(s) for s in _build_snapshots()
        ]
        legacy = [c for c in legacy if c is not None]
        prompt = forecast_router._build_prompt(legacy, self._future_dates(), cap=0.4)
        self.assertNotIn("DERIVAÇÕES_COMPOSTAS_JSON", prompt)
        # PACIENTE + REGIME aparecem sempre (são âncoras estáveis)
        self.assertIn("PACIENTE", prompt)
        self.assertIn("REGIME FARMACOLÓGICO", prompt)

    def test_prompt_size_reasonable(self):
        # Cap defensivo: prompt completo deve caber bem abaixo de 100k chars.
        # Anders tem 10M tokens/dia, mas vale monitorar pra detectar inflar acidental.
        prompt = forecast_router._build_prompt(self._enriched_recent(), self._future_dates(), cap=0.4)
        self.assertLess(len(prompt), 100_000, "Prompt cresceu demais — investigar")

    def test_prompt_includes_interp_count_in_rules(self):
        prompt = forecast_router._build_prompt(self._enriched_recent(), self._future_dates(), cap=0.4)
        self.assertIn("interpolated_days_in_context", prompt)

    @patch("Forecast.router.build_pk_series")
    def test_pk_failure_does_not_break_prompt(self, mock_pk):
        mock_pk.side_effect = RuntimeError("PK calculation failed")
        # Não deve raise — só omite o bloco PK
        prompt = forecast_router._build_prompt(self._enriched_recent(), self._future_dates(), cap=0.4)
        self.assertNotIn("PK_CONTEXT_JSON", prompt)
        # Resto do prompt segue intacto
        self.assertIn("PACIENTE", prompt)


class ReportsStorageTests(unittest.TestCase):
    """M6.3.a — record_report + load_reports + get_report."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_path = forecast_storage.REPORTS_PATH
        forecast_storage.REPORTS_PATH = Path(self.temp_dir.name) / "reports.json"

    def tearDown(self) -> None:
        forecast_storage.REPORTS_PATH = self.original_path
        self.temp_dir.cleanup()

    def test_record_report_persists_and_returns_id(self):
        report = {
            "narrative": "Recovery em alta…",
            "forecast_snapshots": [{"date": "2026-04-08", "forecastConfidence": 0.4}],
            "signals": [{"field": "hrvSdnn", "observation": "trending up"}],
        }
        report_id = forecast_storage.record_report(report, "2026-04-07T20:00:00+00:00")
        self.assertIsInstance(report_id, str)
        self.assertEqual(len(report_id), 12)
        self.assertTrue(forecast_storage.REPORTS_PATH.exists())

    def test_load_reports_returns_most_recent_first(self):
        forecast_storage.record_report({"narrative": "A"}, "2026-04-01T00:00:00+00:00")
        forecast_storage.record_report({"narrative": "B"}, "2026-04-05T00:00:00+00:00")
        forecast_storage.record_report({"narrative": "C"}, "2026-04-03T00:00:00+00:00")

        reports = forecast_storage.load_reports()
        self.assertEqual(len(reports), 3)
        self.assertEqual(reports[0]["narrative"], "B")
        self.assertEqual(reports[1]["narrative"], "C")
        self.assertEqual(reports[2]["narrative"], "A")

    def test_load_reports_filters_by_days_back(self):
        now = datetime.now(timezone.utc)
        old_ts = (now - timedelta(days=60)).isoformat()
        recent_ts = (now - timedelta(days=5)).isoformat()
        forecast_storage.record_report({"narrative": "old"}, old_ts)
        forecast_storage.record_report({"narrative": "recent"}, recent_ts)

        recent_only = forecast_storage.load_reports(days_back=30)
        self.assertEqual(len(recent_only), 1)
        self.assertEqual(recent_only[0]["narrative"], "recent")

    def test_load_reports_respects_limit(self):
        for i in range(5):
            ts = (datetime.now(timezone.utc) - timedelta(days=i)).isoformat()
            forecast_storage.record_report({"narrative": f"r{i}"}, ts)
        limited = forecast_storage.load_reports(limit=3)
        self.assertEqual(len(limited), 3)

    def test_get_report_returns_specific_entry(self):
        rid_a = forecast_storage.record_report({"narrative": "A"}, "2026-04-01T00:00:00+00:00")
        forecast_storage.record_report({"narrative": "B"}, "2026-04-02T00:00:00+00:00")
        fetched = forecast_storage.get_report(rid_a)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["narrative"], "A")
        self.assertEqual(fetched["report_id"], rid_a)

    def test_get_report_returns_none_for_unknown_id(self):
        forecast_storage.record_report({"narrative": "A"}, "2026-04-01T00:00:00+00:00")
        self.assertIsNone(forecast_storage.get_report("nonexistent_id_xyz"))

    def test_load_reports_empty_when_no_file(self):
        # REPORTS_PATH doesn't exist yet (setUp created tempdir but no file written)
        reports = forecast_storage.load_reports()
        self.assertEqual(reports, [])


class ForecastReportEndpointTests(unittest.TestCase):
    """M6.3.b — POST /forecast/report + GET /forecast/reports + /reports/{id}."""

    def setUp(self) -> None:
        forecast_router._cache.clear()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_history = forecast_storage.HISTORY_PATH
        self.original_reports = forecast_storage.REPORTS_PATH
        forecast_storage.HISTORY_PATH = Path(self.temp_dir.name) / "history.json"
        forecast_storage.REPORTS_PATH = Path(self.temp_dir.name) / "reports.json"
        app = FastAPI()
        app.include_router(forecast_router.router, prefix="/forecast")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        forecast_storage.HISTORY_PATH = self.original_history
        forecast_storage.REPORTS_PATH = self.original_reports
        self.temp_dir.cleanup()

    def _mock_report_payload(self) -> Dict[str, Any]:
        return {
            "narrative": {
                "contexto_recente": "Últimos 7 dias mostram HRV estável em ~110 ms…",
                "hipoteses_ativas": "Padrão semanal preservado, sem picos atípicos…",
                "tendencias": "Sleep total trending up em 0.3h/d…",
                "drivers_principais": "PK do Lexapro estável, atividade matinal mantida…",
                "projecao_5d": "Espera-se HRV mantido com leve queda no fim de semana…",
                "recomendacoes_monitoramento": "Acompanhar wrist temp se >+0.5°C…",
            },
            "forecasts": [
                {"date": "2026-04-08", "values": {"sleepTotalHours": 7.2, "hrvSdnn": 108.0,
                  "restingHeartRate": 56.0, "activeEnergyKcal": 480.0, "exerciseMinutes": 40.0,
                  "valence": 0.2}, "confidence": 0.4, "rationale": "estável"},
                {"date": "2026-04-09", "values": {"sleepTotalHours": 7.0, "hrvSdnn": 106.0,
                  "restingHeartRate": 57.0, "activeEnergyKcal": 470.0, "exerciseMinutes": 35.0,
                  "valence": 0.15}, "confidence": 0.38, "rationale": "estável"},
                {"date": "2026-04-10", "values": {"sleepTotalHours": 6.8, "hrvSdnn": 104.0,
                  "restingHeartRate": 58.0, "activeEnergyKcal": 460.0, "exerciseMinutes": 30.0,
                  "valence": 0.1}, "confidence": 0.36, "rationale": "estável"},
                {"date": "2026-04-11", "values": {"sleepTotalHours": 7.5, "hrvSdnn": 110.0,
                  "restingHeartRate": 55.0, "activeEnergyKcal": 500.0, "exerciseMinutes": 45.0,
                  "valence": 0.25}, "confidence": 0.34, "rationale": "fim de semana"},
                {"date": "2026-04-12", "values": {"sleepTotalHours": 7.8, "hrvSdnn": 112.0,
                  "restingHeartRate": 54.0, "activeEnergyKcal": 510.0, "exerciseMinutes": 50.0,
                  "valence": 0.3}, "confidence": 0.32, "rationale": "fim de semana"},
            ],
            "signals": [{"field": "hrvSdnn", "observation": "HRV estável"}],
            "drivers": [
                {"name": "PK Lexapro steady-state", "impact": "alto", "direction": "neutro",
                 "rationale": "regime estável há 30+ dias"},
                {"name": "atividade matinal Venvanse", "impact": "medio", "direction": "positivo",
                 "rationale": "consistente weekdays"},
            ],
        }

    @patch("Forecast.router._call_model")
    def test_report_returns_narrative_and_persists(self, mock_call):
        mock_call.return_value = json.dumps(self._mock_report_payload())

        response = self.client.post("/forecast/report", json=_build_payload())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("report_id", data)
        self.assertIn("generated_at", data)
        self.assertIn("narrative", data)
        self.assertIn("contexto_recente", data["narrative"])
        self.assertEqual(len(data["forecast_snapshots"]), 5)
        self.assertEqual(len(data["drivers"]), 2)
        # Persistido
        self.assertTrue(forecast_storage.REPORTS_PATH.exists())

    @patch("Forecast.router._call_model")
    def test_report_call_uses_verbosity_high(self, mock_call):
        mock_call.return_value = json.dumps(self._mock_report_payload())
        self.client.post("/forecast/report", json=_build_payload())
        # Verifica que _call_model foi chamado com verbosity="high"
        args, kwargs = mock_call.call_args
        self.assertEqual(args[1] if len(args) > 1 else kwargs.get("verbosity"), "high")

    @patch("Forecast.router._call_model")
    def test_report_retries_without_verbosity_when_param_rejected(self, mock_call):
        # Primeiro call falha com mensagem mencionando verbosity
        first_payload = self._mock_report_payload()
        mock_call.side_effect = [
            RuntimeError("OpenAI HTTP 400: unknown parameter 'verbosity'"),
            json.dumps(first_payload),
        ]
        response = self.client.post("/forecast/report", json=_build_payload())
        self.assertEqual(response.status_code, 200)
        # 2 calls feitas
        self.assertEqual(mock_call.call_count, 2)
        # Segundo call sem verbosity
        second_args, second_kwargs = mock_call.call_args_list[1]
        verbosity_arg = second_args[1] if len(second_args) > 1 else second_kwargs.get("verbosity")
        self.assertIsNone(verbosity_arg)

    @patch("Forecast.router._call_model")
    def test_report_provider_failure_returns_502(self, mock_call):
        mock_call.side_effect = RuntimeError("provider offline")
        response = self.client.post("/forecast/report", json=_build_payload())
        self.assertEqual(response.status_code, 502)

    @patch("Forecast.router._call_model")
    def test_get_reports_list_returns_persisted(self, mock_call):
        mock_call.return_value = json.dumps(self._mock_report_payload())
        # Gera 2 relatórios
        self.client.post("/forecast/report", json=_build_payload())
        forecast_router._cache.clear()  # força segunda chamada não-cached
        # Modifica payload pra invalidar hash
        payload2 = _build_payload()
        payload2["valid_real_days"] = 11
        self.client.post("/forecast/report", json=payload2)

        listing = self.client.get("/forecast/reports?days_back=30&limit=5")
        self.assertEqual(listing.status_code, 200)
        body = listing.json()
        self.assertEqual(body["count"], 2)
        self.assertEqual(len(body["reports"]), 2)

    @patch("Forecast.router._call_model")
    def test_get_report_by_id_returns_specific(self, mock_call):
        mock_call.return_value = json.dumps(self._mock_report_payload())
        first = self.client.post("/forecast/report", json=_build_payload()).json()
        rid = first["report_id"]
        fetched = self.client.get(f"/forecast/reports/{rid}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["report_id"], rid)

    def test_get_report_by_id_not_found_returns_404(self):
        response = self.client.get("/forecast/reports/nonexistent_id")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
