/**
 * Chronotropic Response (Sprint M7).
 *
 * Delta = walkingHeartRateAvg − restingHeartRate por dia, normalizado como
 * z-score pessoal. Quantifica a capacidade cronotrópica: quanto o coração
 * acelera durante caminhada em relação ao repouso. Relevante em neuropsiquiatria
 * pois beta-bloqueadores, antipsicóticos e humor deprimido comprimem esse delta.
 *
 * Princípios (idênticos ao ABI / Sprint M5):
 *   - Função pura. Recebe snapshots, retorna série.
 *   - Interp/forecast recebem z-score normalmente; derivedFromInterpolated=true,
 *     confidence=INTERP_CONFIDENCE_MULTIPLIER (vs 1.0 pra dias reais).
 *   - Baseline calculada só sobre dias reais com walkingHR + RHR ambos presentes.
 *   - Inputs faltantes → zScore=null com reason=inputs_missing.
 */

import type { DailySnapshot } from '@/types/apple-health'
import { computeRollingBaseline, type PersonalBaseline } from './personal-baselines'
import { INTERP_CONFIDENCE_MULTIPLIER } from './interp-policy'
import { sma } from './statistics'

export interface ChronotropicComponents {
  walkingHR: number
  rhr: number
  delta: number
  zScore: number
}

export interface ChronotropicPoint {
  date: string
  zScore: number | null
  sma7: number | null
  components: ChronotropicComponents | null
  confidence: number
  derivedFromInterpolated: boolean
  reason?: 'baseline_missing' | 'inputs_missing'
}

/**
 * Computa baseline pessoal de (walkingHR − RHR) sobre dias reais.
 * Filtro: exclui `interpolated || forecasted`; exige ambos os campos não-nulos.
 * Janela 30d / mín 14 pontos.
 */
export function computeChronotropicBaseline(
  snapshots: ReadonlyArray<DailySnapshot>,
): PersonalBaseline | null {
  const deltas = snapshots.map((s) => {
    if (s.forecasted || s.interpolated) return null
    const walkingHR = s.health?.walkingHeartRateAvg ?? null
    const rhr = s.health?.restingHeartRate ?? null
    if (walkingHR == null || rhr == null) return null
    return walkingHR - rhr
  })

  return computeRollingBaseline(deltas, { minPoints: 14, windowSize: 30 })
}

/**
 * Série cronotrópica por snapshot. Sempre retorna 1 ponto por snapshot na ordem
 * original. Pontos com zScore=null mantêm `reason` pra UX/debug.
 * SMA-7d calculada sobre a série de z-scores e mesclada no resultado.
 */
export function computeChronotropicSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): ChronotropicPoint[] {
  const baseline = computeChronotropicBaseline(snapshots)

  const points: ChronotropicPoint[] = snapshots.map((snapshot) => {
    const { date } = snapshot
    const derivedFromInterpolated = !!(snapshot.interpolated || snapshot.forecasted)

    if (!baseline) {
      return { date, zScore: null, sma7: null, components: null, confidence: 0, derivedFromInterpolated, reason: 'baseline_missing' as const }
    }

    const walkingHR = snapshot.health?.walkingHeartRateAvg ?? null
    const rhr = snapshot.health?.restingHeartRate ?? null
    if (walkingHR == null || rhr == null) {
      return { date, zScore: null, sma7: null, components: null, confidence: 0, derivedFromInterpolated, reason: 'inputs_missing' as const }
    }

    const delta = walkingHR - rhr
    const zScore = baseline.sd === 0 ? 0 : (delta - baseline.mean) / baseline.sd
    const confidence = derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1

    return {
      date,
      zScore,
      sma7: null,
      components: { walkingHR, rhr, delta, zScore },
      confidence,
      derivedFromInterpolated,
    }
  })

  const zScores = points.map((p) => p.zScore)
  const sma7Values = sma(zScores, 7)

  return points.map((p, i) => ({ ...p, sma7: sma7Values[i] ?? null }))
}
