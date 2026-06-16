"""Enriquecimento PK das sessões cognitivas — concentração de Venvanse no horário da aferição.

Subsistema isolado: este é o ÚNICO ponto de acoplamento Cognição→Farma. Importa apenas
funções puras de `Farma.math` e lê `Farma/dose_log.json` por path direto; nunca importa
`Farma.router` (que tem estado de arquivo e efeitos de API).

Fonte da dose: prioriza a dose real mais recente do `dose_log.json` antes do `started_at`
(janela de 24h); fallback para o `vyvanse_taken_at` (HH:MM local) registrado no contexto
da sessão nos dias sem dose logada.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from Farma.math import (
    concentration_at_time,
    get_substance_profile,
    _profile_volume_of_distribution,
)
from Profile import DEFAULT_BODY_WEIGHT_KG

APP_TIMEZONE = ZoneInfo("America/Sao_Paulo")
DOSE_LOG_PATH = Path(__file__).parent.parent / "Farma" / "dose_log.json"
SUBSTANCE_KEY = "venvanse"
MAX_DOSE_WINDOW_HOURS = 24.0
DEFAULT_REGIMEN_DOSE_MG = 200.0


def _parse_iso_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _load_venvanse_doses_from_log() -> list[tuple[datetime, float]]:
    """Retorna [(taken_at_utc, dose_mg)] de Venvanse, ordenado por horário. Vazio se ausente/malformado."""
    try:
        with DOSE_LOG_PATH.open(encoding="utf-8") as fh:
            records = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(records, list):
        return []

    doses: list[tuple[datetime, float]] = []
    for record in records:
        if not isinstance(record, dict) or record.get("substance") != SUBSTANCE_KEY:
            continue
        try:
            taken = datetime.fromisoformat(str(record["taken_at"]).replace("Z", "+00:00"))
            if taken.tzinfo is None:
                taken = taken.replace(tzinfo=timezone.utc)
            doses.append((taken.astimezone(timezone.utc), float(record["dose_mg"])))
        except (KeyError, ValueError, TypeError):
            continue
    doses.sort(key=lambda item: item[0])
    return doses


def _concentration_ng_ml(dose_mg: float, hours_since_dose: float) -> float | None:
    """Concentração estimada de Venvanse em ng/mL, t horas após a dose. None se inválido."""
    try:
        profile = get_substance_profile(SUBSTANCE_KEY)
        vd = _profile_volume_of_distribution(profile, DEFAULT_BODY_WEIGHT_KG)
        c_mg_l = concentration_at_time(
            dose=dose_mg,
            ka=profile["ka_per_hour"],
            ke=profile["ke_per_hour"],
            vd=vd,
            t=hours_since_dose,
            bioavailability=profile.get("bioavailability", 1.0),
        )
    except (ValueError, KeyError):
        return None
    return round(c_mg_l * 1000.0, 4)


def _build_pk_context(dose_mg: float, hours_since_dose: float, dose_source: str) -> dict[str, Any] | None:
    concentration = _concentration_ng_ml(dose_mg, hours_since_dose)
    if concentration is None:
        return None
    return {
        "venvanse_ng_ml": concentration,
        "hours_since_dose": round(hours_since_dose, 4),
        "dose_mg": dose_mg,
        "dose_source": dose_source,
    }


def _parse_hhmm_to_utc(hhmm: str, reference_utc: datetime) -> datetime | None:
    """Converte "HH:MM" local (America/Sao_Paulo) na data local de `reference_utc` para UTC.

    Se o horário resultante for posterior à sessão, assume dose tomada no dia anterior.
    """
    try:
        hour_str, minute_str = hhmm.strip().split(":", 1)
        hour, minute = int(hour_str), int(minute_str)
    except (ValueError, AttributeError):
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None

    local_ref = reference_utc.astimezone(APP_TIMEZONE)
    local_dose = local_ref.replace(hour=hour, minute=minute, second=0, microsecond=0)
    dose_utc = local_dose.astimezone(timezone.utc)
    if dose_utc > reference_utc:
        dose_utc -= timedelta(days=1)
    return dose_utc


def enrich_session_pk(started_at_str: str, context: dict[str, Any]) -> dict[str, Any] | None:
    """Concentração de Venvanse no horário da sessão. None se não houver dose disponível."""
    try:
        started_at = _parse_iso_utc(started_at_str)
    except (ValueError, TypeError):
        return None

    # 1) Fonte primária: dose real mais recente do dose_log dentro de 24h antes da sessão.
    doses = _load_venvanse_doses_from_log()
    latest = None
    for taken_at, dose_mg in doses:  # ordenado crescente; pega a última <= started_at
        if taken_at <= started_at:
            latest = (taken_at, dose_mg)
    if latest is not None:
        hours = (started_at - latest[0]).total_seconds() / 3600.0
        if 0 <= hours <= MAX_DOSE_WINDOW_HOURS:
            context_pk = _build_pk_context(latest[1], hours, "dose_log")
            if context_pk is not None:
                return context_pk

    # 2) Fallback: vyvanse_taken_at (HH:MM) manual registrado no contexto da sessão.
    hhmm = context.get("vyvanse_taken_at")
    if isinstance(hhmm, str) and hhmm.strip():
        dose_utc = _parse_hhmm_to_utc(hhmm, started_at)
        if dose_utc is not None:
            hours = (started_at - dose_utc).total_seconds() / 3600.0
            if 0 <= hours <= MAX_DOSE_WINDOW_HOURS:
                dose_mg = doses[-1][1] if doses else DEFAULT_REGIMEN_DOSE_MG
                return _build_pk_context(dose_mg, hours, "context_hhmm")

    return None
