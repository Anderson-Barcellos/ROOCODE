"""
Forecast — projeção Gemini de 5 dias futuros sobre DailySnapshot[].

Endpoint único: POST /forecast
- Recebe snapshots recentes + valid_real_days (pra cap de confiança).
- Retorna APENAS os 5 dias futuros (não merged com originais).
- Cache md5 do payload em dict módulo-level (single-user, sem Redis).
- Gemini call sync embrulhado em asyncio.to_thread.

Reusa helpers de Interpolate/router.py (copiados verbatim): _load_api_key,
_call_gemini, _strip_fences, _classify_valence.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter()

GEMINI_MODEL = "gemini-2.5-flash"
ENV_YAML_PATH = Path("/root/GEMINI_API/env.yml")
FORECAST_HORIZON = 5

_cache: dict[str, dict[str, Any]] = {}


# ─── Helpers (verbatim de Interpolate/router.py) ─────────────────────────────

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


def _call_gemini(prompt: str) -> str:
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


def _strip_fences(raw: str) -> str:
    s = raw.strip()
    if not s.startswith("```"):
        return s
    lines = s.split("\n")
    lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _classify_valence(valence: float) -> str:
    if valence >= 0.75:
        return "Muito Agradável"
    if valence >= 0.35:
        return "Agradável"
    if valence > 0.1:
        return "Levemente Agradável"
    if valence > -0.1:
        return "Neutro"
    if valence > -0.35:
        return "Levemente Desagradável"
    if valence > -0.75:
        return "Desagradável"
    return "Muito Desagradável"


# ─── Modelos ─────────────────────────────────────────────────────────────────

class ForecastRequest(BaseModel):
    snapshots: list[dict]
    horizon: int = Field(default=5)
    valid_real_days: int = Field(default=0)


class ForecastSignal(BaseModel):
    field: str
    observation: str


class ForecastMeta(BaseModel):
    cached: bool = False
    error: Optional[str] = None
    forecasted_dates: list[str] = Field(default_factory=list)
    max_confidence: float = 0.0


class ForecastResponse(BaseModel):
    forecasted_snapshots: list[dict]
    meta: ForecastMeta
    signals: list[ForecastSignal] = Field(default_factory=list)


# ─── Forecast-specific helpers ───────────────────────────────────────────────

WEEKDAY_PT = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira",
              "Sexta-feira", "Sábado", "Domingo"]


def _build_future_dates(snapshots: list[dict], horizon: int) -> list[dict[str, str]]:
    have = {s.get("date") for s in snapshots if s.get("date")}
    if not have:
        return []
    latest = max(have)
    base = date.fromisoformat(latest)
    result = []
    for i in range(1, horizon + 1):
        d = base + timedelta(days=i)
        result.append({
            "date": d.isoformat(),
            "weekday": WEEKDAY_PT[d.weekday()],
        })
    return result


def _compute_confidence_cap(valid_real_days: int) -> float:
    if valid_real_days < 14:
        return 0.40
    if valid_real_days < 30:
        return 0.70
    if valid_real_days < 60:
        return 0.82
    return 0.90


def _build_prompt(recent: list[dict], future_dates: list[dict[str, str]], cap: float) -> str:
    compact = []
    for s in recent:
        health = s.get("health") or {}
        mood = s.get("mood") or {}
        d = s.get("date", "")
        try:
            wd = WEEKDAY_PT[date.fromisoformat(d).weekday()] if d else "?"
        except ValueError:
            wd = "?"
        compact.append({
            "date": d,
            "weekday": wd,
            "sleepTotalHours": health.get("sleepTotalHours"),
            "hrvSdnn": health.get("hrvSdnn"),
            "restingHeartRate": health.get("restingHeartRate"),
            "activeEnergyKcal": health.get("activeEnergyKcal"),
            "exerciseMinutes": health.get("exerciseMinutes"),
            "valence": mood.get("valence"),
        })

    future_list = [f"{fd['date']} ({fd['weekday']})" for fd in future_dates]

    return f"""Você é um analista clínico projetando os próximos {len(future_dates)} dias de dados fisiológicos no dashboard de saúde de um paciente específico. Sua saída alimenta um sistema de visualização; precisão e humildade são obrigatórias.

