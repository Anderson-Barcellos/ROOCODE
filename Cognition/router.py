from __future__ import annotations

import math
import random
import statistics
import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from Cognition import storage
from Cognition.openai_tasks import (
    generate_reading_passage,
    score_reading_recall,
    score_verbal_fluency,
)

router = APIRouter()

APP_TIMEZONE = ZoneInfo("America/Sao_Paulo")
ROTATING_SEQUENCE: tuple[Literal["A", "B", "C"], ...] = ("A", "B", "C")
FLUENCY_LETTERS = ["F", "P", "M", "C", "T", "S", "L", "R"]
FLUENCY_CATEGORIES = [
    "animais",
    "frutas",
    "profissões",
    "instrumentos musicais",
    "meios de transporte",
    "partes da casa",
    "roupas",
    "objetos de cozinha",
]


class VASPayload(BaseModel):
    mood: int = Field(ge=0, le=100)
    energy: int = Field(ge=0, le=100)
    anxiety: int = Field(ge=0, le=100)
    rested: int | None = Field(default=None, ge=0, le=100)


class ContextPayload(BaseModel):
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    caffeine_taken: bool = False
    caffeine_amount_mg: float | None = Field(default=None, ge=0, le=2000)
    vyvanse_taken_at: str | None = None
    lunch_completed: bool | None = None


class SessionPlanPayload(BaseModel):
    rotating_type: Literal["A", "B", "C"]
    span_kind: Literal["digit", "corsi"]
    fluency_mode: Literal["phonemic", "semantic"] | None = None
    fluency_criterion: str | None = None
    reading_passage: str | None = None
    reading_idea_units: list[str] = Field(default_factory=list)
    reading_source_theme: str | None = None


class PvtTrialPayload(BaseModel):
    stimulus_delay_ms: int = Field(ge=500, le=15000)
    false_starts: int = Field(default=0, ge=0, le=20)
    reaction_time_ms: float | None = Field(default=None, gt=0, le=5000)


class PvtPayload(BaseModel):
    duration_ms: int = Field(ge=60_000, le=600_000)
    trials: list[PvtTrialPayload]


class SpanAttemptPayload(BaseModel):
    direction: Literal["forward", "backward"]
    length: int = Field(ge=2, le=12)
    sequence: list[int] = Field(min_length=1, max_length=12)
    response: list[int] = Field(default_factory=list, max_length=12)
    correct: bool


class SpanPayload(BaseModel):
    kind: Literal["digit", "corsi"]
    attempts: list[SpanAttemptPayload]


class FluencyPayload(BaseModel):
    words: list[str]


class ReadingPayload(BaseModel):
    reading_time_ms: int = Field(ge=1_000, le=600_000)
    recall_text: str = Field(min_length=1)


class FlankerTrialPayload(BaseModel):
    congruent: bool
    expected_response: Literal["left", "right"]
    response: Literal["left", "right"] | None = None
    reaction_time_ms: float | None = Field(default=None, gt=0, le=5000)
    correct: bool


class FlankerPayload(BaseModel):
    trials: list[FlankerTrialPayload] = Field(min_length=1, max_length=200)


class CompleteSessionPayload(BaseModel):
    started_at: str
    plan: SessionPlanPayload
    context: ContextPayload
    vas: VASPayload
    pvt: PvtPayload
    span: SpanPayload
    fluency: FluencyPayload | None = None
    reading: ReadingPayload | None = None
    flanker: FlankerPayload | None = None

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: str) -> str:
        _parse_iso(value)
        return value


def _parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _local_date(value: str | datetime) -> str:
    parsed = value if isinstance(value, datetime) else _parse_iso(value)
    return parsed.astimezone(APP_TIMEZONE).date().isoformat()


