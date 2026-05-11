"""PK payload helpers for the forecast prompt enrichment (Sprint M6.2)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from Farma.math import (
    concentration_at_time,
    get_substance_profile,
    _profile_volume_of_distribution,
)

_FARMA_DIR = Path(__file__).parent.parent / "Farma"
_REGIMEN_PATH = _FARMA_DIR / "regimen_config.json"
_DOSE_LOG_PATH = _FARMA_DIR / "dose_log.json"

# Warm-up window: enough half-lives to reach ≥97% steady-state.
# Lexapro t½=30h, Lamictal t½=32.8h → 5×33h ≈ 7 days covers all three substances.
_WARMUP_DAYS = 14

# Caller-supplied weight for Anders's regimen; backend default is 70 kg (known discrepancy).
_DEFAULT_WEIGHT_KG = 91.0


def _load_regimen() -> list[dict]:
    if not _REGIMEN_PATH.exists():
        return []
    with _REGIMEN_PATH.open(encoding="utf-8") as fh:
        raw = json.load(fh)
    return raw if isinstance(raw, list) else []


def _load_dose_log() -> list[dict]:
    if not _DOSE_LOG_PATH.exists():
        return []
    with _DOSE_LOG_PATH.open(encoding="utf-8") as fh:
        raw = json.load(fh)
    return raw if isinstance(raw, list) else []


def _js_dow(d: date) -> int:
    """Convert Python isoweekday (Mon=1..Sun=7) to JS convention (Sun=0..Sat=6)."""
    return d.isoweekday() % 7


def _regimen_doses_in_window(
    regimen: list[dict],
    canonical_key: str,
    window_start: datetime,
    window_end: datetime,
) -> list[tuple[datetime, float]]:
    """Expand regimen entries into synthetic dose events within [window_start, window_end]."""
    events: list[tuple[datetime, float]] = []
    for entry in regimen:
        if entry.get("substance") != canonical_key or not entry.get("active"):
            continue
        dose_mg = float(entry.get("dose_mg") or 0.0)
        if dose_mg <= 0:
            continue
        dow_set = set(int(d) for d in (entry.get("days_of_week") or []))
        times = entry.get("times") or []
        start_str: Optional[str] = entry.get("start_date")
        end_str: Optional[str] = entry.get("end_date")
        regimen_start = (
            datetime.strptime(start_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if start_str else None
        )
        regimen_end = (
            datetime.strptime(end_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if end_str else None
        )
        cur = window_start.date()
        while cur <= window_end.date():
            cur_dt_midnight = datetime(cur.year, cur.month, cur.day, tzinfo=timezone.utc)
            if regimen_start and cur_dt_midnight < regimen_start:
                cur += timedelta(days=1)
                continue
            if regimen_end and cur_dt_midnight > regimen_end:
                cur += timedelta(days=1)
                continue
            if _js_dow(cur) in dow_set:
                for time_str in times:
                    try:
                        hh, mm = (int(p) for p in time_str.split(":"))
                    except (ValueError, AttributeError):
                        continue
                    taken_dt = datetime(cur.year, cur.month, cur.day, hh, mm, tzinfo=timezone.utc)
                    if window_start <= taken_dt <= window_end:
                        events.append((taken_dt, dose_mg))
            cur += timedelta(days=1)
    return events


def _dose_log_events_in_window(
    dose_log: list[dict],
    canonical_key: str,
    window_start: datetime,
    window_end: datetime,
) -> list[tuple[datetime, float]]:
    """Extract dose_log events for canonical_key within [window_start, window_end]."""
    events: list[tuple[datetime, float]] = []
    for record in dose_log:
        if record.get("substance") != canonical_key:
            continue
        try:
            taken = datetime.fromisoformat(record["taken_at"])
            if taken.tzinfo is None:
                taken = taken.replace(tzinfo=timezone.utc)
            dose_mg = float(record["dose_mg"])
        except (KeyError, ValueError, TypeError):
            continue
        if window_start <= taken <= window_end:
            events.append((taken, dose_mg))
    return events


def _concentration_at_noon(
    target_date: date,
    dose_events: list[tuple[datetime, float]],
    ka: float,
    ke: float,
    vd: float,
    bioavailability: float,
) -> float:
    # Noon local time modelled as UTC noon — pragmatic snapshot between morning Tmax and nightly dose.
    noon_dt = datetime(target_date.year, target_date.month, target_date.day, 12, 0, tzinfo=timezone.utc)
    total = 0.0
    for taken_dt, dose_mg in dose_events:
        t_hours = (noon_dt - taken_dt).total_seconds() / 3600.0
        if t_hours <= 0:
            continue
        total += concentration_at_time(
            dose=dose_mg,
            ka=ka,
            ke=ke,
            vd=vd,
            t=t_hours,
            bioavailability=bioavailability,
        )
    return total


def build_pk_series(
    substances: list[str],
    dates: list[str],
    body_weight_kg: float = _DEFAULT_WEIGHT_KG,
) -> dict[str, dict[str, Optional[float]]]:
    """Return simulated PK concentrations at noon for each (date, substance) pair.

    Args:
        substances: Substance keys or aliases (e.g. ["lexapro", "lamictal", "venvanse"]).
        dates: ISO YYYY-MM-DD date strings to evaluate.
        body_weight_kg: Patient weight for weight-based Vd calculation. Defaults to
            Anders's weight (91 kg). Backend PK endpoint uses 70 kg by default —
            pass explicitly to match clinical reality.

    Returns:
        Mapping ``{date_iso: {substance_key: concentration_at_noon | None}}``.
        Returns ``None`` for a given (date, substance) when:
        - substance is not in medDataBase.json
        - no regimen is configured for the substance
        - regimen hasn't started by that date
        - no dose events found even after warm-up expansion

    Concentrations are in the units specified by medDataBase.json
    ``therapeutic_range_unit`` for each substance (ng/mL for all three
    of Anders's medications).
    """
    if not substances or not dates:
        return {}

    parsed_dates = sorted(
        {datetime.strptime(d, "%Y-%m-%d").date() for d in dates}
    )

    regimen = _load_regimen()
    dose_log = _load_dose_log()

    # Resolve canonical keys once — {input_key: (canonical_key, profile) | None}
    resolved: dict[str, Optional[tuple[str, dict]]] = {}
    for subst in substances:
        try:
            profile = get_substance_profile(subst)
            resolved[subst] = (profile["id"], profile)
        except KeyError:
            resolved[subst] = None

    result: dict[str, dict[str, Optional[float]]] = {d.isoformat(): {} for d in parsed_dates}

    for subst, resolution in resolved.items():
        if resolution is None:
            for d in parsed_dates:
                result[d.isoformat()][subst] = None
            continue

        canonical_key, profile = resolution
        profile_with_id = {**profile, "id": canonical_key}

        try:
            ka = float(profile["ka_per_hour"])
            ke = float(profile["ke_per_hour"])
            bioavailability = float(profile["bioavailability"])
            vd = _profile_volume_of_distribution(profile_with_id, body_weight_kg)
        except (KeyError, TypeError, ValueError):
            for d in parsed_dates:
                result[d.isoformat()][subst] = None
            continue

        for target_date in parsed_dates:
            window_start = datetime(
                target_date.year, target_date.month, target_date.day,
                tzinfo=timezone.utc,
            ) - timedelta(days=_WARMUP_DAYS)
            # Window end: noon on target_date (the sampling point)
            window_end = datetime(
                target_date.year, target_date.month, target_date.day, 12, 0,
                tzinfo=timezone.utc,
            )

            # Prefer real dose_log events; fall back to regimen expansion
            events = _dose_log_events_in_window(dose_log, canonical_key, window_start, window_end)
            if not events:
                events = _regimen_doses_in_window(regimen, canonical_key, window_start, window_end)

            if not events:
                result[target_date.isoformat()][subst] = None
                continue

            conc_mg_per_l = _concentration_at_noon(
                target_date, events, ka=ka, ke=ke, vd=vd, bioavailability=bioavailability
            )
            # concentration_at_time returns mg/L (= µg/mL); convert to ng/mL to
            # match therapeutic_range_unit in medDataBase.json for all listed substances.
            result[target_date.isoformat()][subst] = conc_mg_per_l * 1000.0

    return result
