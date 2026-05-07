"""Persistência de previsões geradas e cálculo de accuracy versus actual.

Cada chamada a `record_forecast` flatiza o array de snapshots previstos em
entries por (target_date, field, predicted, confidence) e persiste em
`forecast_history.json` com schema versioning. `compute_accuracy` pareia
predicted com actual (snapshots reais entregues pelo cliente) e computa
MAPE/MAE/RMSE agregados por field.

Concorrência: escrita atômica via tmp+rename (uvicorn single-process,
risco residual baixo, mas evita corrupção em crash mid-write).
"""

import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional


HISTORY_PATH = Path(__file__).parent / "forecast_history.json"
SCHEMA_VERSION = 1

TRACKED_FIELDS: tuple[str, ...] = (
    "sleepTotalHours",
    "hrvSdnn",
    "restingHeartRate",
    "activeEnergyKcal",
    "exerciseMinutes",
    "valence",
)


def _load_or_init() -> dict:
    """Lê o JSON ou retorna dict inicial vazio (schema versioned)."""
    if not HISTORY_PATH.exists():
        return {"_schema_version": SCHEMA_VERSION, "entries": []}
    try:
        with HISTORY_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return {"_schema_version": SCHEMA_VERSION, "entries": []}
    if not isinstance(data, dict) or "entries" not in data:
        return {"_schema_version": SCHEMA_VERSION, "entries": []}
    return data


def _atomic_write(data: dict) -> None:
    """Escreve em arquivo temporário no mesmo dir e faz os.replace pra atomicidade."""
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=".forecast_history_",
        suffix=".tmp",
        dir=str(HISTORY_PATH.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        os.replace(tmp_path, HISTORY_PATH)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _extract_field_value(snap: dict, field: str) -> Optional[float]:
    """Extrai field do snapshot — lida com `health`/`mood` (saída) e `values` (entrada)."""
    if field == "valence":
        for key in ("mood", "values"):
            container = snap.get(key)
            if isinstance(container, dict):
                value = container.get("valence")
                if isinstance(value, (int, float)):
                    return float(value)
        return None
    for key in ("health", "values"):
        container = snap.get(key)
        if isinstance(container, dict):
            value = container.get(field)
            if isinstance(value, (int, float)):
                return float(value)
    return None


def record_forecast(forecasted_snapshots: list[dict], generated_at: str) -> None:
    """Persiste cada (target_date, field, predicted, confidence) extraído do array."""
    if not forecasted_snapshots:
        return
    new_entries: list[dict] = []
    for snap in forecasted_snapshots:
        target_date = snap.get("date")
        if not isinstance(target_date, str):
            continue
        confidence_raw = snap.get("forecastConfidence")
        try:
            confidence = float(confidence_raw) if confidence_raw is not None else None
        except (TypeError, ValueError):
            confidence = None
        for field in TRACKED_FIELDS:
            value = _extract_field_value(snap, field)
            if value is None:
                continue
            new_entries.append({
                "generated_at": generated_at,
                "target_date": target_date,
                "field": field,
                "predicted": value,
                "confidence": confidence,
            })
    if not new_entries:
        return
    data = _load_or_init()
    data.setdefault("entries", []).extend(new_entries)
    data["_schema_version"] = SCHEMA_VERSION
    _atomic_write(data)


def load_history(days_back: Optional[int] = None) -> list[dict]:
    """Retorna entries do history. Se days_back, filtra por target_date >= hoje-days."""
    data = _load_or_init()
    entries = list(data.get("entries", []))
    if days_back is None:
        return entries
    cutoff = (
        datetime.now(timezone.utc).date() - timedelta(days=days_back)
    ).isoformat()
    return [
        entry
        for entry in entries
        if isinstance(entry.get("target_date"), str)
        and entry["target_date"] >= cutoff
    ]


def compute_accuracy(
    snapshots_real: list[dict],
    history: list[dict],
    days_back: int = 30,
) -> dict:
    """Pareia predicted (history) com actual (snapshots reais) por target_date+field.

    Retorna MAPE/MAE/RMSE agregados por field, junto de window_days, history_size
    e warning quando history < 14 entries.
    """
    real_by_date: dict[str, dict[str, float]] = {}
    for snap in snapshots_real:
        date_str = snap.get("date")
        if not isinstance(date_str, str):
            continue
        for field in TRACKED_FIELDS:
            value = _extract_field_value(snap, field)
            if value is not None:
                real_by_date.setdefault(date_str, {})[field] = value

    pairs_by_field: dict[str, list[tuple[float, float]]] = {
        field: [] for field in TRACKED_FIELDS
    }
    for entry in history:
        target_date = entry.get("target_date")
        field = entry.get("field")
        predicted = entry.get("predicted")
        if (
            not isinstance(target_date, str)
            or field not in pairs_by_field
            or not isinstance(predicted, (int, float))
        ):
            continue
        actual = real_by_date.get(target_date, {}).get(field)
        if actual is None:
            continue
        pairs_by_field[field].append((float(predicted), float(actual)))

    accuracy_by_field: dict[str, dict[str, Any]] = {}
    for field, pairs in pairs_by_field.items():
        if not pairs:
            continue
        ae_values: list[float] = []
        sq_values: list[float] = []
        mape_values: list[float] = []
        for predicted, actual in pairs:
            error = abs(predicted - actual)
            ae_values.append(error)
            sq_values.append(error * error)
            if abs(actual) > 1e-6:
                mape_values.append(error / abs(actual) * 100.0)
        n = len(pairs)
        accuracy_by_field[field] = {
            "mape": round(sum(mape_values) / len(mape_values), 2)
            if mape_values
            else None,
            "mae": round(sum(ae_values) / n, 4),
            "rmse": round((sum(sq_values) / n) ** 0.5, 4),
            "n": n,
        }

    history_size = len(history)
    warning = (
        "history < 14 days, accuracy may be unreliable"
        if history_size < 14
        else None
    )

    return {
        "accuracy_by_field": accuracy_by_field,
        "window_days": days_back,
        "history_size": history_size,
        "warning": warning,
    }
