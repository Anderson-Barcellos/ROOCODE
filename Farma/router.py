from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
import json
import uuid

from Farma.math import (
    concentration_for_substance,
    get_substance_profile,
    load_medication_database,
)

router = APIRouter()
DOSE_LOG_PATH = Path(__file__).parent / "dose_log.json"


# ─── Modelos ──────────────────────────────────────────────────────────────────

class DoseEntry(BaseModel):
    substance: str
    dose_mg: float
    taken_at: str  # ISO 8601: "2026-04-15T07:30:00"
    note: Optional[str] = ""


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _load_doses() -> list[dict]:
    if not DOSE_LOG_PATH.exists():
        return []
    with DOSE_LOG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _save_doses(doses: list[dict]) -> None:
    with DOSE_LOG_PATH.open("w", encoding="utf-8") as f:
        json.dump(doses, f, ensure_ascii=False, indent=2)


def _cmax_theoretical(substance: str, dose_mg: float, weight_kg: float) -> float:
    """Cmax de dose única calculado em C(Tmax) do perfil."""
    profile = get_substance_profile(substance)
    tmax = float(profile["tmax_hours"])
    return concentration_for_substance(substance, dose_mg, tmax, weight_kg=weight_kg)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/substances")
async def getSubstances():
    """Lista todas as substâncias disponíveis no banco farmacocinético."""
    db = load_medication_database()
    result = []
    for key, profile in db.get("substances", {}).items():
        result.append({
            "id": key,
            "display_name": profile["display_name"],
            "aliases": profile.get("aliases", []),
            "dose_unit": profile.get("dose_unit", "mg"),
            "confidence": profile.get("confidence", "unknown"),
        })
    return JSONResponse(content=result)


@router.post("/doses")
async def logDose(entry: DoseEntry):
    """Registra uma dose manual com timestamp."""
    try:
        get_substance_profile(entry.substance)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Substância '{entry.substance}' não encontrada no banco",
        )

    doses = _load_doses()
    record = {
        "id": str(uuid.uuid4()),
        "substance": entry.substance,
        "dose_mg": entry.dose_mg,
        "taken_at": entry.taken_at,
        "note": entry.note or "",
        "logged_at": datetime.now(timezone.utc).isoformat(),
    }
    doses.append(record)
    _save_doses(doses)
    return JSONResponse(content=record, status_code=201)


@router.get("/doses")
async def getDoses(hours: int = Query(default=72, ge=1, le=720)):
    """Retorna doses registradas nas últimas N horas (default: 72h)."""
    doses = _load_doses()
    if not doses:
        return JSONResponse(content=[])

    cutoff_ts = datetime.now(timezone.utc).timestamp() - (hours * 3600)
    filtered = []
    for d in doses:
        try:
            taken_ts = datetime.fromisoformat(d["taken_at"]).timestamp()
            if taken_ts >= cutoff_ts:
                filtered.append(d)
        except (ValueError, KeyError):
            continue

    return JSONResponse(content=filtered)


