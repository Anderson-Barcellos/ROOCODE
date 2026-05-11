/**
 * Sleep Quality Score (Sprint D — Card "Noite boa/média/ruim").
 *
 * Score composto 0-100 a partir de 6 componentes do sono + 2 sinais
 * adjacentes pra classificação:
 *
 *   30% sleepEffPct       — eficiência ≥85% normal, <60% pobre
 *   15% deepHours         — meta ~1.5h adulto (Walker 2017)
 *   15% remHours          — meta ~1.5h adulto, último terço da noite
 *   15% awakeHours        — penalidade; <30min normal, >1h fragmentado
 *   15% respDisturbances  — 0 ideal, 30+ severo (proxy AHI)
 *   10% spo2              — média noturna; ≥96% normal, <90% concerning
 *
 * Anomaly detection (pulseTempC + respiratoryRate via baselines pessoais):
 *   • z > +1.5 em temp OU em FR ⇒ flag `autonomica`.
 *   • Baselines computadas só sobre dias reais (regra interim M6).
 *
 * Classes (ordem de prioridade clínica, top-down):
 *   1. `respiratoria`  — respDist alto OU SpO2 baixo
 *   2. `autonomica`    — temp/FR z > +1.5 (sinal pirogênico/disautonomia)
 *   3. `fragmentada`   — awake alto OU sleepEff baixa
 *   4. `reparadora`    — score ≥75 e sem flag
 *   5. `regular`       — meio termo
 *
 * Pesos e thresholds são "preliminary calibration" — informados por
 * literatura básica, sem validação contra outcomes pessoais. Sprint
 * futura pode recalibrar.
 *
 * Política Sprint M6: interp/forecast recebem score normalmente com
 * confidence=0.7. Baselines de temp/FR ignoram dias interp/forecast.
 * Score=null se ≥1 input core faltar (regra rigorosa, alinhada com
 * Recovery Score).
 */

import type { DailySnapshot } from '@/types/apple-health'
import { computeRollingBaseline, type PersonalBaseline } from './personal-baselines'
import { INTERP_CONFIDENCE_MULTIPLIER } from './interp-policy'

export const SLEEP_QUALITY_WEIGHTS = {
  sleepEff: 0.30,
  deep: 0.15,
  rem: 0.15,
  awake: 0.15,
  respiratory: 0.15,
  spo2: 0.10,
} as const

const DEEP_TARGET_H = 1.5
const REM_TARGET_H = 1.5
const AWAKE_PENALTY_CAP_H = 1.5
const RESP_DIST_CAP = 30
const SPO2_FLOOR = 90
const SPO2_CEIL = 96
const SLEEP_EFF_FLOOR = 60
const SLEEP_EFF_CEIL = 95
const ANOMALY_Z = 1.5

export type SleepQualityClass =
  | 'reparadora'
  | 'fragmentada'
  | 'respiratoria'
  | 'autonomica'
  | 'regular'

export type SleepQualityComponentKey =
  | 'sleepEff'
  | 'deep'
  | 'rem'
  | 'awake'
  | 'respiratory'
  | 'spo2'

export type SleepQualityComponents = Record<SleepQualityComponentKey, number>

export interface SleepQualityFlags {
  fragmentada: boolean
  respiratoria: boolean
  autonomica: boolean
}

export interface SleepQualityPoint {
  date: string
  score: number | null
  components: SleepQualityComponents | null
  klass: SleepQualityClass | null
  confidence: number
  derivedFromInterpolated: boolean
  reason?: 'inputs_missing'
  flags: SleepQualityFlags
}

export interface SleepQualityBaselines {
  pulseTempC: PersonalBaseline | null
  respiratoryRate: PersonalBaseline | null
}

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min
  if (v > max) return max
  return v
}

function scoreSleepEff(pct: number): number {
  if (pct >= SLEEP_EFF_CEIL) return 100
  if (pct <= SLEEP_EFF_FLOOR) return 0
  return ((pct - SLEEP_EFF_FLOOR) / (SLEEP_EFF_CEIL - SLEEP_EFF_FLOOR)) * 100
}

function scoreDeep(hours: number): number {
  return clamp((hours / DEEP_TARGET_H) * 100, 0, 100)
}

function scoreRem(hours: number): number {
  return clamp((hours / REM_TARGET_H) * 100, 0, 100)
}

function scoreAwake(hours: number): number {
  const penalized = clamp(hours, 0, AWAKE_PENALTY_CAP_H)
  return (1 - penalized / AWAKE_PENALTY_CAP_H) * 100
}

function scoreRespiratory(count: number): number {
  return clamp(100 - (count / RESP_DIST_CAP) * 100, 0, 100)
}

function scoreSpo2(pct: number): number {
  if (pct >= SPO2_CEIL) return 100
  if (pct <= SPO2_FLOOR) return 0
  return ((pct - SPO2_FLOOR) / (SPO2_CEIL - SPO2_FLOOR)) * 100
}

