"""Pharmacokinetic utilities for dose absorption and elimination."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATABASE_PATH = Path(__file__).with_name("medDataBase.json")


def half_life_from_elimination_rate(ke: float) -> float:
    """Calcula a meia-vida de eliminação a partir da constante de eliminação ke.

    Args:
        ke: taxa de eliminação (por hora ou por dia, conforme Unidade de tempo usada).

    Returns:
        Meia-vida (mesma unidade de tempo usada em ke).
    """
    if ke <= 0:
        raise ValueError("ke deve ser maior que zero")
    return math.log(2) / ke


def elimination_rate_from_half_life(half_life: float) -> float:
    """Calcula a constante de eliminação a partir da meia-vida."""
    if half_life <= 0:
        raise ValueError("half_life deve ser maior que zero")
    return math.log(2) / half_life


def absorption_rate_from_tmax(tmax: float, ke: float) -> float:
    """Estima ka a partir de Tmax e ke em um modelo oral de 1 compartimento.

    Resolve numericamente:
    Tmax = ln(ka / ke) / (ka - ke)
    """
    if tmax <= 0:
        raise ValueError("tmax deve ser maior que zero")
    if ke <= 0:
        raise ValueError("ke deve ser maior que zero")

    lower = ke * 1.000001
    upper = 100.0

    def tmax_difference(ka: float) -> float:
        return math.log(ka / ke) / (ka - ke) - tmax

    while tmax_difference(upper) > 0:
        upper *= 2
        if upper > 1_000_000:
            raise ValueError("nao foi possivel estimar ka a partir de tmax e ke")

    for _ in range(200):
        midpoint = (lower + upper) / 2
        if tmax_difference(midpoint) > 0:
            lower = midpoint
        else:
            upper = midpoint

    return (lower + upper) / 2


def concentration_at_time(
    dose: float,
    ka: float,
    ke: float,
    vd: float,
    t: float,
    bioavailability: float = 1.0,
) -> float:
    """Calcula a concentração plasmática em um modelo de 1 compartimento.

    Usa absorção e eliminação de primeira ordem para um dose única.

    C(t) = (F·D·ka) / (Vd·(ka - ke)) · (e^{-ke·t} - e^{-ka·t})

    Quando ka == ke, aplica-se o limite de l'Hôpital:
    C(t) = (F·D·ka / Vd) · t · e^{-ke·t}

    Args:
        dose: dose administrada.
        ka: taxa de absorção.
        ke: taxa de eliminação.
        vd: volume de distribuição aparente.
        t: tempo após administração.
        bioavailability: fração absorvida (F).

    Returns:
        Concentração prevista no tempo t.
    """
    if dose < 0:
        raise ValueError("dose deve ser maior ou igual a zero")
    if ka <= 0:
        raise ValueError("ka deve ser maior que zero")
    if ke <= 0:
        raise ValueError("ke deve ser maior que zero")
    if vd <= 0:
        raise ValueError("vd deve ser maior que zero")
    if t < 0:
        raise ValueError("t deve ser maior ou igual a zero")
    if bioavailability <= 0:
        raise ValueError("bioavailability deve ser maior que zero")

    if math.isclose(ka, ke, rel_tol=1e-9, abs_tol=0.0):
        return (bioavailability * dose * ka / vd) * t * math.exp(-ke * t)

    return (
        bioavailability
        * dose
        * ka
        / (vd * (ka - ke))
        * (math.exp(-ke * t) - math.exp(-ka * t))
    )


def concentration_after_multiple_doses(
    dose: float,
    ka: float,
    ke: float,
    vd: float,
    tau: float,
    n_doses: int,
    t: float,
    bioavailability: float = 1.0,
) -> float:
    """Calcula a concentração após múltiplas doses repetidas em intervalo constante.

    Cada dose é somada como se administrada em t = 0, tau, 2·tau, ...
    """
    if n_doses < 1:
        raise ValueError("n_doses deve ser pelo menos 1")
    if tau <= 0:
        raise ValueError("tau deve ser maior que zero")
    if t < 0:
        raise ValueError("t deve ser maior ou igual a zero")

    concentration = 0.0
    for dose_number in range(n_doses):
        dose_time = dose_number * tau
        if t >= dose_time:
            concentration += concentration_at_time(
                dose=dose,
                ka=ka,
                ke=ke,
                vd=vd,
                t=t - dose_time,
                bioavailability=bioavailability,
            )
    return concentration


@lru_cache(maxsize=1)
def load_medication_database() -> dict[str, Any]:
    """Carrega o banco farmacocinético local."""
    with _DATABASE_PATH.open(encoding="utf-8") as database_file:
        return json.load(database_file)


def available_substances() -> list[str]:
    """Lista as chaves principais disponíveis no banco."""
    database = load_medication_database()
    return sorted(database.get("substances", {}).keys())


def _normalize_substance_name(substance: str) -> str:
    return " ".join(substance.strip().lower().replace("_", " ").split())


def get_substance_profile(substance: str) -> dict[str, Any]:
    """Retorna o perfil farmacocinético de uma substância pelo nome ou alias."""
    if not substance.strip():
        raise ValueError("substance nao pode ser vazio")

    database = load_medication_database()
    normalized = _normalize_substance_name(substance)

    for key, profile in database.get("substances", {}).items():
        aliases = {
            _normalize_substance_name(key),
            *(_normalize_substance_name(alias) for alias in profile.get("aliases", [])),
        }
        if normalized in aliases:
            return {"id": key, **profile}

    raise KeyError(f"substancia nao encontrada no banco: {substance}")


def _profile_volume_of_distribution(profile: dict[str, Any], weight_kg: float | None) -> float:
    if "vd_l" in profile:
        return float(profile["vd_l"])

    vd_l_per_kg = profile.get("vd_l_per_kg")
    if vd_l_per_kg is None:
        raise ValueError(
            f"perfil {profile['id']} nao possui vd_l nem vd_l_per_kg configurado"
        )

    resolved_weight = weight_kg if weight_kg is not None else profile.get("default_weight_kg", 70.0)
    if resolved_weight <= 0:
        raise ValueError("weight_kg deve ser maior que zero")

    return float(vd_l_per_kg) * float(resolved_weight)


def concentration_for_substance(
    substance: str,
    dose: float,
    t: float,
    *,
    weight_kg: float | None = 70.0,
    n_doses: int = 1,
    tau: float | None = None,
    bioavailability: float | None = None,
) -> float:
    """Calcula concentração a partir do banco farmacocinético local.

    A unidade de saída é a unidade de dose do perfil por litro. Exemplo:
    - dose em mg -> resultado aproximado em mg/L
    - dose em UI -> resultado aproximado em UI/L
    """
    profile = get_substance_profile(substance)

    if not profile.get("model_supported", False):
        reason = profile.get("reason", "perfil marcado como nao suportado para o modelo")
        raise ValueError(f"{profile['display_name']}: {reason}")

    if n_doses < 1:
        raise ValueError("n_doses deve ser pelo menos 1")
    if n_doses > 1 and tau is None:
        raise ValueError("tau deve ser informado quando n_doses for maior que 1")

    resolved_bioavailability = (
        float(bioavailability)
        if bioavailability is not None
        else float(profile["bioavailability"])
    )

    vd = _profile_volume_of_distribution(profile, weight_kg)

    if n_doses == 1:
        return concentration_at_time(
            dose=dose,
            ka=float(profile["ka_per_hour"]),
            ke=float(profile["ke_per_hour"]),
            vd=vd,
            t=t,
            bioavailability=resolved_bioavailability,
        )

    return concentration_after_multiple_doses(
        dose=dose,
        ka=float(profile["ka_per_hour"]),
        ke=float(profile["ke_per_hour"]),
        vd=vd,
        tau=float(tau),
        n_doses=n_doses,
        t=t,
        bioavailability=resolved_bioavailability,
    )
