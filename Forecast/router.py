"""
Forecast — projeção IA de 5 dias futuros sobre DailySnapshot[].

Endpoint único: POST /forecast
- Recebe contexto compacto (últimos dias úteis) + resumo de médias recentes.
- Retorna APENAS os 5 dias futuros (não merged com originais).
- Cache md5 em dict módulo-level (single-user, sem Redis).
- IA call sync embrulhado em asyncio.to_thread.

Provider configurável por env:
- `FORECAST_AI_PROVIDER=gemini|openai` (default: gemini)
- `GEMINI_API_KEY` ou `OPENAI_API_KEY`
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter()

def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


AI_PROVIDER = os.environ.get("FORECAST_AI_PROVIDER", "gemini").strip().lower()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini").strip() or "gpt-5-mini"
OPENAI_API_BASE = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
ENV_YAML_PATH = Path("/root/GEMINI_API/env.yml")
FORECAST_HORIZON = 5
FORECAST_CONTEXT_MAX_DAYS = 45
CACHE_TTL_SECONDS = _env_int("FORECAST_CACHE_TTL_SECONDS", 3600)
CACHE_MAX_ITEMS = _env_int("FORECAST_CACHE_MAX_ITEMS", 256)

_cache: dict[str, dict[str, Any]] = {}


# ─── Helpers de provider ─────────────────────────────────────────────────────

def _load_key_from_yaml(key_name: str) -> str:
    if not ENV_YAML_PATH.exists():
        return ""
    try:
        import yaml
        with ENV_YAML_PATH.open(encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        return str(cfg.get(key_name) or "").strip()
    except Exception:
        return ""


def _load_gemini_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    return _load_key_from_yaml("GEMINI_API_KEY")


def _load_openai_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    return _load_key_from_yaml("OPENAI_API_KEY")


def _call_gemini(prompt: str) -> str:
    from google.genai.client import Client as GeminiClient
    from google.genai import types as gtypes

    api_key = _load_gemini_api_key()
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


def _call_openai(prompt: str) -> str:
    api_key = _load_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada (env var ou /root/GEMINI_API/env.yml)")

    payload = {
        "model": OPENAI_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OPENAI_API_BASE}/chat/completions",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI HTTP {exc.code}: {body[:300]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenAI request failed: {exc}") from exc

    parsed = json.loads(raw)
    choices = parsed.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("OpenAI retornou payload sem choices")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return content
    raise ValueError("OpenAI retornou content vazio ou em formato não suportado")


def _call_model(prompt: str) -> str:
    provider = AI_PROVIDER
    if provider in ("openai", "gpt"):
        return _call_openai(prompt)
    if provider in ("gemini", "google"):
        return _call_gemini(prompt)
    raise RuntimeError(f"FORECAST_AI_PROVIDER inválido: {provider}")


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


def _cache_get(key: str) -> Optional[dict[str, Any]]:
    hit = _cache.get(key)
    if not hit:
        return None
    now = time.time()
    created_at = float(hit.get("_created_at", 0))
    if now - created_at > CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return hit


def _cache_set(key: str, payload: dict[str, Any]) -> None:
    if len(_cache) >= CACHE_MAX_ITEMS:
        oldest_key = min(
            _cache,
            key=lambda cache_key: float(_cache[cache_key].get("_created_at", 0)),
        )
        _cache.pop(oldest_key, None)
    _cache[key] = {
        "_created_at": time.time(),
        **payload,
    }


# ─── Modelos ─────────────────────────────────────────────────────────────────

class ForecastRequest(BaseModel):
    snapshots: list[dict]
    horizon: int = Field(default=5, ge=1, le=14)
    valid_real_days: int = Field(default=0)
    rolling_summary: Optional[dict[str, Any]] = None


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

FORECAST_SIGNAL_FIELDS = (
    "sleepTotalHours",
    "hrvSdnn",
    "restingHeartRate",
    "activeEnergyKcal",
    "exerciseMinutes",
    "valence",
)


def _to_float_or_none(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _compact_snapshot(snapshot: dict[str, Any]) -> Optional[dict[str, Any]]:
    d = snapshot.get("date")
    if not isinstance(d, str) or not d:
        return None

    values = snapshot.get("values") if isinstance(snapshot.get("values"), dict) else None
    if values is None:
        health = snapshot.get("health") if isinstance(snapshot.get("health"), dict) else {}
        mood = snapshot.get("mood") if isinstance(snapshot.get("mood"), dict) else {}
        values = {
            "sleepTotalHours": health.get("sleepTotalHours"),
            "hrvSdnn": health.get("hrvSdnn"),
            "restingHeartRate": health.get("restingHeartRate"),
            "activeEnergyKcal": health.get("activeEnergyKcal"),
            "exerciseMinutes": health.get("exerciseMinutes"),
            "valence": mood.get("valence"),
        }

    compact_values = {field: _to_float_or_none(values.get(field)) for field in FORECAST_SIGNAL_FIELDS}
    has_signal = any(value is not None for value in compact_values.values())
    if not has_signal:
        return None

    return {"date": d, "values": compact_values}


def _select_recent_context(snapshots: list[dict[str, Any]], max_days: int = FORECAST_CONTEXT_MAX_DAYS) -> list[dict[str, Any]]:
    compacted = [_compact_snapshot(snapshot) for snapshot in snapshots]
    filtered = [snapshot for snapshot in compacted if snapshot is not None]
    filtered.sort(key=lambda snapshot: snapshot.get("date", ""))
    return filtered[-max_days:]


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


def _build_prompt(
    recent: list[dict],
    future_dates: list[dict[str, str]],
    cap: float,
    rolling_summary: Optional[dict[str, Any]] = None,
) -> str:
    compact = []
    for s in recent:
        values = s.get("values") if isinstance(s.get("values"), dict) else {}
        d = s.get("date", "")
        try:
            wd = WEEKDAY_PT[date.fromisoformat(d).weekday()] if d else "?"
        except ValueError:
            wd = "?"
        compact.append({
            "date": d,
            "weekday": wd,
            "sleepTotalHours": values.get("sleepTotalHours"),
            "hrvSdnn": values.get("hrvSdnn"),
            "restingHeartRate": values.get("restingHeartRate"),
            "activeEnergyKcal": values.get("activeEnergyKcal"),
            "exerciseMinutes": values.get("exerciseMinutes"),
            "valence": values.get("valence"),
        })

    future_list = [f"{fd['date']} ({fd['weekday']})" for fd in future_dates]
    summary_block = json.dumps(
        rolling_summary or {
            "window_days": 7,
            "sample_days": 0,
            "means": {field: None for field in FORECAST_SIGNAL_FIELDS},
        },
        ensure_ascii=False,
        indent=2,
    )

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

MÉDIAS MÓVEIS RECENTES (âncora de 5-7 dias)
{summary_block}

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
1. Use as médias móveis fornecidas (janela 5-7 dias) como âncora e ajuste fino pelas tendências dos últimos dias reais.
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
                "pulseTemperatureC": None,
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
    context = _select_recent_context(body.snapshots)
    future_dates = _build_future_dates(context, body.horizon)
    if not future_dates:
        return JSONResponse(content={
            "forecasted_snapshots": [],
            "meta": {"cached": False, "error": "Sem snapshots para derivar datas futuras",
                     "forecasted_dates": [], "max_confidence": 0.0},
            "signals": [],
        })

    cap = _compute_confidence_cap(body.valid_real_days)
    recent = context[-30:]
    rolling_summary = body.rolling_summary if isinstance(body.rolling_summary, dict) else None

    cache_key = hashlib.md5(
        json.dumps({
            "recent": recent,
            "future": future_dates,
            "horizon": body.horizon,
            "cap": cap,
            "summary": rolling_summary,
        }, sort_keys=True, default=str).encode()
    ).hexdigest()

    hit = _cache_get(cache_key)
    if hit:
        return JSONResponse(content={
            "forecasted_snapshots": hit["forecasted_snapshots"],
            "meta": {**hit["meta"], "cached": True},
            "signals": hit["signals"],
        })

    prompt = _build_prompt(recent, future_dates, cap, rolling_summary)

    try:
        raw = await asyncio.to_thread(_call_model, prompt)
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
        _cache_set(cache_key, {"forecasted_snapshots": forecasted, "meta": meta, "signals": signals})
        return JSONResponse(content={"forecasted_snapshots": forecasted, "meta": meta, "signals": signals})
    except Exception as exc:
        return JSONResponse(content={
            "forecasted_snapshots": [],
            "meta": {"cached": False, "error": f"{type(exc).__name__}: {exc}",
                     "forecasted_dates": [], "max_confidence": cap},
            "signals": [],
        })
