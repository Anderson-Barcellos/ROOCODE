from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
import json
import re
import uuid

from Farma.math import (
    get_substance_profile,
    load_medication_database,
)

router = APIRouter()
DOSE_LOG_PATH = Path(__file__).parent / "dose_log.json"
REGIMEN_CONFIG_PATH = Path(__file__).parent / "regimen_config.json"
SUBSTANCES_CUSTOM_PATH = Path(__file__).parent / "substances_custom.json"
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
SUBSTANCE_KEY_RE = re.compile(r"^[a-z0-9_]{2,40}$")


# ─── Modelos ──────────────────────────────────────────────────────────────────

class DoseEntry(BaseModel):
    substance: str
    dose_mg: float
    taken_at: str  # ISO 8601: "2026-04-15T07:30:00"
    note: Optional[str] = ""


class DoseUpdate(BaseModel):
    substance: Optional[str] = None
    dose_mg: Optional[float] = None
    taken_at: Optional[str] = None
    note: Optional[str] = None


class SubstanceEntry(BaseModel):
    display_name: str
    aliases: list[str] = []
    model_supported: bool = True
    confidence: str = "medium"
    dose_unit: str = "mg"
    time_unit: str = "hours"
    bioavailability: float
    half_life_hours: float
    tmax_hours: float
    ke_per_hour: float
    ka_per_hour: float
    vd_l_per_kg: Optional[float] = None
    vd_l: Optional[float] = None
    vd_basis: Optional[str] = None
    therapeutic_range_min: Optional[float] = None
    therapeutic_range_max: Optional[float] = None
    therapeutic_range_unit: Optional[str] = None
    ke0_per_hour: Optional[float] = None
    notes: list[str] = []
    sources: list[str] = []


class SubstanceUpdate(BaseModel):
    display_name: Optional[str] = None
    aliases: Optional[list[str]] = None
    model_supported: Optional[bool] = None
    confidence: Optional[str] = None
    dose_unit: Optional[str] = None
    time_unit: Optional[str] = None
    bioavailability: Optional[float] = None
    half_life_hours: Optional[float] = None
    tmax_hours: Optional[float] = None
    ke_per_hour: Optional[float] = None
    ka_per_hour: Optional[float] = None
    vd_l_per_kg: Optional[float] = None
    vd_l: Optional[float] = None
    vd_basis: Optional[str] = None
    therapeutic_range_min: Optional[float] = None
    therapeutic_range_max: Optional[float] = None
    therapeutic_range_unit: Optional[str] = None
    ke0_per_hour: Optional[float] = None
    notes: Optional[list[str]] = None
    sources: Optional[list[str]] = None


class MedicationRegimenEntry(BaseModel):
    id: str
    substance: str
    dose_mg: float
    times: list[str]
    days_of_week: list[int]
    active: bool
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    color: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _default_regimen() -> list[dict]:
    return [
        {
            "id": "lexapro-daily",
            "substance": "lexapro",
            "dose_mg": 40.0,
            "times": ["07:00"],
            "days_of_week": [0, 1, 2, 3, 4, 5, 6],
            "active": True,
            "start_date": None,
            "end_date": None,
            "color": "#0f766e",
        },
        {
            "id": "venvanse-weekdays",
            "substance": "venvanse",
            "dose_mg": 200.0,
            "times": ["07:00"],
            "days_of_week": [1, 2, 3, 4, 5],
            "active": True,
            "start_date": None,
            "end_date": None,
            "color": "#7c3aed",
        },
        {
            "id": "lamictal-nightly",
            "substance": "lamictal",
            "dose_mg": 200.0,
            "times": ["22:00"],
            "days_of_week": [0, 1, 2, 3, 4, 5, 6],
            "active": True,
            "start_date": None,
            "end_date": None,
            "color": "#2563eb",
        },
    ]


def _validate_time(value: str) -> None:
    if not TIME_RE.match(value):
        raise ValueError("times deve usar HH:mm")
    hour, minute = [int(part) for part in value.split(":")]
    if hour > 23 or minute > 59:
        raise ValueError("times deve usar horario valido")