@router.get("/curve")
async def getPKCurve(
    hours_back: int = Query(default=24, ge=1, le=72),
    hours_forward: int = Query(default=12, ge=0, le=24),
    weight_kg: float = Query(default=80.0, ge=20.0, le=200.0),
    resolution_minutes: int = Query(default=30, ge=5, le=120),
):
    """
    Calcula curvas de concentração PK (% Cmax) para substâncias com doses recentes.

    Usa superposição linear: soma C(t - t_dose) para cada dose individualmente,
    permitindo doses em horários irregulares (log manual).
    """
    all_doses = _load_doses()
    if not all_doses:
        return JSONResponse(content={"timeline": [], "curves": {}, "doses": []})

    now = datetime.now(timezone.utc)
    window_start = now.timestamp() - (hours_back * 3600)
    window_end = now.timestamp() + (hours_forward * 3600)

    # Janela de relevância: 72h pra trás (cobre meia-vida do escitalopram 2x)
    relevant_cutoff = now.timestamp() - 72 * 3600
    relevant_doses = []
    for d in all_doses:
        try:
            taken_ts = datetime.fromisoformat(d["taken_at"]).timestamp()
            if taken_ts >= relevant_cutoff:
                relevant_doses.append({**d, "taken_ts": taken_ts})
        except (ValueError, KeyError):
            continue

    if not relevant_doses:
        return JSONResponse(content={"timeline": [], "curves": {}, "doses": []})

    # Grid de tempo com resolução configurável
    step_seconds = resolution_minutes * 60
    n_points = int((window_end - window_start) / step_seconds) + 1
    timeline_ts = [window_start + i * step_seconds for i in range(n_points)]
    timeline_iso = [
        datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M")
        for ts in timeline_ts
    ]

    # Agrupar por substância
    by_substance: dict[str, list[dict]] = {}
    for d in relevant_doses:
        by_substance.setdefault(d["substance"], []).append(d)

    curves = {}
    for substance, doses in by_substance.items():
        try:
            profile = get_substance_profile(substance)
            cmax_ref = _cmax_theoretical(substance, doses[0]["dose_mg"], weight_kg)
            if cmax_ref <= 0:
                continue
        except (KeyError, ValueError):
            continue

        curve_points = []
        for grid_ts in timeline_ts:
            total_conc = 0.0
            for dose in doses:
                t_hours = (grid_ts - dose["taken_ts"]) / 3600.0
                if t_hours < 0:
                    continue
                try:
                    total_conc += concentration_for_substance(
                        substance, dose["dose_mg"], t_hours, weight_kg=weight_kg
                    )
                except ValueError:
                    pass
            # Cap em 200% pra não quebrar o eixo em acumulação extrema
            curve_points.append(round(min((total_conc / cmax_ref) * 100, 200), 2))

        curves[substance] = {
            "display_name": profile["display_name"],
            "points": curve_points,
        }

    return JSONResponse(content={
        "timeline": timeline_iso,
        "curves": curves,
        "doses": [
            {
                "substance": d["substance"],
                "dose_mg": d["dose_mg"],
                "taken_at": d["taken_at"],
                "note": d["note"],
            }
            for d in relevant_doses
        ],
    })


@router.get("/now")
async def getPKNow(weight_kg: float = Query(default=80.0, ge=20.0, le=200.0)):
    """Concentração atual (% Cmax) de cada substância com doses nas últimas 72h."""
    all_doses = _load_doses()
    now = datetime.now(timezone.utc)

    if not all_doses:
        return JSONResponse(content={"timestamp": now.isoformat(), "levels": {}})

    cutoff_ts = now.timestamp() - 72 * 3600
    by_substance: dict[str, list[dict]] = {}
    for d in all_doses:
        try:
            taken_ts = datetime.fromisoformat(d["taken_at"]).timestamp()
            if taken_ts >= cutoff_ts:
                by_substance.setdefault(d["substance"], []).append(
                    {**d, "taken_ts": taken_ts}
                )
        except (ValueError, KeyError):
            continue

    levels = {}
    for substance, doses in by_substance.items():
        try:
            profile = get_substance_profile(substance)
            cmax_ref = _cmax_theoretical(substance, doses[0]["dose_mg"], weight_kg)
            if cmax_ref <= 0:
                continue

            total_conc = 0.0
            for dose in doses:
                t_hours = (now.timestamp() - dose["taken_ts"]) / 3600.0
                if t_hours < 0:
                    continue
                total_conc += concentration_for_substance(
                    substance, dose["dose_mg"], t_hours, weight_kg=weight_kg
                )

            levels[substance] = {
                "display_name": profile["display_name"],
                "pct_cmax": round(min((total_conc / cmax_ref) * 100, 200), 1),
            }
        except (KeyError, ValueError):
            continue

    return JSONResponse(content={"timestamp": now.isoformat(), "levels": levels})
