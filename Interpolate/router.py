"""
Interpolate — preenchimento Gemini de lacunas temporais em DailySnapshot[].

Endpoint único: POST /interpolate
- Recebe snapshots esparsos + strategy ("claude").
- Cache md5 do payload em dict módulo-level (single-user, sem Redis).
- Gemini call sync embrulhado em asyncio.to_thread pra não bloquear event loop.
- Fallback: parse falhou → retorna snapshots originais + meta.error.

Key loading: env var GEMINI_API_KEY com fallback pra /root/GEMINI_API/env.yml.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter()

# ─── Config ──────────────────────────────────────────────────────────────────

GEMINI_MODEL = "gemini-2.5-flash"
ENV_YAML_PATH = Path("/root/GEMINI_API/env.yml")

_cache: dict[str, dict[str, Any]] = {}


def _load_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    if ENV_YAML_PATH.exists():
        try:
            import yaml
            with ENV_YAML_PATH.open(encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            return (cfg.get("GEMINI_API_KEY") or "").strip()
        except Exception:
            return ""
    return ""


# ─── Modelos ──────────────────────────────────────────────────────────────────

class InterpolateRequest(BaseModel):
    snapshots: list[dict]  # DailySnapshot[] cru (aceita qualquer formato)
    strategy: str = Field(default="claude")  # "claude" (linear roda no frontend)


class InterpolateMeta(BaseModel):
    cached: bool = False
    error: Optional[str] = None
    filled_dates: list[str] = Field(default_factory=list)


class InterpolateResponse(BaseModel):
    snapshots: list[dict]
    meta: InterpolateMeta


# ─── Prompt (TODO Anders) ─────────────────────────────────────────────────────

def _build_prompt(sparse_snapshots: list[dict], missing_dates: list[str]) -> str:
    """
    TODO(Anders): ESTE É O PROMPT QUE MAIS AFETA QUALIDADE DO OUTPUT.

    Pontos pra tu decidir e escrever:
    - Tom clínico vs conversacional?
    - Linguagem PK explícita (Tmax, meia-vida, steady-state) ou descritiva?
    - Weekend effect: mencionar ou deixar Gemini inferir?
    - Critério pra confidence baixa: janelas de ajuste medicamentoso? início de semana?
    - Medicações ativas (escitalopram 40mg/d, lisdexanfetamina 200mg/d, lamotrigina 200mg/d)
      — incluir doses no prompt ou só nomes?
    - Retorno: JSON array estrito, sem markdown, sem preâmbulo. Pesado na instrução final.

    Baseline abaixo funciona mas é genérico. Troca livremente.
    """
    fields_to_fill = [
        "sleepTotalHours", "hrvSdnn", "restingHeartRate",
        "activeEnergyKcal", "valence", "exerciseMinutes"
    ]

    # Enxugar snapshots pra só os 6 campos-chave (economia de tokens)
    compact = []
    for s in sparse_snapshots:
        health = s.get("health") or {}
        mood = s.get("mood") or {}
        compact.append({
            "date": s.get("date"),
            "sleepTotalHours": health.get("sleepTotalHours"),
            "hrvSdnn": health.get("hrvSdnn"),
            "restingHeartRate": health.get("restingHeartRate"),
            "activeEnergyKcal": health.get("activeEnergyKcal"),
            "exerciseMinutes": health.get("exerciseMinutes"),
            "valence": mood.get("valence"),
        })

    return f"""Você é um analista de dados de saúde preenchendo lacunas temporais no dashboard pessoal do Anders.

Perfil do usuário:
- Homem, 39 anos, 91 kg, Santa Cruz do Sul/RS
- Medicação contínua: escitalopram 40mg/dia, lisdexanfetamina 200mg/dia, lamotrigina 200mg/dia
- Clonazepam PRN (não diário)

Dados disponíveis ({len(compact)} dias reais):
{json.dumps(compact, ensure_ascii=False, indent=2)}

Lacunas a preencher ({len(missing_dates)} datas):
{json.dumps(missing_dates)}

Para cada data da lacuna, retorne um objeto:
{{
  "date": "YYYY-MM-DD",
  "values": {{
    "sleepTotalHours": number | null,
    "hrvSdnn": number | null,
    "restingHeartRate": number | null,
    "activeEnergyKcal": number | null,
    "exerciseMinutes": number | null,
    "valence": number | null
  }},
  "confidence": 0.0-1.0,
  "rationale": "breve justificativa em PT-BR"
}}

Considerações:
- Day-of-week effects (fim de semana vs útil)
- Tendências locais dos últimos dias disponíveis
- Interação medicamentosa: escitalopram demora ~4 semanas pra steady-state; ajustes de dose afetam mood/sleep por 2-3 semanas
- valence é escala -1 a +1