def _validate_date(value: Optional[str], field_name: str) -> None:
    if value is None:
        return
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"{field_name} deve usar yyyy-MM-dd") from exc


def _normalize_regimen_entry(entry: MedicationRegimenEntry) -> dict:
    try:
        profile = get_substance_profile(entry.substance)
    except KeyError as exc:
        raise ValueError(f"substancia invalida: {entry.substance}") from exc

    if entry.dose_mg <= 0:
        raise ValueError("dose_mg deve ser maior que zero")
    if not entry.times:
        raise ValueError("times deve ter pelo menos um horario")
    for time_value in entry.times:
        _validate_time(time_value)
    if not entry.days_of_week:
        raise ValueError("days_of_week deve ter pelo menos um dia")
    if any(day < 0 or day > 6 for day in entry.days_of_week):
        raise ValueError("days_of_week deve ficar entre 0 e 6")
    _validate_date(entry.start_date, "start_date")
    _validate_date(entry.end_date, "end_date")

    return {
        "id": entry.id.strip() or str(uuid.uuid4()),
        "substance": profile["id"],
        "dose_mg": float(entry.dose_mg),
        "times": sorted(set(entry.times)),
        "days_of_week": sorted(set(entry.days_of_week)),
        "active": bool(entry.active),
        "start_date": entry.start_date,
        "end_date": entry.end_date,
        "color": entry.color,
    }

def _load_doses() -> list[dict]:
    if not DOSE_LOG_PATH.exists():
        return []
    with DOSE_LOG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _save_doses(doses: list[dict]) -> None:
    with DOSE_LOG_PATH.open("w", encoding="utf-8") as f:
        json.dump(doses, f, ensure_ascii=False, indent=2)


def _find_dose(dose_id: str, doses: list[dict]) -> Optional[int]:
    """Retorna o índice da dose com id correspondente, ou None se não existir."""
    for index, record in enumerate(doses):
        if record.get("id") == dose_id:
            return index
    return None


def _validate_iso_timestamp(value: str) -> None:
    try:
        datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("taken_at deve ser ISO 8601 válido") from exc


def _load_custom_substances() -> dict:
    """Retorna o JSON de substâncias customizadas; cria dict vazio se arquivo ausente."""
    if not SUBSTANCES_CUSTOM_PATH.exists():
        return {"schema_version": 1, "substances": {}}
    with SUBSTANCES_CUSTOM_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, dict) or "substances" not in raw:
        raise ValueError("substances_custom.json malformado")
    return raw


def _save_custom_substances(data: dict) -> None:
    with SUBSTANCES_CUSTOM_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _merged_substances() -> tuple[dict, set[str]]:
    """
    Retorna (merged_dict, set_of_builtin_keys).
    Custom sobrescreve built-in em caso de colisão (defensive — os endpoints POST bloqueiam).
    """
    built_in = load_medication_database().get("substances", {}) or {}
    custom = _load_custom_substances().get("substances", {}) or {}
    merged = {**built_in, **custom}
    return merged, set(built_in.keys())


def _resolve_substance_any(name: str) -> tuple[str, dict]:
    """Procura uma substância no catálogo merged por chave ou alias. Raises KeyError."""
    merged, _ = _merged_substances()
    for key, profile in merged.items():
        if key == name:
            return key, profile
        if name in (profile.get("aliases") or []):
            return key, profile
    raise KeyError(name)