PROJEÇÃO: você está estimando dias **futuros** a partir de hoje. Não há dados reais para estes dias. A incerteza cresce com o horizonte temporal — cada dia adicional deve ter `confidence` menor ou igual ao dia anterior.

PACIENTE
Masculino, 39 anos, 91 kg, Santa Cruz do Sul/RS. Neuropsiquiatra em atividade, com TDAH + TOC desde a infância. Perfil cardiometabólico sem comorbidades relevantes.

REGIME FARMACOLÓGICO (steady-state atingido em todas as drogas contínuas)
- Escitalopram 40 mg/dia (ISRS; t½ ~30 h; steady-state em ~2 semanas; dose-resposta estável; efeito em HRV pode ser leve supressão ~5-10 %; efeito em valence basal já atingiu platô).
- Lisdexanfetamina 200 mg/dia matinal (pró-droga de d-anfetamina; Tmax ~3-4 h após ingesta; duração de efeito ~12-14 h; decay vespertino previsível; impacta exerciseMinutes e activeEnergyKcal no período diurno; mínimo efeito em HRV noturno).
- Lamotrigina 200 mg/dia (estabilizador; t½ ~25 h; steady-state atingido; sem picos intradia clinicamente relevantes; efeito crônico em valence basal).
- Clonazepam PRN (benzodiazepínico; uso esporádico, não diário; pode reduzir HRV e energia ativa no dia de uso — assuma ausência salvo sinal contrário nos dados).

DADOS RECENTES ({len(compact)} dias, incluindo dia-da-semana)
{json.dumps(compact, ensure_ascii=False, indent=2)}

DATAS A PROJETAR ({len(future_dates)} dias futuros)
{json.dumps(future_list, ensure_ascii=False)}

RETORNO — JSON com duas chaves:
{{
  "forecasts": [
    {{
      "date": "YYYY-MM-DD",
      "weekday": "Nome-do-dia",
      "values": {{
        "sleepTotalHours": number | null,
        "hrvSdnn": number | null,
        "restingHeartRate": number | null,
        "activeEnergyKcal": number | null,
        "exerciseMinutes": number | null,
        "valence": number | null
      }},
      "confidence": 0.0–{cap:.2f},
      "rationale": "justificativa clínica curta em PT-BR"
    }}
  ],
  "signals": [
    {{
      "field": "campo_relevante",
      "observation": "observação descritiva em PT-BR sobre tendência ou sinal a vigiar"
    }}
  ]
}}

DIRETRIZES DE PROJEÇÃO
1. Privilegie tendências dos últimos 7 dias reais sobre médias de longo prazo.
2. WEEKDAY EFFECT é real: fim de semana (Sábado, Domingo) tipicamente aumenta sleepTotalHours e reduz exerciseMinutes/activeEnergyKcal. Dias úteis tendem ao oposto.
3. Como o regime está em steady-state, não introduza variação atribuível a medicação — as drogas são parte do baseline.
4. valence é escala -1 (muito desagradável) a +1 (muito agradável); zero é neutro. Padrões de humor são autocorrelacionados dia-a-dia.
5. HRV (hrvSdnn) e restingHeartRate são anticorrelacionados; mantenha coerência.
6. A incerteza CRESCE com o horizonte: dia T+1 pode ter confidence mais alta que T+5.

CAP DE CONFIANÇA
Nenhum valor de `confidence` deve exceder {cap:.2f}. Este cap reflete a quantidade de dados históricos disponíveis ({len(compact)} dias recentes).

SIGNALS
Identifique 2-4 sinais observáveis a vigiar nos próximos dias. Exemplos:
- Risco de queda de HRV se padrão de exercício continuar
- Tendência de melhora/piora de valência baseada nos últimos dias
- Efeito esperado de fim-de-semana sobre exercício
Tom DESCRITIVO, não prescritivo. Sem recomendações médicas diretas.

