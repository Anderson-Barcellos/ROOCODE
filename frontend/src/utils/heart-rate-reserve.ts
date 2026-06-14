/**
 * Heart Rate Reserve (Sprint M7 — 2026-05-11).
 *
 * HRR = HRmax − RHR. Representa a capacidade funcional do sistema cardiovascular
 * de aumentar a FC em resposta ao esforço (Karvonen formula context).
 *
 * Walking reserve % = (walkingHR − RHR) / HRR × 100: proxy de intensidade
 * relativa da caminhada diária. Orientação ACSM: 40-60% HRR corresponde a
 * intensidade moderada pra condicionamento aeróbico.
 *
 * Princípios:
 *   - Sem z-score pessoal — reserva é diretamente interpretável.
 *   - walkingReservePct > 100% é clinicamente informativo (FC excedeu HRmax estimado).
 *   - Interp/forecast recebem confidence = INTERP_CONFIDENCE_MULTIPLIER.
 */

import type { DailySnapshot } from '@/types/apple-health'
import { ANDERS_HRMAX_BPM } from './health-policies'
import { INTERP_CONFIDENCE_MULTIPLIER } from './interp-policy'
import { sma } from './statistics'

export interface HrrPoint {
  date: string
  hrr: number | null
  hrrSma7: number | null
  walkingReservePct: number | null
  rhr: number | null
  walkingHR: number | null
  confidence: number
  derivedFromInterpolated: boolean
  reason?: 'inputs_missing'
}

export function computeHeartRateReserveSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): HrrPoint[] {
  const rhrValues = snapshots.map((s) => s.health?.restingHeartRate ?? null)
  const walkingHRValues = snapshots.map((s) => s.health?.walkingHeartRateAvg ?? null)

  const hrrValues = rhrValues.map((rhr) => (rhr != null ? ANDERS_HRMAX_BPM - rhr : null))
  const hrrSma7 = sma(hrrValues, 7)

  return snapshots.map((s, i) => {
    const { date } = s
    const rhr = rhrValues[i]
    const walkingHR = walkingHRValues[i]
    const hrr = hrrValues[i]
    const derivedFromInterpolated = !!(s.interpolated || s.forecasted)

    if (rhr == null) {
      return {
        date,
        hrr: null,
        hrrSma7: hrrSma7[i],
        walkingReservePct: null,
        rhr: null,
        walkingHR,
        confidence: 0,
        derivedFromInterpolated,
        reason: 'inputs_missing' as const,
      }
    }

    let walkingReservePct: number | null = null
    if (walkingHR != null && hrr != null && hrr > 0) {
      const raw = ((walkingHR - rhr) / hrr) * 100
      walkingReservePct = Math.max(0, raw)
    }

    const confidence = derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1

    return {
      date,
      hrr,
      hrrSma7: hrrSma7[i],
      walkingReservePct,
      rhr,
      walkingHR,
      confidence,
      derivedFromInterpolated,
    }
  })
}