def _validate_substance_pk(entry: SubstanceEntry) -> None:
    """Checa faixas mínimas pros campos farmacocinéticos."""
    if not (0 < entry.bioavailability <= 1.5):
        raise ValueError("bioavailability deve estar entre 0 e 1.5")
    if entry.half_life_hours <= 0:
        raise ValueError("half_life_hours deve ser > 0")
    if entry.tmax_hours <= 0:
        raise ValueError("tmax_hours deve ser > 0")
    if entry.ke_per_hour <= 0 or entry.ka_per_hour <= 0:
        raise ValueError("ke_per_hour e ka_per_hour devem ser > 0")
    if entry.vd_l_per_kg is None and entry.vd_l is None:
        raise ValueError("Informar vd_l_per_kg OU vd_l")
    if entry.vd_l_per_kg is not None and entry.vd_l_per_kg <= 0:
        raise ValueError("vd_l_per_kg deve ser > 0")
    if entry.vd_l is not None and entry.vd_l <= 0:
        raise ValueError("vd_l deve ser > 0")


def _entry_to_dict(entry: SubstanceEntry) -> dict:
    """Converte modelo Pydantic num dict pronto pra persistência, removendo None."""
    data = entry.model_dump()
    return {k: v for k, v in data.items() if v is not None}


def _serialize_substance(key: str, profile: dict, is_custom: bool, full: bool) -> dict:
    """Monta o payload de saída pro endpoint GET /farma/substances."""
    base = {
        "id": key,
        "display_name": profile.get("display_name", key),
        "aliases": profile.get("aliases", []),
        "dose_unit": profile.get("dose_unit", "mg"),
        "confidence": profile.get("confidence", "unknown"),
        "is_custom": is_custom,
    }
    if not full:
        return base
    extra_fields = (
        "model_supported", "time_unit", "bioavailability", "half_life_hours",
        "tmax_hours", "ke_per_hour", "ka_per_hour", "vd_l_per_kg", "vd_l",
        "vd_basis", "therapeutic_range_min", "therapeutic_range_max",
        "therapeutic_range_unit", "ke0_per_hour", "notes", "sources",
    )
    for field in extra_fields:
        base[field] = profile.get(field)
    return base


def _load_regimen() -> list[dict]:
    if not REGIMEN_CONFIG_PATH.exists():
        regimen = _default_regimen()
        _save_regimen(regimen)
        return regimen
    with REGIMEN_CONFIG_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise ValueError("regimen_config.json deve conter uma lista")
    return [
        _normalize_regimen_entry(MedicationRegimenEntry(**item))
        for item in raw
    ]


def _save_regimen(regimen: list[dict]) -> None:
    with REGIMEN_CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(regimen, f, ensure_ascii=False, indent=2)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/substances")
async def getSubstances(full: bool = Query(default=False)):
    """
    Lista todas as substâncias disponíveis (built-in + custom merged).
    Use ?full=true pra receber todos os campos PK (necessário pro MedicationCatalogEditor
    e para o chart computar curvas localmente).
    """
    try:
        merged, builtin_keys = _merged_substances()
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    result = [
        _serialize_substance(key, profile, is_custom=key not in builtin_keys, full=full)
        for key, profile in merged.items()
    ]
    return JSONResponse(content=result)


@router.post("/substances/{key}")
async def createSubstance(key: str, entry: SubstanceEntry):
    """Cria uma substância custom. 409 se a chave já existir em built-in ou custom."""
    if not SUBSTANCE_KEY_RE.match(key):
        raise HTTPException(
            status_code=422,
            detail="key deve conter apenas [a-z0-9_], 2–40 caracteres",
        )
    try:
        _validate_substance_pk(entry)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    merged, _ = _merged_substances()
    if key in merged:
        raise HTTPException(
            status_code=409,
            detail=f"Substância '{key}' já existe (built-in ou custom)",
        )

    custom_store = _load_custom_substances()
    custom_store["substances"][key] = _entry_to_dict(entry)
    _save_custom_substances(custom_store)
    load_medication_database.cache_clear()

    return JSONResponse(
        content=_serialize_substance(key, custom_store["substances"][key], is_custom=True, full=True),
        status_code=201,
    )


