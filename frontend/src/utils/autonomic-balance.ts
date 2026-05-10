/**
 * Autonomic Balance Index (Sprint M5 — 2026-05-10).
 *
 * z-score pessoal de ln(HRV/RHR). Captura balanço simpato-parassimpático
 * em uma única série, atenuando colinearidade entre HRV e RHR.
 *
 * Por que log:
 *   HRV/RHR é positivamente skewed (HRV varia 15-80ms, RHR 50-80bpm — ratio
 *   curtose pesada). Log natural estabiliza distribuição antes do z-score.
 *
 * Princípios (idênticos à Sprint M4):
 *   - Função pura. Recebe snapshots, retorna série.
 *   - Regra interim M6: snapshot interpolated/forecasted → abi=null.
 *   - Baseline única do dataset, calculada só sobre dias reais com HRV+RHR
 *     ambos presentes (mesmo padrão M3/M4).
 *   - Inputs faltantes (HRV ou RHR null) → abi=null com reason=inputs_missing.
 *
 * Bandas (z-score):
 *   z ≥ +1: dominância parassimpática (recovery alto)
 *   -1 ≤ z < +1: equilibrado
 *   z < -1: dominância simpática (stress / overtraining)
 */

import type { DailySnapshot } from '@/types/apple-health'
import { computeRollingBaseline, type PersonalBaseline } from './personal-baselines'

export const ABI_BAND_THRESHOLD = 1

export interface AbiComponents {
  hrv: number
  rhr: number
  ratio: number
  logRatio: number
  zScore: number
}

export interface AbiPoint {
  date: string
  abi: number | null
  components: AbiComponents | null
  reason?: 'interpolated' | 'forecasted' | 'baseline_missing' | 'inputs_missing'
}

function logRatio(hrv: number, rhr: number): number | null {
  if (hrv <= 0 || rhr <= 0) return null
  const r = hrv / rhr
  if (!Number.isFinite(r) || r <= 0) return null
  return Math.log(r)
}

/**
 * Computa baseline pessoal de log(HRV/RHR) sobre dias reais.
 * Mesmo padrão da Sprint M3/M4: filtrar `interpolated || forecasted` antes,
 * janela 30d / mín 14 pontos.
 */
export function computeAbiBaseline(
  snapshots: ReadonlyArray<DailySnapshot>,
): PersonalBaseline | null {
  const realLogRatios = snapshots.map((s) => {
    if (s.forecasted || s.interpolated) return null
    const hrv = s.health?.hrvSdnn ?? null
    const rhr = s.health?.restingHeartRate ?? null
    if (hrv == null || rhr == null) return null
    return logRatio(hrv, rhr)
  })

  return computeRollingBaseline(realLogRatios, { minPoints: 14, windowSize: 30 })
}

/**
 * Série ABI por snapshot. Sempre retorna 1 ponto por snapshot na ordem
 * original. Pontos com abi=null mantêm `reason` pra UX/debug.
 */
export function computeAbiSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): AbiPoint[] {
  const baseline = computeAbiBaseline(snapshots)

  return snapshots.map((snapshot) => {
    const { date } = snapshot

    if (snapshot.forecasted) {
      return { date, abi: null, components: null, reason: 'forecasted' }
    }
    if (snapshot.interpolated) {
      return { date, abi: null, components: null, reason: 'interpolated' }
    }
    if (!baseline) {
      return { date, abi: null, components: null, reason: 'baseline_missing' }
    }

    const hrv = snapshot.health?.hrvSdnn ?? null
    const rhr = snapshot.health?.restingHeartRate ?? null
    if (hrv == null || rhr == null || !Number.isFinite(hrv) || !Number.isFinite(rhr)) {
      return { date, abi: null, components: null, reason: 'inputs_missing' }
    }

    const lnr = logRatio(hrv, rhr)
    if (lnr == null) {
      return { date, abi: null, components: null, reason: 'inputs_missing' }
    }

    const zScore = baseline.sd === 0 ? 0 : (lnr - baseline.mean) / baseline.sd

    return {
      date,
      abi: zScore,
      components: {
        hrv,
        rhr,
        ratio: hrv / rhr,
        logRatio: lnr,
        zScore,
      },
    }
  })
}
