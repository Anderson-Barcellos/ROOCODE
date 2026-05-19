"""Perfil pessoal — fonte única de verdade pro backend.

Espelha `frontend/src/utils/user-profile.ts`. Mantenha sincronizado se algum
campo mudar.
"""

from typing import Final

USER_PROFILE: Final[dict] = {
    "name": "Anders",
    "weight_kg": 91.0,
    "birth_year": 1986,
    "age": 40,
    "hr_max_bpm": 181,  # valor calibrado preservado (220 − 39, pré-aniversário)
    "sex": "M",
    "timezone": "America/Sao_Paulo",
}

DEFAULT_BODY_WEIGHT_KG: Final[float] = float(USER_PROFILE["weight_kg"])


def estimate_hr_max_by_age(age: int) -> int:
    return 220 - age