@router.put("/substances/{key}")
async def updateSubstance(key: str, patch: SubstanceUpdate):
    """
    Edita uma substância custom. Built-ins são imutáveis (409) — clone como nova custom se precisar override.
    """
    _, builtin_keys = _merged_substances()
    if key in builtin_keys:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Substância '{key}' é built-in e imutável. "
                "Crie uma custom com chave diferente para override."
            ),
        )

    custom_store = _load_custom_substances()
    if key not in custom_store["substances"]:
        raise HTTPException(status_code=404, detail=f"Substância custom '{key}' não encontrada")

    current = custom_store["substances"][key]
    updates = patch.model_dump(exclude_unset=True)
    merged_profile = {**current, **updates}
    # Re-valida via SubstanceEntry pra garantir consistência PK
    try:
        _validate_substance_pk(SubstanceEntry(**merged_profile))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    custom_store["substances"][key] = merged_profile
    _save_custom_substances(custom_store)
    load_medication_database.cache_clear()

    return JSONResponse(
        content=_serialize_substance(key, merged_profile, is_custom=True, full=True)
    )


@router.delete("/substances/{key}")
async def deleteSubstance(key: str):
    """
    Remove uma substância custom. Built-ins retornam 409.
    Logs de dose com essa substância ficam órfãos (frontend mostra graceful fallback).
    """
    _, builtin_keys = _merged_substances()
    if key in builtin_keys:
        raise HTTPException(
            status_code=409,
            detail=f"Substância '{key}' é built-in, não pode ser removida",
        )

    custom_store = _load_custom_substances()
    if key not in custom_store["substances"]:
        raise HTTPException(status_code=404, detail=f"Substância custom '{key}' não encontrada")

    removed = custom_store["substances"].pop(key)
    _save_custom_substances(custom_store)
    load_medication_database.cache_clear()

    return JSONResponse(content={"id": key, "deleted": True, "display_name": removed.get("display_name", key)})


@router.get("/regimen")
async def getRegimen():
    """Retorna o regime editavel usado para expandir doses previstas."""
    try:
        regimen = _load_regimen()
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return JSONResponse(content=regimen)


@router.post("/doses")
async def logDose(entry: DoseEntry):
    """Registra uma dose manual com timestamp. Valida contra catálogo merged (built-in + custom)."""
    try:
        canonical_key, _ = _resolve_substance_any(entry.substance)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Substância '{entry.substance}' não encontrada no catálogo",
        )

    doses = _load_doses()
    record = {
        "id": str(uuid.uuid4()),
        "substance": canonical_key,
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


@router.put("/doses/{dose_id}")
async def updateDose(dose_id: str, patch: DoseUpdate):
    """Edita uma dose logada (dose_mg, taken_at, substance, note). Campos não enviados ficam intactos."""
    doses = _load_doses()
    index = _find_dose(dose_id, doses)
    if index is None:
        raise HTTPException(status_code=404, detail=f"Dose '{dose_id}' não encontrada")

    record = doses[index]

    if patch.substance is not None:
        try:
            profile = get_substance_profile(patch.substance)
        except KeyError:
            raise HTTPException(
                status_code=404,
                detail=f"Substância '{patch.substance}' não encontrada no banco",
            )
        record["substance"] = profile["id"]

    if patch.dose_mg is not None:
        if patch.dose_mg <= 0:
            raise HTTPException(status_code=422, detail="dose_mg deve ser maior que zero")
        record["dose_mg"] = float(patch.dose_mg)

    if patch.taken_at is not None:
        try:
            _validate_iso_timestamp(patch.taken_at)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        record["taken_at"] = patch.taken_at

    if patch.note is not None:
        record["note"] = patch.note

    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    doses[index] = record
    _save_doses(doses)
    return JSONResponse(content=record)


@router.delete("/doses/{dose_id}")
async def deleteDose(dose_id: str):
    """Remove permanentemente uma dose do log."""
    doses = _load_doses()
    index = _find_dose(dose_id, doses)
    if index is None:
        raise HTTPException(status_code=404, detail=f"Dose '{dose_id}' não encontrada")

    removed = doses.pop(index)
    _save_doses(doses)
    return JSONResponse(content={"id": removed["id"], "deleted": True}, status_code=200)
