"""
Forecast — projeção IA de 5 dias futuros sobre DailySnapshot[].

Endpoint único: POST /forecast
- Recebe contexto compacto (últimos dias úteis) + resumo de médias recentes.
- Retorna APENAS os 5 dias futuros (não merged com originais).
- Cache md5 em dict módulo-level (single-user, sem Redis).
- IA call sync embrulhado em asyncio.to_thread.

Provider:
- `FORECAST_AI_PROVIDER=openai` (OpenAI-only; outros providers falham explicitamente)
- OpenAI (Chat Completions) com modelo default `gpt-5.4-mini`
- `OPENAI_API_KEY` via env (fallback opcional para `/root/RooCode/.env.yml`)
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


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


AI_PROVIDER = os.environ.get("FORECAST_AI_PROVIDER", "openai").strip().lower() or "openai"
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini").strip() or "gpt-5.4-mini"
OPENAI_REASONING_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "high").strip().lower() or "high"
OPENAI_API_BASE = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
ENV_YAML_PATHS = (Path("/root/RooCode/.env.yml"), Path("/root/RooCode/env.yml"))
FORECAST_HORIZON = 5
FORECAST_CONTEXT_MAX_DAYS = 45
CACHE_TTL_SECONDS = _env_int("FORECAST_CACHE_TTL_SECONDS", 3600)
_cache_max_items_raw = _env_int("FORECAST_CACHE_MAX_ITEMS", 256)
CACHE_MAX_ITEMS = _cache_max_items_raw if _cache_max_items_raw > 0 else 1
FORECAST_DEBUG = _env_bool("FORECAST_DEBUG", False)

FORECAST_FIELD_BOUNDS: dict[str, tuple[float, float]] = {
    "sleepTotalHours": (0.0, 16.0),
    "hrvSdnn": (0.0, 250.0),
    "restingHeartRate": (30.0, 220.0),
    "activeEnergyKcal": (0.0, 8000.0),
    "exerciseMinutes": (0.0, 1440.0),
    "valence": (-1.0, 1.0),
}

_cache: dict[str, dict[str, Any]] = {}


class ForecastBadRequest(ValueError):
    """Forecast payload validation error."""


def _trace(message: str) -> None:
    if FORECAST_DEBUG:
        print(f"[forecast]: {message}")


# ─── Helpers de provider ─────────────────────────────────────────────────────

def _load_key_from_yaml(key_name: str, yaml_path: Path) -> str:
    if not yaml_path.exists():
        return ""
    try:
        import yaml
        with yaml_path.open(encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        return str(cfg.get(key_name) or "").strip()
    except Exception:
        return ""


def _load_openai_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    for yaml_path in ENV_YAML_PATHS:
        loaded = _load_key_from_yaml("OPENAI_API_KEY", yaml_path)
        if loaded:
            return loaded
    return ""


def _call_openai(prompt: str) -> str:
    api_key = _load_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada (env var ou /root/RooCode/.env.yml)")

    payload = {
        "model": OPENAI_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "reasoning_effort": OPENAI_REASONING_EFFORT,
        "response_format": {"type": "json_object"},
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
    if AI_PROVIDER not in ("openai", "gpt"):
        raise RuntimeError(f"FORECAST_AI_PROVIDER inválido para forecast OpenAI-only: {AI_PROVIDER}")
    return _call_openai(prompt)


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


def _mean(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def _round_or_none(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), digits)


def _build_recent_summary(
    recent: list[dict[str, Any]],
    rolling_summary: Optional[dict[str, Any]],
) -> dict[str, Any]:
    rows = recent[-21:]
    if not rows:
        return {
            "context_days": 0,
            "context_range": {"from": None, "to": None},
            "rolling_summary": rolling_summary or {},
            "field_trends": {},
            "weekday_effect": {},
            "recent_trace": [],
        }

    weekend_flags: list[bool] = []
    series_by_field: dict[str, list[Optional[float]]] = {field: [] for field in FORECAST_SIGNAL_FIELDS}
    recent_trace: list[dict[str, Any]] = []

    for snapshot in rows:
        d = str(snapshot.get("date") or "")
        try:
            wd_idx = date.fromisoformat(d).weekday()
            wd_name = WEEKDAY_PT[wd_idx]
            is_weekend = wd_idx >= 5
        except ValueError:
            wd_name = "?"
            is_weekend = False

        weekend_flags.append(is_weekend)
        values = snapshot.get("values") if isinstance(snapshot.get("values"), dict) else {}

        trace_row: dict[str, Any] = {"date": d, "weekday": wd_name}
        for field in FORECAST_SIGNAL_FIELDS:
            value = _to_float_or_none(values.get(field))
            series_by_field[field].append(value)
            trace_row[field] = _round_or_none(value)
        recent_trace.append(trace_row)

    field_trends: dict[str, Any] = {}
    weekday_effect: dict[str, Any] = {}
    for field in FORECAST_SIGNAL_FIELDS:
        series = series_by_field[field]
        last_value = next((v for v in reversed(series) if v is not None), None)
        last7_vals = [v for v in series[-7:] if v is not None]
        prev7_vals = [v for v in series[-14:-7] if v is not None]
        weekend_vals = [v for v, is_weekend in zip(series, weekend_flags) if is_weekend and v is not None]
        weekday_vals = [v for v, is_weekend in zip(series, weekend_flags) if (not is_weekend) and v is not None]

        mean_last7 = _mean(last7_vals)
        mean_prev7 = _mean(prev7_vals)
        field_trends[field] = {
            "available_days": len([v for v in series if v is not None]),
            "last_value": _round_or_none(last_value),
            "mean_last7": _round_or_none(mean_last7),
            "mean_prev7": _round_or_none(mean_prev7),
            "delta_last7_vs_prev7": _round_or_none(
                (mean_last7 - mean_prev7) if (mean_last7 is not None and mean_prev7 is not None) else None
            ),
        }

        weekend_mean = _mean(weekend_vals)
        weekday_mean = _mean(weekday_vals)
        weekday_effect[field] = {
            "weekend_mean": _round_or_none(weekend_mean),
            "weekday_mean": _round_or_none(weekday_mean),
            "weekend_minus_weekday": _round_or_none(
                (weekend_mean - weekday_mean) if (weekend_mean is not None and weekday_mean is not None) else None
            ),
        }

    return {
        "context_days": len(rows),
        "context_range": {"from": rows[0].get("date"), "to": rows[-1].get("date")},
        "rolling_summary": rolling_summary or {},
        "field_trends": field_trends,
        "weekday_effect": weekday_effect,
        # Mantém só traço curto recente para reduzir tokens.
        "recent_trace": recent_trace[-10:],
    }


def _build_prompt(
    recent: list[dict],
    future_dates: list[dict[str, str]],
    cap: float,
    rolling_summary: Optional[dict[str, Any]] = None,
) -> str:
    future_list = [{"date": fd["date"], "weekday": fd["weekday"]} for fd in future_dates]
    summary_payload = _build_recent_summary(recent, rolling_summary)

    return f"""Você é um analista clínico e deve projetar {len(future_dates)} dias futuros para um dashboard fisiológico.

