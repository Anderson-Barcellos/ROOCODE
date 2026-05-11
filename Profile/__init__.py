"""Profile module — fonte única de verdade pro perfil pessoal do backend.

Espelha `frontend/src/utils/user-profile.ts`. Todos os defaults de cálculos
PK/HR (peso corporal, HRmax, idade) devem derivar daqui em vez de hardcodes
espalhados pelos routers.
"""

from .user_profile import (
    DEFAULT_BODY_WEIGHT_KG,
    USER_PROFILE,
    estimate_hr_max_by_age,
)

__all__ = ["USER_PROFILE", "DEFAULT_BODY_WEIGHT_KG", "estimate_hr_max_by_age"]