def _json_error(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": detail})


def _sessions_sorted() -> list[dict[str, Any]]:
    sessions = storage.load_sessions()
    return sorted(sessions, key=lambda item: str(item.get("started_at") or ""))


def _latest_session_for_today(sessions: list[dict[str, Any]]) -> dict[str, Any] | None:
    today = datetime.now(APP_TIMEZONE).date().isoformat()
    for session in reversed(sessions):
        if _local_date(str(session.get("started_at") or "")) == today:
            return session
    return None


def _next_rotating_type(sessions: list[dict[str, Any]]) -> Literal["A", "B", "C"]:
    if not sessions:
        return "A"
    last = sessions[-1].get("rotating_type")
    if last not in ROTATING_SEQUENCE:
        return "A"
    idx = ROTATING_SEQUENCE.index(last)
    return ROTATING_SEQUENCE[(idx + 1) % len(ROTATING_SEQUENCE)]


def _span_kind_for_today() -> Literal["digit", "corsi"]:
    day_number = datetime.now(APP_TIMEZONE).day
    return "digit" if day_number % 2 == 1 else "corsi"


def _next_fluency_mode(sessions: list[dict[str, Any]]) -> Literal["phonemic", "semantic"]:
    fluency_sessions = [session for session in sessions if session.get("rotating_type") == "A"]
    if not fluency_sessions:
        return "phonemic"
    last_mode = fluency_sessions[-1].get("fluency", {}).get("type")
    return "semantic" if last_mode == "phonemic" else "phonemic"


def _recent_values(sessions: list[dict[str, Any]], *, rotating_type: str, key: str, limit: int = 4) -> list[str]:
    values: list[str] = []
    for session in reversed(sessions):
        if session.get("rotating_type") != rotating_type:
            continue
        nested = session.get(key) or {}
        if rotating_type == "A":
            criterion = nested.get("criterion")
            if isinstance(criterion, str):
                values.append(criterion)
        elif rotating_type == "B":
            theme = nested.get("source_theme")
            if isinstance(theme, str):
                values.append(theme)
        if len(values) >= limit:
            break
    return values


def _pick_balanced(options: list[str], recent: list[str]) -> str:
    for option in options:
        if option not in recent:
            return option
    return options[0]


def _build_session_plan(sessions: list[dict[str, Any]], *, include_generated_reading: bool) -> dict[str, Any]:
    rotating_type = _next_rotating_type(sessions)
    span_kind = _span_kind_for_today()
    plan: dict[str, Any] = {
        "rotating_type": rotating_type,
        "span_kind": span_kind,
        "pvt": {
            "duration_ms": 180_000,
            "isi_min_ms": 2_000,
            "isi_max_ms": 10_000,
        },
        "flanker": {
            "trial_count": 40,
            "stimulus_timeout_ms": 1_500,
            "fixation_ms": 400,
        },
    }
    if rotating_type == "A":
        mode = _next_fluency_mode(sessions)
        options = FLUENCY_LETTERS if mode == "phonemic" else FLUENCY_CATEGORIES
        criterion = _pick_balanced(
            options,
            _recent_values(sessions, rotating_type="A", key="fluency"),
        )
        plan["fluency"] = {"mode": mode, "criterion": criterion}
    elif rotating_type == "B":
        if include_generated_reading:
            recent_themes = _recent_values(sessions, rotating_type="B", key="reading")
            generated = generate_reading_passage(
                difficulty="moderado-estável",
                target_idea_units=18,
                avoid_themes=recent_themes,
            )
            passage = str(generated.get("passage") or "")
            plan["reading"] = {
                "passage": passage,
                "idea_units": [str(item) for item in generated.get("idea_units") or []],
                "source_theme": str(generated.get("theme_tag") or passage[:80]).strip(),
            }
    return plan


def _mean(values: list[float]) -> float | None:
    numeric = [value for value in values if math.isfinite(value)]
    if not numeric:
        return None
    return round(sum(numeric) / len(numeric), 4)


def _mean_top_decile(values: list[float], *, reverse: bool = False) -> float | None:
    if not values:
        return None
    ordered = sorted(values, reverse=reverse)
    bucket = max(1, math.ceil(len(ordered) * 0.1))
    return _mean(ordered[:bucket])


def _compute_pvt_metrics(payload: PvtPayload) -> dict[str, Any]:
    rt_values = [trial.reaction_time_ms for trial in payload.trials if trial.reaction_time_ms is not None]
    numeric_rts = [float(value) for value in rt_values if value is not None]
    reciprocal = [1000.0 / value for value in numeric_rts if value > 0]
    return {
        "duration_ms": payload.duration_ms,
        "trials": [trial.model_dump() for trial in payload.trials],
        "stimuli_count": len(payload.trials),
        "mean_rt_ms": _mean(numeric_rts),
        "median_rt_ms": round(statistics.median(numeric_rts), 4) if numeric_rts else None,
        "response_speed_mean": _mean(reciprocal),
        "fastest_10pct_mean_ms": _mean_top_decile(numeric_rts),
        "slowest_10pct_mean_ms": _mean_top_decile(numeric_rts, reverse=True),
        "lapses_count": sum(1 for value in numeric_rts if value > 500),
        "false_starts_count": sum(trial.false_starts for trial in payload.trials),
    }


def _compute_span_metrics(payload: SpanPayload) -> dict[str, Any]:
    attempts = [attempt.model_dump() for attempt in payload.attempts]
    max_forward = max((attempt.length for attempt in payload.attempts if attempt.direction == "forward" and attempt.correct), default=0)
    max_backward = max((attempt.length for attempt in payload.attempts if attempt.direction == "backward" and attempt.correct), default=0)
    primary_score = max_backward if payload.kind == "digit" else max_forward
    return {
        "kind": payload.kind,
        "attempts": attempts,
        "max_forward": max_forward,
        "max_backward": max_backward if payload.kind == "digit" else None,
        "primary_score": primary_score,
    }


def _compute_flanker_metrics(payload: FlankerPayload) -> dict[str, Any]:
    congruent = [trial.reaction_time_ms for trial in payload.trials if trial.congruent and trial.reaction_time_ms is not None]
    incongruent = [trial.reaction_time_ms for trial in payload.trials if (not trial.congruent) and trial.reaction_time_ms is not None]
    congruent_acc = _mean([1.0 if trial.correct else 0.0 for trial in payload.trials if trial.congruent])
    incongruent_acc = _mean([1.0 if trial.correct else 0.0 for trial in payload.trials if not trial.congruent])
    cong_mean = _mean([float(value) for value in congruent if value is not None])
    incong_mean = _mean([float(value) for value in incongruent if value is not None])
    return {
        "trials": [trial.model_dump() for trial in payload.trials],
        "congruent_mean_rt_ms": cong_mean,
        "incongruent_mean_rt_ms": incong_mean,
        "congruent_accuracy": congruent_acc,
        "incongruent_accuracy": incongruent_acc,
        "interference_ms": round(incong_mean - cong_mean, 4) if cong_mean is not None and incong_mean is not None else None,
        "exploratory": True,
    }


def _sanitize_words(words: list[str]) -> list[str]:
    cleaned: list[str] = []
    for word in words:
        normalized = " ".join(part.strip() for part in str(word).replace("\r", "\n").split("\n") if part.strip())
        if normalized:
            cleaned.append(normalized)
    return cleaned


def _build_slot_metrics(plan: SessionPlanPayload, payload: CompleteSessionPayload) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, Any] | None]:
    fluency_result: dict[str, Any] | None = None
    reading_result: dict[str, Any] | None = None
    flanker_result: dict[str, Any] | None = None

    if plan.rotating_type == "A":
        if payload.fluency is None or not plan.fluency_mode or not plan.fluency_criterion:
            raise ValueError("Sessão A requer payload de fluência e critério válido")
        words = _sanitize_words(payload.fluency.words)
        scored = score_verbal_fluency(
            fluency_type=plan.fluency_mode,
            criterion=plan.fluency_criterion,
            words=words,
        )
        fluency_result = {
            "type": plan.fluency_mode,
            "criterion": plan.fluency_criterion,
            "words": words,
            **scored,
        }
    elif plan.rotating_type == "B":
        if payload.reading is None or not plan.reading_passage or not plan.reading_idea_units:
            raise ValueError("Sessão B requer texto, unidades de ideia e recall")
        scored = score_reading_recall(
            passage=plan.reading_passage,
            idea_units=plan.reading_idea_units,
            recall_text=payload.reading.recall_text,
        )
        reading_result = {
            "passage": plan.reading_passage,
            "idea_units": plan.reading_idea_units,
            "source_theme": plan.reading_source_theme,
            "reading_time_ms": payload.reading.reading_time_ms,
            "recall_text": payload.reading.recall_text,
            **scored,
        }
    elif plan.rotating_type == "C":
        if payload.flanker is None:
            raise ValueError("Sessão C requer payload do flanker")
        flanker_result = _compute_flanker_metrics(payload.flanker)
    return fluency_result, reading_result, flanker_result


