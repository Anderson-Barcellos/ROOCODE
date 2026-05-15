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

const MIN_COMPONENTS_REQUIRED = 4 // de 6 — espelhando Recovery Score (3/5)

interface PartialComponents {
  components: Partial<SleepQualityComponents>
  inputsUsed: SleepQualityComponentKey[]
}

/**
 * Constrói componentes apenas para os inputs presentes. Espelha o padrão de
 * weightedScoreFrom em recovery-score.ts (que aceita 3/5 e renormaliza pesos).
 *
 * Antes da auditoria 2026-05-15 esta função exigia 6/6 inputs — mas
 * respiratoryDisturbances e spo2 raramente aparecem em todo registro Apple
 * Health (dependem do sensor estar ativo). Noites comuns nunca recebiam score.
 *
 * Retorna null apenas se < MIN_COMPONENTS_REQUIRED inputs presentes.
 */
function buildComponents(raw: RawCore): PartialComponents | null {
  const components: Partial<SleepQualityComponents> = {}
  const inputsUsed: SleepQualityComponentKey[] = []

  if (raw.sleepEffPct != null && Number.isFinite(raw.sleepEffPct)) {
    components.sleepEff = scoreSleepEff(raw.sleepEffPct)
    inputsUsed.push('sleepEff')
  }
  if (raw.deepHours != null && Number.isFinite(raw.deepHours)) {
    components.deep = scoreDeep(raw.deepHours)
    inputsUsed.push('deep')
  }
  if (raw.remHours != null && Number.isFinite(raw.remHours)) {
    components.rem = scoreRem(raw.remHours)
    inputsUsed.push('rem')
  }
  if (raw.awakeHours != null && Number.isFinite(raw.awakeHours)) {
    components.awake = scoreAwake(raw.awakeHours)
    inputsUsed.push('awake')
  }
  if (raw.respDisturbances != null && Number.isFinite(raw.respDisturbances)) {
    components.respiratory = scoreRespiratory(raw.respDisturbances)
    inputsUsed.push('respiratory')
  }
  if (raw.spo2 != null && Number.isFinite(raw.spo2)) {
    components.spo2 = scoreSpo2(raw.spo2)
    inputsUsed.push('spo2')
  }

  if (inputsUsed.length < MIN_COMPONENTS_REQUIRED) return null
  return { components, inputsUsed }
}

/**
 * Score ponderado usando apenas os inputs presentes. Pesos renormalizados
 * dividindo pela soma dos pesos dos inputs efetivamente usados, mantendo
 * o resultado na escala 0-100. Espelha weightedScoreFrom em recovery-score.ts.
 */
function weightedScore(
  components: Partial<SleepQualityComponents>,
  inputsUsed: ReadonlyArray<SleepQualityComponentKey>,
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const key of inputsUsed) {
    const value = components[key]
    if (value == null) continue
    weightedSum += value * SLEEP_QUALITY_WEIGHTS[key]
    totalWeight += SLEEP_QUALITY_WEIGHTS[key]
  }
  if (totalWeight === 0) return 0
  return weightedSum / totalWeight
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

    const partial = buildComponents(raw)
    const noFlags: SleepQualityFlags = { fragmentada: false, respiratoria: false, autonomica: false }

    if (!partial) {
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

    const score = clamp(weightedScore(partial.components, partial.inputsUsed), 0, 100)
    const zTemp = snap.health?.pulseTemperatureC != null
      ? zScore(snap.health.pulseTemperatureC, baselines.pulseTempC)
      : null
    const zRr = snap.health?.respiratoryRate != null
      ? zScore(snap.health.respiratoryRate, baselines.respiratoryRate)
      : null

    const { klass, flags } = classify(score, raw, zTemp, zRr)
    // Confidence reduzido proporcionalmente se score for parcial (menos de 6 inputs).
    // 6/6 = 1.0; 5/6 = 0.92; 4/6 = 0.83. Espelha intent de derivedFromInterpolated.
    const partialMultiplier = partial.inputsUsed.length / 6
    const confidence = (derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1) * partialMultiplier
    // Garante shape: completa componentes faltantes com 0 (não afetam classify nem display).
    // O cálculo numérico do score já usou apenas inputs presentes via renormalização.
    const fullComponents: SleepQualityComponents = {
      sleepEff: partial.components.sleepEff ?? 0,
      deep: partial.components.deep ?? 0,
      rem: partial.components.rem ?? 0,
      awake: partial.components.awake ?? 0,
      respiratory: partial.components.respiratory ?? 0,
      spo2: partial.components.spo2 ?? 0,
    }
    return {
      date,
      score,
      components: fullComponents,
      klass,
      confidence,
      derivedFromInterpolated,
      flags,
    }
  })
}
