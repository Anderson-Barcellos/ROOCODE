import unittest

import Mood.mood as mood_module


class MoodFormattingTests(unittest.TestCase):
    def test_format_v2_iso_like_with_timezone(self) -> None:
        formatted = mood_module._format_mood_date("2026-05-04 14:49:30 -0300")
        self.assertEqual(formatted, "04/05/2026 14:49:30")

    def test_format_legacy_day_first_datetime(self) -> None:
        # Regressao: sem dayfirst dedicado para slash dates,
        # 03/04/2026 poderia virar 04/03/2026.
        formatted = mood_module._format_mood_date("03/04/2026 12:00:00")
        self.assertEqual(formatted, "03/04/2026 12:00:00")

    def test_format_date_only(self) -> None:
        formatted = mood_module._format_mood_date("2026-05-04")
        self.assertEqual(formatted, "04/05/2026")


class MoodAssociationTests(unittest.TestCase):
    def test_normalize_association_accepts_fraction(self) -> None:
        normalized = mood_module._normalize_mood_association(0.25)
        self.assertEqual(normalized, 62)

    def test_normalize_association_accepts_percentage(self) -> None:
        normalized = mood_module._normalize_mood_association("76")
        self.assertEqual(normalized, 76)

    def test_normalize_association_rejects_out_of_scale(self) -> None:
        with self.assertRaises(ValueError):
            mood_module._normalize_mood_association(120)


if __name__ == "__main__":
    unittest.main()
