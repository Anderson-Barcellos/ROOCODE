"""Tests for Forecast/payload_helpers.py — build_pk_series."""

import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import Forecast.payload_helpers as ph
from Forecast.payload_helpers import build_pk_series


# ---------------------------------------------------------------------------
# Reference date: Thursday 2026-04-30 — a weekday well into steady state.
# All three substances have been on regimen for months (start_date=null).
# Simulated noon concentrations at 91 kg (pre-validated against math.py):
#   Lexapro  40mg daily 07:00  → ~62 ng/mL  (therapeutic range 15–80)
#   Lamictal 200mg nightly 22:00 → ~3764 ng/mL (range 2000–10000)
#   Venvanse 200mg weekdays 07:00 → ~141 ng/mL (above 10–30; known per CLAUDE.md)
# ---------------------------------------------------------------------------
_STEADY_DATE = "2026-04-30"


class TestBuildPkSeriesSteadyState(unittest.TestCase):
    """Smoke tests with the real regimen_config.json and dose_log.json."""

    def test_three_substances_return_non_null_floats(self):
        result = build_pk_series(
            ["lexapro", "lamictal", "venvanse"],
            [_STEADY_DATE],
        )
        self.assertIn(_STEADY_DATE, result)
        day = result[_STEADY_DATE]
        for subst in ("lexapro", "lamictal", "venvanse"):
            self.assertIn(subst, day)
            self.assertIsNotNone(day[subst], f"{subst} should be non-null at steady state")
            self.assertIsInstance(day[subst], float)
            self.assertGreater(day[subst], 0.0, f"{subst} concentration must be positive")

    def test_lexapro_within_expected_range(self):
        result = build_pk_series(["lexapro"], [_STEADY_DATE])
        conc = result[_STEADY_DATE]["lexapro"]
        # Steady-state noon for 40mg/day at 91kg: ~50–80 ng/mL.
        # Generous band to accommodate dose_log vs regimen differences.
        self.assertGreater(conc, 20.0, "Lexapro below expected range")
        self.assertLess(conc, 200.0, "Lexapro unexpectedly high")

    def test_lamictal_within_expected_range(self):
        result = build_pk_series(["lamictal"], [_STEADY_DATE])
        conc = result[_STEADY_DATE]["lamictal"]
        # Steady-state noon for 200mg nightly at 91kg: ~2000–6000 ng/mL.
        self.assertGreater(conc, 1000.0, "Lamictal below expected range")
        self.assertLess(conc, 12000.0, "Lamictal unexpectedly high")

    def test_venvanse_positive_on_weekday(self):
        # 2026-04-30 is Thursday — venvanse weekday dose expected
        result = build_pk_series(["venvanse"], [_STEADY_DATE])
        conc = result[_STEADY_DATE]["venvanse"]
        # Venvanse at 200mg is knowingly above therapeutic range per Anders's regimen.
        # At noon (5h post-dose + accumulated trough): expect >20 ng/mL.
        self.assertGreater(conc, 20.0, "Venvanse concentration too low for weekday noon")


class TestBuildPkSeriesUnknownSubstance(unittest.TestCase):
    def test_unknown_substance_returns_none_without_raising(self):
        result = build_pk_series(["nonexistent_drug_xyz"], [_STEADY_DATE])
        self.assertIn(_STEADY_DATE, result)
        self.assertIsNone(result[_STEADY_DATE]["nonexistent_drug_xyz"])

    def test_mixed_known_unknown_partial_nulls(self):
        result = build_pk_series(["lexapro", "ghost_substance"], [_STEADY_DATE])
        day = result[_STEADY_DATE]
        self.assertIsNotNone(day["lexapro"])
        self.assertIsNone(day["ghost_substance"])


class TestBuildPkSeriesEmptyInputs(unittest.TestCase):
    def test_empty_substances_returns_empty(self):
        result = build_pk_series([], [_STEADY_DATE])
        self.assertEqual(result, {})

    def test_empty_dates_returns_empty(self):
        result = build_pk_series(["lexapro"], [])
        self.assertEqual(result, {})

    def test_both_empty_returns_empty(self):
        result = build_pk_series([], [])
        self.assertEqual(result, {})