def _slot_summary(session: dict[str, Any]) -> tuple[str, float | None, bool]:
    rotating_type = session.get("rotating_type")
    if rotating_type == "A":
        fluency = session.get("fluency") or {}
        value = fluency.get("valid_count")
        return "Fluência", float(value) if value is not None else None, False
    if rotating_type == "B":
        reading = session.get("reading") or {}
        recovered = reading.get("recovered_count")
        total = reading.get("total_units")
        if recovered is not None and total:
            return "Recall", round(float(recovered) / float(total), 4), False
        return "Recall", None, False
    if rotating_type == "C":
        flanker = session.get("flanker") or {}
        value = flanker.get("interference_ms")
        return "Flanker", float(value) if value is not None else None, True
    return "Rotativo", None, False


def _session_chart_row(session: dict[str, Any]) -> dict[str, Any]:
    pvt = session.get("pvt") or {}
    span = session.get("span") or {}
    slot_label, slot_primary, exploratory = _slot_summary(session)
    return {
        "id": session.get("id"),
        "date": _local_date(str(session.get("started_at") or "")),
        "started_at": session.get("started_at"),
        "rotating_type": session.get("rotating_type"),
        "mood": (session.get("vas") or {}).get("mood"),
        "energy": (session.get("vas") or {}).get("energy"),
        "anxiety": (session.get("vas") or {}).get("anxiety"),
        "pvt_lapses": pvt.get("lapses_count"),
        "pvt_response_speed": pvt.get("response_speed_mean"),
        "pvt_median_rt_ms": pvt.get("median_rt_ms"),
        "span_primary": span.get("primary_score"),
        "slot_label": slot_label,
        "slot_primary": slot_primary,
        "slot_exploratory": exploratory,
        "baseline_phase": bool(session.get("baseline_phase")),
    }


