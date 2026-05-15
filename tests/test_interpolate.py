"""Testes do módulo Interpolate — guardrails da auditoria 2026-05-15.

Cobre:
- _find_missing_dates: gaps ≤ MAX_GAP_DAYS são aceitos, gaps maiores entram em skipped.
- _clamp_to_bounds: valores fora de range fisiológico são clampados.
- _apply_filled: valores absurdos do LLM não escapam o snapshot.
"""
import unittest

import Interpolate.router as interp_router


class FindMissingDatesTests(unittest.TestCase):
    def test_empty_input_returns_empty_results(self) -> None:
        accepted, skipped = interp_router._find_missing_dates([])
        self.assertEqual(accepted, [])
        self.assertEqual(skipped, [])

    def test_single_snapshot_returns_no_gaps(self) -> None:
        accepted, skipped = interp_router._find_missing_dates([{"date": "2026-05-01"}])
        self.assertEqual(accepted, [])
        self.assertEqual(skipped, [])

    def test_small_gap_is_accepted(self) -> None:
        snapshots = [
            {"date": "2026-05-01"},
            {"date": "2026-05-05"},  # gap de 3 dias entre 02-04
        ]
        accepted, skipped = interp_router._find_missing_dates(snapshots, max_gap_days=7)
        self.assertEqual(accepted, ["2026-05-02", "2026-05-03", "2026-05-04"])
        self.assertEqual(skipped, [])

    def test_large_gap_is_skipped(self) -> None:
        snapshots = [
            {"date": "2026-04-01"},
            {"date": "2026-05-15"},  # gap de ~43 dias
        ]
        accepted, skipped = interp_router._find_missing_dates(snapshots, max_gap_days=7)
        self.assertEqual(accepted, [], "Gap > 7 dias não deve ser preenchido pelo LLM")
        self.assertEqual(len(skipped), 1)
        self.assertEqual(skipped[0]["from"], "2026-04-02")
        self.assertEqual(skipped[0]["to"], "2026-05-14")
        self.assertEqual(skipped[0]["length"], 43)

    def test_mixed_gaps_separates_acceptable_from_skipped(self) -> None:
        snapshots = [
            {"date": "2026-05-01"},
            {"date": "2026-05-03"},  # gap 1 dia (aceito)
            {"date": "2026-06-01"},  # gap 28 dias (pulado)
            {"date": "2026-06-04"},  # gap 2 dias (aceito)
        ]
        accepted, skipped = interp_router._find_missing_dates(snapshots, max_gap_days=7)
        self.assertIn("2026-05-02", accepted)
        self.assertIn("2026-06-02", accepted)
        self.assertIn("2026-06-03", accepted)
        # Datas dentro do gap grande NÃO devem estar em accepted
        self.assertNotIn("2026-05-15", accepted)
        self.assertEqual(len(skipped), 1)
        self.assertEqual(skipped[0]["length"], 28)


class ClampToBoundsTests(unittest.TestCase):
    def test_value_in_range_passes_through(self) -> None:
        self.assertEqual(interp_router._clamp_to_bounds("hrvSdnn", 45.0), 45.0)
        self.assertEqual(interp_router._clamp_to_bounds("valence", 0.5), 0.5)

    def test_value_below_min_is_clamped(self) -> None:
        # hrvSdnn min = 0 — LLM retornar -5 deve virar 0
        self.assertEqual(interp_router._clamp_to_bounds("hrvSdnn", -5.0), 0.0)
        # valence min = -1 — LLM retornar -3 deve virar -1
        self.assertEqual(interp_router._clamp_to_bounds("valence", -3.0), -1.0)

    def test_value_above_max_is_clamped(self) -> None:
        # hrvSdnn max = 250 — LLM retornar 999 deve virar 250
        self.assertEqual(interp_router._clamp_to_bounds("hrvSdnn", 999.0), 250.0)
        # valence max = 1.0 — LLM retornar 3.0 deve virar 1.0
        self.assertEqual(interp_router._clamp_to_bounds("valence", 3.0), 1.0)

    def test_none_returns_none(self) -> None:
        self.assertIsNone(interp_router._clamp_to_bounds("hrvSdnn", None))

    def test_unknown_field_passes_through(self) -> None:
        # Campos não declarados em INTERP_FIELD_BOUNDS passam sem clamp
        self.assertEqual(interp_router._clamp_to_bounds("desconhecido", 42.0), 42.0)


class ApplyFilledClampTests(unittest.TestCase):
    def test_llm_extreme_values_are_clamped_in_snapshot(self) -> None:
        sparse = [
            {"date": "2026-05-01", "health": None, "mood": None,
             "medications": None, "interpolated": False, "confidence": 1.0},
            {"date": "2026-05-03", "health": None, "mood": None,
             "medications": None, "interpolated": False, "confidence": 1.0},
        ]
        # LLM retornou valores claramente fora de range
        filled = [{
            "date": "2026-05-02",
            "confidence": 0.5,
            "values": {
                "sleepTotalHours": -2.0,       # < 0
                "hrvSdnn": 999.0,              # > 250
                "restingHeartRate": 10.0,      # < 30
                "activeEnergyKcal": 12000.0,   # > 8000
                "valence": 2.5,                # > 1.0
            },
        }]

        merged = interp_router._apply_filled(sparse, filled)
        day2 = next(s for s in merged if s["date"] == "2026-05-02")

        self.assertEqual(day2["health"]["sleepTotalHours"], 0.0)
        self.assertEqual(day2["health"]["hrvSdnn"], 250.0)
        self.assertEqual(day2["health"]["restingHeartRate"], 30.0)
        self.assertEqual(day2["health"]["activeEnergyKcal"], 8000.0)
        self.assertEqual(day2["mood"]["valence"], 1.0)
        self.assertEqual(day2["mood"]["valenceClass"], "Muito Agradável")


if __name__ == "__main__":
    unittest.main()
