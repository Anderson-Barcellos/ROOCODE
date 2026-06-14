/**
 * HRV Variability — Sprint M7.
 *
 * Série de tendência HRV bruto + SMA-7d + SMA-30d + rolling SD 7d (variabilidade
 * dia-a-dia como marcador de flexibilidade autonômica).
 *
 * Sem classificação populacional: o Apple Watch mede SDNN ultra-curto (~1 min),
 * subestimado em relação às normas ECG de 5 min / 24 h (Malik 1996; Shaffer &
 * Ginsberg 2017). Não existe norma robusta de SDNN para wearables. Por isso este
 * chart exibe apenas tendência pessoal (SMA + envelope SD) — sem faixas Bom/Ruim.
 */

import type { DailySnapshot } from '@/types/apple-health'
import { rollingStandardDeviation } from './personal-baselines'
import { INTERP_CONFIDENCE_MULTIPLIER } from './interp-policy'
import { sma } from './statistics'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export interface HrvVariabilityPoint {
  date: string
  hrv: number | null
  sma7: number | null
  sma30: number | null
  rollingSd7: number | null
  sdBandHigh: number | null
  sdBandLow: number | null
  confidence: number
  derivedFromInterpolated: boolean
  reason?: 'inputs_missing' | 'insufficient_readiness'
  evidence: IndexEvidenceReport
}

export function computeHrvVariabilitySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): HrvVariabilityPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.hrvVariabilityChart,
    'HRVVariability',
  )
  const hrvValues = snapshots.map((s) => s.health?.hrvSdnn ?? null)

  const sma7Array = sma(hrvValues, 7)
  const sma30Array = sma(hrvValues, 30)
  const rollingSd7Array = rollingStandardDeviation(hrvValues, 7, 4)

  return snapshots.map((s, i) => {
    const hrv = s.health?.hrvSdnn ?? null
    const sma7 = sma7Array[i]
    const sma30 = sma30Array[i]
    const rollingSd7 = rollingSd7Array[i]
    const derivedFromInterpolated = !!(s.interpolated || s.forecasted)

    if (hrv == null) {
      return {
        date: s.date,
        hrv: null,
        sma7,
        sma30,
        rollingSd7,
        sdBandHigh: sma7 != null && rollingSd7 != null ? sma7 + rollingSd7 : null,
        sdBandLow: sma7 != null && rollingSd7 != null ? Math.max(0, sma7 - rollingSd7) : null,
        confidence: 0,
        derivedFromInterpolated,
        reason: 'inputs_missing' as const,
        evidence: buildIndexEvidenceReport({
          eligible: false,
          reason: 'inputs_missing',
          inputsUsed: [],
          inputsMissing: ['hrvSdnn'],
          proxiesUsed: [],
          usedInterpolated: derivedFromInterpolated,
          confidencePenalty: 0,
          readiness: readiness.status,
        }),
      }
    }

    const confidence = derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1
    const eligible = readiness.status !== 'standby'

    return {
      date: s.date,
      hrv,
      sma7,
      sma30,
      rollingSd7,
      sdBandHigh: sma7 != null && rollingSd7 != null ? sma7 + rollingSd7 : null,
      sdBandLow: sma7 != null && rollingSd7 != null ? Math.max(0, sma7 - rollingSd7) : null,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible,
        reason: eligible ? 'ok' : 'insufficient_readiness',
        inputsUsed: ['hrvSdnn'],
        inputsMissing: [],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}