def _baseline_complete(sessions: list[dict[str, Any]]) -> bool:
    return len(sessions) >= 14


@router.get("/status")
async def cognition_status(days: int = 30) -> JSONResponse:
    sessions = _sessions_sorted()
    today_session = _latest_session_for_today(sessions)
    cutoff = datetime.now(APP_TIMEZONE).date()
    timeline: list[dict[str, Any]] = []
    for session in sessions:
        local_day = datetime.fromisoformat(_local_date(str(session.get("started_at") or "")))
        if days > 0 and (cutoff - local_day.date()).days >= days:
            continue
        timeline.append(_session_chart_row(session))

    response = {
        "today_session": today_session,
        "timeline": timeline,
        "baseline_session_count": min(14, len(sessions)),
        "baseline_complete": _baseline_complete(sessions),
        "next_plan": None if today_session else _build_session_plan(sessions, include_generated_reading=False),
        "session_count": len(sessions),
    }
    return JSONResponse(content=response)


@router.post("/materials")
async def cognition_materials() -> JSONResponse:
    sessions = _sessions_sorted()
    if _latest_session_for_today(sessions) is not None:
        return _json_error(409, "Aferição de hoje já foi concluída.")
    plan = _build_session_plan(sessions, include_generated_reading=True)
    return JSONResponse(content=plan)


@router.post("/complete")
async def cognition_complete(body: CompleteSessionPayload) -> JSONResponse:
    sessions = _sessions_sorted()
    if _latest_session_for_today(sessions) is not None:
        return _json_error(409, "Aferição de hoje já foi concluída.")

    expected_plan = _build_session_plan(sessions, include_generated_reading=False)
    if body.plan.rotating_type != expected_plan["rotating_type"]:
        return _json_error(409, "Plano rotativo desatualizado. Reabra a sessão.")
    if body.plan.span_kind != expected_plan["span_kind"]:
        return _json_error(409, "Plano de span desatualizado. Reabra a sessão.")
    if body.span.kind != body.plan.span_kind:
        return _json_error(422, "Payload do span não corresponde ao plano da sessão.")

    try:
        pvt_metrics = _compute_pvt_metrics(body.pvt)
        span_metrics = _compute_span_metrics(body.span)
        fluency_result, reading_result, flanker_result = _build_slot_metrics(body.plan, body)
    except Exception as exc:
        return _json_error(422, f"Falha ao validar/scorar sessão: {type(exc).__name__}: {exc}")

    session_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    baseline_phase = len(sessions) < 14
    session = {
        "id": session_id,
        "user_id": "default",
        "started_at": _parse_iso(body.started_at).isoformat(),
        "rotating_type": body.plan.rotating_type,
        "context": body.context.model_dump(),
        "vas": body.vas.model_dump(),
        "pvt": pvt_metrics,
        "span": span_metrics,
        "fluency": fluency_result,
        "reading": reading_result,
        "flanker": flanker_result,
        "baseline_phase": baseline_phase,
        "created_at": created_at,
    }
    storage.append_session(session)
    return JSONResponse(content={"session": session, "summary": _session_chart_row(session)})