Use SOMENTE o resumo abaixo (sem inventar contexto externo). O regime farmacológico do paciente está estável (steady-state), então a projeção deve priorizar tendência recente e efeito de dia-da-semana.

RESUMO_ESTRUTURADO_JSON
{json.dumps(summary_payload, ensure_ascii=False, separators=(",", ":"))}

DATAS_A_PROJETAR_JSON
{json.dumps(future_list, ensure_ascii=False, separators=(",", ":"))}

REGRAS
1. Projete sinais plausíveis e coerentes entre si (HRV x FC de repouso anticorrelacionados quando fizer sentido).
2. Preserve autocorrelação temporal: não crie saltos abruptos sem justificativa.
3. Use `field_trends`, `rolling_summary` e `weekday_effect` como âncoras principais.
4. Incerteza cresce no horizonte: `confidence` não pode aumentar do dia T+1 para T+5.
5. `confidence` deve ficar entre 0 e {cap:.2f}.
6. Tom descritivo e prudente; sem recomendação médica.

RETORNO (JSON válido, sem markdown, sem texto fora do JSON):
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
      "confidence": 0.0-{cap:.2f},
      "rationale": "justificativa curta em PT-BR"
    }}
  ],
  "signals": [
    {{
      "field": "campo_relevante",
      "observation": "observação descritiva em PT-BR sobre tendência/sinal"
    }}
  ]
}}
"""


def _apply_forecasted(entries: list[dict], cap: float, expected_dates: list[str]) -> list[dict]:
    expected_set = set(expected_dates)
    by_date: dict[str, dict[str, Any]] = {}
    for entry in entries:
        d = entry.get("date")
        if not isinstance(d, str) or not d:
            continue
        if d not in expected_set:
            continue
        if d in by_date:
            continue
        values = entry.get("values") or {}
        clamped_values: dict[str, Optional[float]] = {}
        for field, bounds in FORECAST_FIELD_BOUNDS.items():
            numeric_value = _to_float_or_none(values.get(field))
            if numeric_value is None:
                clamped_values[field] = None
                continue
            lower_bound, upper_bound = bounds
            clamped_values[field] = max(lower_bound, min(numeric_value, upper_bound))
        raw_conf = _to_float_or_none(entry.get("confidence"))
        conf = max(0.0, min(raw_conf if raw_conf is not None else 0.3, cap))

        health_fields = {
            "sleepTotalHours": clamped_values.get("sleepTotalHours"),
            "hrvSdnn": clamped_values.get("hrvSdnn"),
            "restingHeartRate": clamped_values.get("restingHeartRate"),
            "activeEnergyKcal": clamped_values.get("activeEnergyKcal"),
            "exerciseMinutes": clamped_values.get("exerciseMinutes"),
        }
        has_health = any(v is not None for v in health_fields.values())
        health_block = None
        if has_health:
            health_payload: dict[str, Optional[float]] = {}
            for key, value in health_fields.items():
                if value is None:
                    health_payload[key] = None
                    continue
                health_payload[key] = float(value)

            health_block = {
                "date": d,
                "interpolated": False,
                **health_payload,
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

        mood_valence = clamped_values.get("valence")
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

        by_date[d] = {
            "date": d,
            "health": health_block,
            "mood": mood_block,
            "medications": None,
            "interpolated": False,
            "forecasted": True,
            "forecastConfidence": conf,
            "forecastRationale": str(entry.get("rationale") or ""),
        }

    result = [by_date[d] for d in expected_dates if d in by_date]
    last_conf = cap
    for snapshot in result:
        conf = _to_float_or_none(snapshot.get("forecastConfidence"))
        bounded = max(0.0, min(conf if conf is not None else 0.3, last_conf))
        snapshot["forecastConfidence"] = bounded
        last_conf = bounded

    return result


def _validate_horizon(horizon: int) -> None:
    if horizon != FORECAST_HORIZON:
        raise ForecastBadRequest(f"horizon deve ser {FORECAST_HORIZON} dias")


def _validate_valid_real_days(valid_real_days: int) -> None:
    if valid_real_days < 0:
        raise ForecastBadRequest("valid_real_days não pode ser negativo")


def _validate_snapshots_payload(snapshots: Any) -> list[dict[str, Any]]:
    if not isinstance(snapshots, list):
        raise ForecastBadRequest("snapshots deve ser uma lista")
    if not snapshots:
        raise ForecastBadRequest("snapshots vazio; envie dias reais com sinais")

    validated: list[dict[str, Any]] = []
    index = 0
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            raise ForecastBadRequest(f"snapshots[{index}] deve ser um objeto")
        date_value = snapshot.get("date")
        if not isinstance(date_value, str) or not date_value:
            raise ForecastBadRequest(f"snapshots[{index}].date deve ser string YYYY-MM-DD")
        try:
            date.fromisoformat(date_value)
        except ValueError as exc:
            raise ForecastBadRequest(f"snapshots[{index}].date inválida (YYYY-MM-DD)") from exc
        validated.append(snapshot)
        index += 1
    return validated


def _error_response(message: str, status_code: int, cap: float) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "forecasted_snapshots": [],
            "meta": {
                "cached": False,
                "error": message,
                "forecasted_dates": [],
                "max_confidence": cap,
            },
            "signals": [],
        },
    )


# ─── Endpoint ────────────────────────────────────────────────────────────────

@router.post("")
async def forecast(body: ForecastRequest) -> JSONResponse:
    try:
        _validate_horizon(body.horizon)
        _validate_valid_real_days(body.valid_real_days)
        validated_snapshots = _validate_snapshots_payload(body.snapshots)
    except ForecastBadRequest as exc:
        return _error_response(str(exc), 400, 0.0)

    context = _select_recent_context(validated_snapshots)
    if not context:
        return _error_response("Sem snapshots válidos com sinais para projeção", 400, 0.0)

    future_dates = _build_future_dates(context, FORECAST_HORIZON)
    if not future_dates:
        return _error_response("Sem datas futuras derivadas do contexto", 400, 0.0)

    cap = _compute_confidence_cap(body.valid_real_days)
    recent = context[-30:]
    rolling_summary = body.rolling_summary if isinstance(body.rolling_summary, dict) else None

    cache_key = hashlib.md5(
        json.dumps({
            "recent": recent,
            "future": future_dates,
            "horizon": FORECAST_HORIZON,
            "cap": cap,
            "summary": rolling_summary,
        }, sort_keys=True, default=str).encode()
    ).hexdigest()

    hit = _cache_get(cache_key)
    if hit:
        _trace("cache hit")
        return JSONResponse(content={
            "forecasted_snapshots": hit["forecasted_snapshots"],
            "meta": {**hit["meta"], "cached": True},
            "signals": hit["signals"],
        })

    _trace("cache miss")
    prompt = _build_prompt(recent, future_dates, cap, rolling_summary)

    provider_started_at = time.perf_counter()
    try:
        raw = await asyncio.to_thread(_call_model, prompt)
        clean = _strip_fences(raw)
        parsed = json.loads(clean)
        if not isinstance(parsed, dict):
            raise ValueError(f"Modelo retornou {type(parsed).__name__}, esperado dict")

        forecasts_raw = parsed.get("forecasts", [])
        if not isinstance(forecasts_raw, list):
            raise ValueError(f"'forecasts' é {type(forecasts_raw).__name__}, esperado list")

        signals_raw = parsed.get("signals", [])
        if not isinstance(signals_raw, list):
            signals_raw = []

        expected_dates: list[str] = [str(item.get("date")) for item in future_dates if item.get("date")]

        filtered_forecasts: list[dict[str, Any]] = []
        for entry in forecasts_raw:
            if not isinstance(entry, dict):
                continue
            filtered_forecasts.append(entry)

        forecasted = _apply_forecasted(filtered_forecasts, cap, expected_dates)

        signals = []
        for signal in signals_raw:
            if not isinstance(signal, dict):
                continue
            observation = signal.get("observation")
            if not observation:
                continue
            signals.append({"field": signal.get("field", ""), "observation": observation})

        meta_forecasted_dates = []
        for item in forecasted:
            meta_forecasted_dates.append(item.get("date"))

        meta = {
            "cached": False,
            "error": None,
            "forecasted_dates": meta_forecasted_dates,
            "max_confidence": cap,
        }
        _cache_set(cache_key, {"forecasted_snapshots": forecasted, "meta": meta, "signals": signals})
        provider_elapsed_ms = (time.perf_counter() - provider_started_at) * 1000.0
        _trace(f"provider latency {provider_elapsed_ms:.1f} ms")
        return JSONResponse(content={"forecasted_snapshots": forecasted, "meta": meta, "signals": signals})
    except ForecastBadRequest as exc:
        return _error_response(str(exc), 400, cap)
    except Exception as exc:
        return _error_response(f"{type(exc).__name__}: {exc}", 502, cap)


# ─── Endpoint /summary (sem chamar IA) ──────────────────────────────────────

class ForecastSummaryRequest(BaseModel):
    snapshots: list[dict]
    rolling_summary: Optional[dict[str, Any]] = None


@router.post("/summary")
async def forecast_summary(body: ForecastSummaryRequest) -> JSONResponse:
    """Retorna agregados (field_trends, weekday_effect, recent_trace) sem chamar IA.

    Reusa _build_recent_summary do pipeline principal — útil para cards/dashboards
    que querem o snapshot estatístico sem o custo/latência da projeção.
    """
    try:
        validated = _validate_snapshots_payload(body.snapshots)
    except ForecastBadRequest as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    context = _select_recent_context(validated)
    rolling = body.rolling_summary if isinstance(body.rolling_summary, dict) else None
    summary = _build_recent_summary(context, rolling)
    return JSONResponse(content=summary)
