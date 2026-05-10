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
 *   - Política rigorosa: 5/5 componentes obrigatórios; se faltar 1 → null.
 *     Decisão revisável em sprint futura (calibração com sintomas reportados).
 *
 * Pesos são "preliminary calibration" — informados por literatura Whoop/Oura,
 * sem validação empírica contra outcomes Anders. Sprint futura pode recalibrar.
 */

import type { DailySnapshot } from '@/types/apple-health'
import { computeRollingBaseline, type PersonalBaseline } from './personal-baselines'
import { computeSleepDebt } from './sleep-debt'

export const RECOVERY_WEIGHTS = {
  hrv: 0.30,
  sleepEff: 0.25,
  rhr: 0.20,
  sleepDebt: 0.15,
  mood: 0.10,
} as const

const SLEEP_DEBT_CAP_HOURS = 7
const Z_CLAMP = 2

export interface RecoveryComponents {
  hrv: number
  sleepEff: number
  rhr: number
  sleepDebt: number
  mood: number
}

export interface RecoveryScorePoint {
  date: string
  score: number | null
  components: RecoveryComponents | null
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

function buildComponents(inputs: RawInputs, baselines: RecoveryBaselines): RecoveryComponents | null {
  const { hrv, rhr, sleepEffPct, sleepDebt7d, valence } = inputs
  if (hrv == null || rhr == null || sleepEffPct == null || sleepDebt7d == null || valence == null) {
    return null
  }
  if (!baselines.hrv || !baselines.rhr) {
    return null
  }
  if (
    !Number.isFinite(hrv) ||
    !Number.isFinite(rhr) ||
    !Number.isFinite(sleepEffPct) ||
    !Number.isFinite(sleepDebt7d) ||
    !Number.isFinite(valence)
  ) {
    return null
  }

  const hrvComp = zToScore(zScore(hrv, baselines.hrv))
  const rhrComp = zToScoreInverted(zScore(rhr, baselines.rhr))
  const sleepEffComp = clamp(sleepEffPct, 0, 100)
  const debtClamped = clamp(sleepDebt7d, 0, SLEEP_DEBT_CAP_HOURS)
  const sleepDebtComp = (1 - debtClamped / SLEEP_DEBT_CAP_HOURS) * 100
  const moodComp = ((clamp(valence, -1, 1) + 1) / 2) * 100

  return {
    hrv: hrvComp,
    sleepEff: sleepEffComp,
    rhr: rhrComp,
    sleepDebt: sleepDebtComp,
    mood: moodComp,
  }
}

function weightedScore(components: RecoveryComponents): number {
  return (
    components.hrv * RECOVERY_WEIGHTS.hrv +
    components.sleepEff * RECOVERY_WEIGHTS.sleepEff +
    components.rhr * RECOVERY_WEIGHTS.rhr +
    components.sleepDebt * RECOVERY_WEIGHTS.sleepDebt +
    components.mood * RECOVERY_WEIGHTS.mood
  )
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

    if (!baselines.hrv || !baselines.rhr) {
      return { date, score: null, components: null, confidence: 0, derivedFromInterpolated, reason: 'baseline_missing' as const }
    }

    const components = buildComponents(
      {
        hrv: snapshot.health?.hrvSdnn ?? null,
        rhr: snapshot.health?.restingHeartRate ?? null,
        sleepEffPct: snapshot.health?.sleepEfficiencyPct ?? null,
        sleepDebt7d: debtByDate.get(date) ?? null,
        valence: snapshot.mood?.valence ?? null,
      },
      baselines,
    )

    if (!components) {
      return { date, score: null, components: null, confidence: 0, derivedFromInterpolated, reason: 'inputs_missing' as const }
    }

    const score = clamp(weightedScore(components), 0, 100)
    const confidence = derivedFromInterpolated ? 0.7 : 1
    return { date, score, components, confidence, derivedFromInterpolated }
  })
}