IMPORTANTE: retorne APENAS um JSON válido. SEM markdown fences, SEM preâmbulo, SEM explicações fora do JSON.
"""


def _apply_forecasted(entries: list[dict], cap: float) -> list[dict]:
    result = []
    for entry in entries:
        d = entry.get("date")
        if not d:
            continue
        values = entry.get("values") or {}
        raw_conf = float(entry.get("confidence") or 0.3)
        conf = min(raw_conf, cap)

        health_fields = {
            "sleepTotalHours": values.get("sleepTotalHours"),
            "hrvSdnn": values.get("hrvSdnn"),
            "restingHeartRate": values.get("restingHeartRate"),
            "activeEnergyKcal": values.get("activeEnergyKcal"),
            "exerciseMinutes": values.get("exerciseMinutes"),
        }
        has_health = any(v is not None for v in health_fields.values())
        health_block = None
        if has_health:
            health_block = {
                "date": d,
                "interpolated": False,
                **{k: (None if v is None else float(v)) for k, v in health_fields.items()},
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
            valence_num = float(mood_valence)
            mood_block = {
                "date": d,
                "interpolated": False,
                "valence": valence_num,
                "valenceClass": _classify_valence(valence_num),
                "entryCount": 0,
                "labels": [],
                "associations": [],
            }

        result.append({
            "date": d,
            "health": health_block,
            "mood": mood_block,
            "medications": None,
            "interpolated": False,
            "forecasted": True,
            "forecastConfidence": conf,
            "forecastRationale": str(entry.get("rationale") or ""),
        })

    return sorted(result, key=lambda s: s.get("date", ""))


# ─── Endpoint ────────────────────────────────────────────────────────────────

@router.post("")
async def forecast(body: ForecastRequest) -> JSONResponse:
    future_dates = _build_future_dates(body.snapshots, body.horizon)
    if not future_dates:
        return JSONResponse(content={
            "forecasted_snapshots": [],
            "meta": {"cached": False, "error": "Sem snapshots para derivar datas futuras",
                     "forecasted_dates": [], "max_confidence": 0.0},
            "signals": [],
        })

    cap = _compute_confidence_cap(body.valid_real_days)

    cache_key = hashlib.md5(
        json.dumps({
            "s": body.snapshots, "horizon": body.horizon, "cap": cap,
        }, sort_keys=True, default=str).encode()
    ).hexdigest()

    if cache_key in _cache:
        hit = _cache[cache_key]
        return JSONResponse(content={
            "forecasted_snapshots": hit["forecasted_snapshots"],
            "meta": {**hit["meta"], "cached": True},
            "signals": hit["signals"],
        })

    recent = sorted(body.snapshots, key=lambda s: s.get("date", ""))[-30:]
    prompt = _build_prompt(recent, future_dates, cap)

    try:
        raw = await asyncio.to_thread(_call_gemini, prompt)
        clean = _strip_fences(raw)
        parsed = json.loads(clean)
        if not isinstance(parsed, dict):
            raise ValueError(f"Gemini retornou {type(parsed).__name__}, esperado dict")

        forecasts = parsed.get("forecasts", [])
        if not isinstance(forecasts, list):
            raise ValueError(f"'forecasts' é {type(forecasts).__name__}, esperado list")

        signals_raw = parsed.get("signals", [])
        if not isinstance(signals_raw, list):
            signals_raw = []

        forecasted = _apply_forecasted(forecasts, cap)
        signals = [
            {"field": s.get("field", ""), "observation": s.get("observation", "")}
            for s in signals_raw if isinstance(s, dict) and s.get("observation")
        ]

        meta = {
            "cached": False, "error": None,
            "forecasted_dates": [f["date"] for f in forecasted],
            "max_confidence": cap,
        }
        _cache[cache_key] = {"forecasted_snapshots": forecasted, "meta": meta, "signals": signals}
        return JSONResponse(content={"forecasted_snapshots": forecasted, "meta": meta, "signals": signals})
    except Exception as exc:
        return JSONResponse(content={
            "forecasted_snapshots": [],
            "meta": {"cached": False, "error": f"{type(exc).__name__}: {exc}",
                     "forecasted_dates": [], "max_confidence": cap},
            "signals": [],
        })