interface RawCore {
  sleepEffPct: number | null
  deepHours: number | null
  remHours: number | null
  awakeHours: number | null
  respDisturbances: number | null
  spo2: number | null
}

function buildComponents(raw: RawCore): SleepQualityComponents | null {
  const values = [raw.sleepEffPct, raw.deepHours, raw.remHours, raw.awakeHours, raw.respDisturbances, raw.spo2]
  if (values.some((v) => v == null || !Number.isFinite(v))) return null
  return {
    sleepEff: scoreSleepEff(raw.sleepEffPct!),
    deep: scoreDeep(raw.deepHours!),
    rem: scoreRem(raw.remHours!),
    awake: scoreAwake(raw.awakeHours!),
    respiratory: scoreRespiratory(raw.respDisturbances!),
    spo2: scoreSpo2(raw.spo2!),
  }
}

function weightedScore(c: SleepQualityComponents): number {
  return (
    c.sleepEff * SLEEP_QUALITY_WEIGHTS.sleepEff +
    c.deep * SLEEP_QUALITY_WEIGHTS.deep +
    c.rem * SLEEP_QUALITY_WEIGHTS.rem +
    c.awake * SLEEP_QUALITY_WEIGHTS.awake +
    c.respiratory * SLEEP_QUALITY_WEIGHTS.respiratory +
    c.spo2 * SLEEP_QUALITY_WEIGHTS.spo2
  )
}

export function computeSleepQualityBaselines(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepQualityBaselines {
  const realTemp = snapshots.map((s) =>
    s.forecasted || s.interpolated ? null : s.health?.pulseTemperatureC ?? null,
  )
  const realRr = snapshots.map((s) =>
    s.forecasted || s.interpolated ? null : s.health?.respiratoryRate ?? null,
  )
  return {
    pulseTempC: computeRollingBaseline(realTemp, { minPoints: 14, windowSize: 30 }),
    respiratoryRate: computeRollingBaseline(realRr, { minPoints: 14, windowSize: 30 }),
  }
}

function zScore(value: number, baseline: PersonalBaseline | null): number | null {
  if (!baseline || baseline.sd === 0) return null
  return (value - baseline.mean) / baseline.sd
}

function classify(
  score: number,
  raw: RawCore,
  zTemp: number | null,
  zRr: number | null,
): { klass: SleepQualityClass; flags: SleepQualityFlags } {
  const flags: SleepQualityFlags = {
    fragmentada: (raw.awakeHours ?? 0) >= 1.0 || (raw.sleepEffPct ?? 100) < 80,
    respiratoria: (raw.respDisturbances ?? 0) >= 15 || (raw.spo2 ?? 100) < 92,
    autonomica:
      (zTemp != null && zTemp > ANOMALY_Z) || (zRr != null && zRr > ANOMALY_Z),
  }

  if (flags.respiratoria) return { klass: 'respiratoria', flags }
  if (flags.autonomica) return { klass: 'autonomica', flags }
  if (flags.fragmentada) return { klass: 'fragmentada', flags }
  if (score >= 75) return { klass: 'reparadora', flags }
  return { klass: 'regular', flags }
}

export function computeSleepQualityScoreSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepQualityPoint[] {
  const baselines = computeSleepQualityBaselines(snapshots)

  return snapshots.map((snap) => {
    const date = snap.date
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const raw: RawCore = {
      sleepEffPct: snap.health?.sleepEfficiencyPct ?? null,
      deepHours: snap.health?.sleepDeepHours ?? null,
      remHours: snap.health?.sleepRemHours ?? null,
      awakeHours: snap.health?.sleepAwakeHours ?? null,
      respDisturbances: snap.health?.respiratoryDisturbances ?? null,
      spo2: snap.health?.spo2 ?? null,
    }

    const components = buildComponents(raw)
    const noFlags: SleepQualityFlags = { fragmentada: false, respiratoria: false, autonomica: false }

    if (!components) {
      return {
        date,
        score: null,
        components: null,
        klass: null,
        confidence: 0,
        derivedFromInterpolated,
        reason: 'inputs_missing' as const,
        flags: noFlags,
      }
    }

    const score = clamp(weightedScore(components), 0, 100)
    const zTemp = snap.health?.pulseTemperatureC != null
      ? zScore(snap.health.pulseTemperatureC, baselines.pulseTempC)
      : null
    const zRr = snap.health?.respiratoryRate != null
      ? zScore(snap.health.respiratoryRate, baselines.respiratoryRate)
      : null

    const { klass, flags } = classify(score, raw, zTemp, zRr)
    const confidence = derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1
    return {
      date,
      score,
      components,
      klass,
      confidence,
      derivedFromInterpolated,
      flags,
    }
  })
}
