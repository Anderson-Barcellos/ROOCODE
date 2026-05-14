/**
 * Recovery Score composto (Sprint M4 — 2026-05-10).
 *
 * Score 0-100 estilo Whoop derivado de 5 componentes ponderados:
 *   30% HRV z-score pessoal     (clamp ±2σ → 0-100)
 *   25% Sleep efficiency        (0-100 direto)
 *   20% RHR z-score invertido   (clamp ±2σ → 100-0; RHR alto = recovery baixo)
 *   15% Sleep debt invertido    (debt_cumulative_7d clamp [0,7]h)
 *   10% Mood valence reescalado (de [-1,+1] pra [0,100])
 *
 * Princípios:
 *   - Função pura. Recebe snapshots, retorna série.
 *   - Sprint M6: interp/forecast recebem score normalmente; derivedFromInterpolated=true,
 *     confidence=0.7 (vs 1.0 pra dias reais). Baselines continuam excluindo interp/forecast.
 *   - Baselines HRV/RHR únicas do dataset, calculadas só sobre dias reais
 *     (mesmo padrão da Sprint M3, vital-signs-timeline).
 *   - Política de inputs (BACKLOG #29, 2026-05-14): score requer ≥3/5 inputs
 *     reais. Pesos são renormalizados pelos inputs presentes; componentes
 *     ausentes ficam como 0 (sentinela) e `inputsUsed` enumera os reais.
 *     Quando < 3 inputs disponíveis → score=null com reason='inputs_missing'.
 *     `completeness` (0-1) reporta a fração de inputs usados.
 *
 * Pesos são "preliminary calibration" — informados por literatura Whoop/Oura,
 * sem validação empírica contra outcomes Anders. Sprint futura pode recalibrar.
 */

import type { DailySnapshot } from '@/types/apple-health'
import { computeRollingBaseline, type PersonalBaseline } from './personal-baselines'
import { computeSleepDebt } from './sleep-debt'
import { INTERP_CONFIDENCE_MULTIPLIER } from './interp-policy'

export const RECOVERY_WEIGHTS = {
  hrv: 0.30,
  sleepEff: 0.25,
  rhr: 0.20,
  sleepDebt: 0.15,
  mood: 0.10,
} as const

const SLEEP_DEBT_CAP_HOURS = 7
const Z_CLAMP = 2
const MIN_INPUTS_REQUIRED = 3

export interface RecoveryComponents {
  hrv: number
  sleepEff: number
  rhr: number
  sleepDebt: number
  mood: number
}

export type RecoveryComponentKey = keyof RecoveryComponents

export interface RecoveryScorePoint {
  date: string
  score: number | null
  components: RecoveryComponents | null
  /** Inputs reais usados no cálculo. Vazio quando score=null. */
  inputsUsed: ReadonlyArray<RecoveryComponentKey>
  /** Fração dos 5 inputs presentes (0..1). 1.0 = score completo. */
  completeness: number
  confidence: number
  derivedFromInterpolated: boolean
  reason?: 'baseline_missing' | 'inputs_missing'
}

