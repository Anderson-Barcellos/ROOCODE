import unittest

from Farma import (
    available_substances,
    concentration_at_time,
    concentration_for_substance,
    get_substance_profile,
    load_medication_database,
)


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


if __name__ == "__main__":
    unittest.main()
