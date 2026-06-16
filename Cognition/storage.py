from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
SESSIONS_PATH = Path(__file__).parent / "sessions.json"


def _default_payload() -> dict[str, Any]:
    return {
        "_schema_version": SCHEMA_VERSION,
        "sessions": [],
    }


def load_payload() -> dict[str, Any]:
    if not SESSIONS_PATH.exists():
        return _default_payload()

    try:
        with SESSIONS_PATH.open(encoding="utf-8") as fh:
            payload = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return _default_payload()

    if not isinstance(payload, dict):
        return _default_payload()

    sessions = payload.get("sessions")
    if not isinstance(sessions, list):
        payload["sessions"] = []

    payload.setdefault("_schema_version", SCHEMA_VERSION)
    return payload


def load_sessions() -> list[dict[str, Any]]:
    payload = load_payload()
    sessions = payload.get("sessions")
    return sessions if isinstance(sessions, list) else []


def save_sessions(sessions: list[dict[str, Any]]) -> None:
    payload = {
        "_schema_version": SCHEMA_VERSION,
        "sessions": sessions,
    }
    SESSIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=SESSIONS_PATH.parent,
        prefix=".sessions_",
        suffix=".tmp",
        delete=False,
    ) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
        tmp.flush()
        Path(tmp.name).replace(SESSIONS_PATH)


def append_session(session: dict[str, Any]) -> None:
    sessions = load_sessions()
    sessions.append(session)
    sessions.sort(key=lambda item: str(item.get("started_at") or ""))
    save_sessions(sessions)