export interface RecoveryBaselines {
  hrv: PersonalBaseline | null
  rhr: PersonalBaseline | null
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function zScore(value: number, baseline: PersonalBaseline): number {
  if (baseline.sd === 0) return 0
  return (value - baseline.mean) / baseline.sd
}

/**
 * Mapeia z-score [-2, +2] → [0, 100]. Maior z = melhor (uso pra HRV).
 */
function zToScore(z: number): number {
  const clamped = clamp(z, -Z_CLAMP, Z_CLAMP)
  return ((clamped + Z_CLAMP) / (2 * Z_CLAMP)) * 100
}

/**
 * Mapeia z-score [-2, +2] → [100, 0]. Maior z = pior (uso pra RHR).
 */
function zToScoreInverted(z: number): number {
  const clamped = clamp(z, -Z_CLAMP, Z_CLAMP)
  return ((Z_CLAMP - clamped) / (2 * Z_CLAMP)) * 100
}

/**
 * Computa baselines pessoais HRV + RHR sobre dias reais (regra interim M6).
 * Janela 30d, mínimo 14 pontos. Retorna null nos campos sem dados suficientes.
 */
export function computeRecoveryBaselines(snapshots: ReadonlyArray<DailySnapshot>): RecoveryBaselines {
  const realHrv = snapshots.map((s) =>
    s.forecasted || s.interpolated ? null : s.health?.hrvSdnn ?? null,
  )
  const realRhr = snapshots.map((s) =>
    s.forecasted || s.interpolated ? null : s.health?.restingHeartRate ?? null,
  )

  return {
    hrv: computeRollingBaseline(realHrv, { minPoints: 14, windowSize: 30 }),
    rhr: computeRollingBaseline(realRhr, { minPoints: 14, windowSize: 30 }),
  }
}

interface RawInputs {
  hrv: number | null
  rhr: number | null
  sleepEffPct: number | null
  sleepDebt7d: number | null
  valence: number | null
}

interface PartialComponentsResult {
  components: RecoveryComponents
  inputsUsed: RecoveryComponentKey[]
}

/**
 * Calcula até 5 componentes. Componentes ausentes ficam como 0 (sentinela);
 * `inputsUsed` enumera os reais para que o weighted score normalize sobre
 * eles. Retorna null se < MIN_INPUTS_REQUIRED inputs disponíveis.
 *
 * HRV/RHR exigem baselines pessoais — sem elas esses 2 inputs não entram
 * mesmo que os dados brutos existam.
 */
function buildPartialComponents(
  inputs: RawInputs,
  baselines: RecoveryBaselines,
): PartialComponentsResult | null {
  const { hrv, rhr, sleepEffPct, sleepDebt7d, valence } = inputs
  const components: RecoveryComponents = { hrv: 0, sleepEff: 0, rhr: 0, sleepDebt: 0, mood: 0 }
  const inputsUsed: RecoveryComponentKey[] = []

  if (baselines.hrv && hrv != null && Number.isFinite(hrv)) {
    components.hrv = zToScore(zScore(hrv, baselines.hrv))
    inputsUsed.push('hrv')
  }
  if (baselines.rhr && rhr != null && Number.isFinite(rhr)) {
    components.rhr = zToScoreInverted(zScore(rhr, baselines.rhr))
    inputsUsed.push('rhr')
  }
  if (sleepEffPct != null && Number.isFinite(sleepEffPct)) {
    components.sleepEff = clamp(sleepEffPct, 0, 100)
    inputsUsed.push('sleepEff')
  }
  if (sleepDebt7d != null && Number.isFinite(sleepDebt7d)) {
    const debtClamped = clamp(sleepDebt7d, 0, SLEEP_DEBT_CAP_HOURS)
    components.sleepDebt = (1 - debtClamped / SLEEP_DEBT_CAP_HOURS) * 100
    inputsUsed.push('sleepDebt')
  }
  if (valence != null && Number.isFinite(valence)) {
    components.mood = ((clamp(valence, -1, 1) + 1) / 2) * 100
    inputsUsed.push('mood')
  }

  if (inputsUsed.length < MIN_INPUTS_REQUIRED) return null

  return { components, inputsUsed }
}

/**
 * Weighted score normalizado pelos pesos dos inputs presentes. Quando 5/5,
 * RECOVERY_WEIGHTS soma 1.0 e o resultado coincide com o cálculo original.
 * Quando parcial, divide por soma(pesos presentes) pra manter escala 0-100.
 */
function weightedScoreFrom(
  components: RecoveryComponents,
  inputsUsed: ReadonlyArray<RecoveryComponentKey>,
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const key of inputsUsed) {
    weightedSum += components[key] * RECOVERY_WEIGHTS[key]
    totalWeight += RECOVERY_WEIGHTS[key]
  }
  if (totalWeight === 0) return 0
  return weightedSum / totalWeight
}

/**
 * Gera a série Recovery Score pra cada snapshot. Sempre retorna 1 ponto por
 * snapshot na ordem original — pontos com score=null mantêm a `reason`.
 */
export function computeRecoveryScoreSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): RecoveryScorePoint[] {
  const baselines = computeRecoveryBaselines(snapshots)
  const debtSeries = computeSleepDebt(snapshots as DailySnapshot[])
  const debtByDate = new Map(debtSeries.map((p) => [p.date, p.debt_cumulative_7d]))

  return snapshots.map((snapshot) => {
    const { date } = snapshot
    const derivedFromInterpolated = !!(snapshot.interpolated || snapshot.forecasted)

    if (!baselines.hrv && !baselines.rhr) {
      // Sem baselines reais HRV nem RHR ainda há chance de score parcial via
      // sleepEff + sleepDebt + mood — só negamos quando ambas as baselines
      // necessárias para a maioria dos pontos estão ausentes.
      return {
        date,
        score: null,
        components: null,
        inputsUsed: [],
        completeness: 0,
        confidence: 0,
        derivedFromInterpolated,
        reason: 'baseline_missing' as const,
      }
    }

    const partial = buildPartialComponents(
      {
        hrv: snapshot.health?.hrvSdnn ?? null,
        rhr: snapshot.health?.restingHeartRate ?? null,
        sleepEffPct: snapshot.health?.sleepEfficiencyPct ?? null,
        sleepDebt7d: debtByDate.get(date) ?? null,
        valence: snapshot.mood?.valence ?? null,
      },
      baselines,
    )

    if (!partial) {
      return {
        date,
        score: null,
        components: null,
        inputsUsed: [],
        completeness: 0,
        confidence: 0,
        derivedFromInterpolated,
        reason: 'inputs_missing' as const,
      }
    }

    const { components, inputsUsed } = partial
    const score = clamp(weightedScoreFrom(components, inputsUsed), 0, 100)
    const completeness = inputsUsed.length / 5
    const baseConfidence = derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1
    const confidence = baseConfidence * completeness
    return {
      date,
      score,
      components,
      inputsUsed,
      completeness,
      confidence,
      derivedFromInterpolated,
    }
  })
}