class TestBuildPkSeriesMultipleDates(unittest.TestCase):
    def test_seven_consecutive_weekdays_structure(self):
        # Monday–Friday span; all should be non-null for lexapro (daily) and lamictal (daily)
        start = date(2026, 4, 28)  # Tuesday
        dates = [(start + timedelta(days=i)).isoformat() for i in range(5)]
        result = build_pk_series(["lexapro", "lamictal"], dates)
        self.assertEqual(len(result), 5)
        for d in dates:
            self.assertIn(d, result)
            self.assertIn("lexapro", result[d])
            self.assertIn("lamictal", result[d])
            self.assertIsNotNone(result[d]["lexapro"])
            self.assertIsNotNone(result[d]["lamictal"])

    def test_concentrations_stable_across_steady_state_days(self):
        # After >14 days of daily dosing, consecutive day values should be similar (±20%)
        start = date(2026, 4, 28)
        dates = [(start + timedelta(days=i)).isoformat() for i in range(5)]
        result = build_pk_series(["lexapro"], dates)
        values = [result[d]["lexapro"] for d in dates if result[d]["lexapro"] is not None]
        self.assertGreaterEqual(len(values), 4)
        mean = sum(values) / len(values)
        for v in values:
            self.assertAlmostEqual(v, mean, delta=mean * 0.30,
                                   msg=f"Lexapro concentration {v:.1f} deviates >30% from mean {mean:.1f}")

    def test_duplicate_dates_deduplicated(self):
        # Same date twice → one key in result
        result = build_pk_series(["lexapro"], [_STEADY_DATE, _STEADY_DATE])
        self.assertEqual(len(result), 1)


class TestBuildPkSeriesMissingFiles(unittest.TestCase):
    """Graceful degradation when regimen_config.json or dose_log.json is absent."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.tmp = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _patch_paths(self, regimen_path: Path, dose_path: Path):
        return [
            patch.object(ph, "_REGIMEN_PATH", regimen_path),
            patch.object(ph, "_DOSE_LOG_PATH", dose_path),
        ]

    def test_missing_both_files_returns_none(self):
        absent_regimen = self.tmp / "no_regimen.json"
        absent_doses = self.tmp / "no_doses.json"
        patches = self._patch_paths(absent_regimen, absent_doses)
        for p in patches:
            p.start()
        try:
            result = build_pk_series(["lexapro", "lamictal"], [_STEADY_DATE])
            day = result[_STEADY_DATE]
            self.assertIsNone(day["lexapro"])
            self.assertIsNone(day["lamictal"])
        finally:
            for p in patches:
                p.stop()

    def test_empty_regimen_returns_none_when_no_dose_log(self):
        # Regimen present but empty list + no dose log
        regimen_file = self.tmp / "regimen.json"
        regimen_file.write_text("[]", encoding="utf-8")
        absent_doses = self.tmp / "no_doses.json"
        patches = self._patch_paths(regimen_file, absent_doses)
        for p in patches:
            p.start()
        try:
            result = build_pk_series(["lexapro"], [_STEADY_DATE])
            self.assertIsNone(result[_STEADY_DATE]["lexapro"])
        finally:
            for p in patches:
                p.stop()

    def test_regimen_with_no_entry_for_substance(self):
        # Regimen only has venvanse; lexapro has no entry → None
        regimen_file = self.tmp / "regimen.json"
        regimen_data = [
            {
                "id": "venvanse-weekdays",
                "substance": "venvanse",
                "dose_mg": 200.0,
                "times": ["07:00"],
                "days_of_week": [1, 2, 3, 4, 5],
                "active": True,
                "start_date": None,
                "end_date": None,
            }
        ]
        regimen_file.write_text(json.dumps(regimen_data), encoding="utf-8")
        absent_doses = self.tmp / "no_doses.json"
        patches = self._patch_paths(regimen_file, absent_doses)
        for p in patches:
            p.start()
        try:
            result = build_pk_series(["lexapro", "venvanse"], [_STEADY_DATE])
            self.assertIsNone(result[_STEADY_DATE]["lexapro"],
                              "lexapro has no regimen entry → must be None")
            # venvanse regimen exists → should have a positive concentration on a weekday
            self.assertIsNotNone(result[_STEADY_DATE]["venvanse"])
        finally:
            for p in patches:
                p.stop()


class TestBuildPkSeriesBodyWeight(unittest.TestCase):
    def test_explicit_weight_changes_concentration(self):
        # Higher weight → larger Vd → lower concentration (inverse relationship)
        r_91 = build_pk_series(["lexapro"], [_STEADY_DATE], body_weight_kg=91.0)
        r_70 = build_pk_series(["lexapro"], [_STEADY_DATE], body_weight_kg=70.0)
        c_91 = r_91[_STEADY_DATE]["lexapro"]
        c_70 = r_70[_STEADY_DATE]["lexapro"]
        self.assertIsNotNone(c_91)
        self.assertIsNotNone(c_70)
        self.assertLess(c_91, c_70,
                        "Higher weight → larger Vd → lower concentration")


if __name__ == "__main__":
    unittest.main()