IMPORTANTE: retorne APENAS um JSON array válido. SEM markdown fences, SEM preâmbulo, SEM explicações fora do JSON.
"""


# ─── Gemini call ──────────────────────────────────────────────────────────────

def _strip_fences(raw: str) -> str:
    """Remove ```json\\n ... \\n``` se presente."""
    s = raw.strip()
    if not s.startswith("```"):
        return s
    lines = s.split("\n")
    lines = lines[1:]  # remove ```json ou ``` da primeira linha
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _call_gemini(prompt: str) -> str:
    """Chamada sync ao Gemini 2.5 Flash. Retorna texto bruto."""
    from google.genai.client import Client as GeminiClient
    from google.genai import types as gtypes

    api_key = _load_api_key()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY não configurada (env var ou /root/GEMINI_API/env.yml)")

    client = GeminiClient(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[gtypes.Content(
            role="user",
            parts=[gtypes.Part.from_text(text=prompt)],
        )],
        config=gtypes.GenerateContentConfig(temperature=0.2),
    )
    return response.text or ""


# ─── Merge helpers ────────────────────────────────────────────────────────────

def _find_missing_dates(snapshots: list[dict]) -> list[str]:
    """
    Datas ausentes entre snapshots[0].date e snapshots[-1].date.
    Assume snapshots ordenados por date ascendente.
    """
    from datetime import date, timedelta

    if not snapshots:
        return []
    have = {s.get("date") for s in snapshots if s.get("date")}
    dates_sorted = sorted(d for d in have if d)
    if len(dates_sorted) < 2:
        return []

    start = date.fromisoformat(dates_sorted[0])
    end = date.fromisoformat(dates_sorted[-1])
    missing: list[str] = []
    cur = start + timedelta(days=1)
    while cur < end:
        iso = cur.isoformat()
        if iso not in have:
            missing.append(iso)
        cur += timedelta(days=1)
    return missing


def _apply_filled(sparse: list[dict], filled: list[dict]) -> list[dict]:
    """
    Mescla snapshots reais + dias estimados. Retorna array ordenado por date.
    Cada dia preenchido vira DailySnapshot com interpolated=true, confidence=X.
    """
    by_date = {s.get("date"): s for s in sparse if s.get("date")}

    for entry in filled:
        d = entry.get("date")
        if not d or d in by_date:
            continue
        values = entry.get("values") or {}
        health_fields = {
            "sleepTotalHours": values.get("sleepTotalHours"),
            "hrvSdnn": values.get("hrvSdnn"),
            "restingHeartRate": values.get("restingHeartRate"),
            "activeEnergyKcal": values.get("activeEnergyKcal"),
            "exerciseMinutes": values.get("exerciseMinutes"),
        }
        # Só monta health se ≥1 campo veio não-null
        has_health = any(v is not None for v in health_fields.values())
        health_block = None
        if has_health:
            health_block = {
                "date": d,
                "interpolated": True,
                **{k: (None if v is None else float(v)) for k, v in health_fields.items()},
                # Campos não preenchidos ficam null
                "sleepAsleepHours": None, "sleepInBedHours": None,
                "sleepCoreHours": None, "sleepDeepHours": None,
                "sleepRemHours": None, "sleepAwakeHours": None,
                "sleepEfficiencyPct": None, "respiratoryDisturbances": None,
                "restingEnergyKcal": None, "heartRateMin": None,
                "heartRateMax": None, "heartRateMean": None,
                "spo2": None, "respiratoryRate": None,
                "pulseTemperatureC": None, "movementMinutes": None,
                "standingMinutes": None, "daylightMinutes": None,
                "recordCount": 0, "placeholderRestingEnergyRows": 0,
            }

        mood_valence = values.get("valence")
        mood_block = None
        if mood_valence is not None:
            mood_block = {
                "date": d,
                "interpolated": True,
                "valence": float(mood_valence),
                "valenceClass": None,
                "entryCount": 0,
                "labels": [],
                "associations": [],
            }

        by_date[d] = {
            "date": d,
            "health": health_block,
            "mood": mood_block,
            "medications": None,
            "interpolated": True,
            "confidence": float(entry.get("confidence") or 0.5),
        }

    return [by_date[d] for d in sorted(by_date.keys())]


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("")
async def interpolate(body: InterpolateRequest) -> JSONResponse:
    if body.strategy != "claude":
        return JSONResponse(content={
            "snapshots": body.snapshots,
            "meta": {"cached": False, "error": f"strategy '{body.strategy}' não suportada", "filled_dates": []},
        })

    missing = _find_missing_dates(body.snapshots)
    if not missing:
        return JSONResponse(content={
            "snapshots": body.snapshots,
            "meta": {"cached": False, "error": None, "filled_dates": []},
        })

    cache_key = hashlib.md5(
        json.dumps({"s": body.snapshots, "strategy": body.strategy}, sort_keys=True, default=str).encode()
    ).hexdigest()

    if cache_key in _cache:
        hit = _cache[cache_key]
        return JSONResponse(content={
            "snapshots": hit["snapshots"],
            "meta": {**hit["meta"], "cached": True},
        })

    prompt = _build_prompt(body.snapshots, missing)

    try:
        raw = await asyncio.to_thread(_call_gemini, prompt)
        clean = _strip_fences(raw)
        filled = json.loads(clean)
        if not isinstance(filled, list):
            raise ValueError(f"Gemini retornou {type(filled).__name__}, esperado list")
        merged = _apply_filled(body.snapshots, filled)
        meta = {"cached": False, "error": None, "filled_dates": [e.get("date") for e in filled if e.get("date")]}
        _cache[cache_key] = {"snapshots": merged, "meta": meta}
        return JSONResponse(content={"snapshots": merged, "meta": meta})
    except Exception as exc:
        return JSONResponse(content={
            "snapshots": body.snapshots,
            "meta": {"cached": False, "error": f"{type(exc).__name__}: {exc}", "filled_dates": []},
        })
