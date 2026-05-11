/**
 * HRV Variability — Sprint M7.
 *
 * Série de tendência HRV bruto + SMA-7d + SMA-30d + rolling SD 7d (variabilidade
 * dia-a-dia como marcador de flexibilidade autonômica). Ao contrário do ABI,
 * não usa baseline pessoal para z-score — classifica contra bandas populacionais
 * ajustadas por idade/sexo (masculino ~39 anos).
 *
 * Referências: Malik 1996 (Task Force HRV standards); Shaffer & Ginsberg 2017
 * (overview of HRV metrics and norms).
 */

import type { DailySnapshot } from '@/types/apple-health'
import { rollingStandardDeviation } from './personal-baselines'
import { INTERP_CONFIDENCE_MULTIPLIER } from './interp-policy'
import { sma } from './statistics'
import type { ClinicalTone } from './health-policies'

export interface HrvBand {
  label: string
  min: number
  max: number
  tone: ClinicalTone
  color: string
}

export const HRV_BANDS_MALE_39: HrvBand[] = [
  { label: 'Ruim',        min: 0,   max: 20,  tone: 'negative', color: '#fca5a5' },
  { label: 'Médio-Baixo', min: 20,  max: 40,  tone: 'watch',    color: '#fed7aa' },
  { label: 'Bom',         min: 40,  max: 60,  tone: 'positive', color: '#bbf7d0' },
  { label: 'Excelente',   min: 60,  max: 999, tone: 'positive', color: '#86efac' },
]

export interface HrvVariabilityPoint {
  date: string
  hrv: number | null
  sma7: number | null
  sma30: number | null
  rollingSd7: number | null
  sdBandHigh: number | null
  sdBandLow: number | null
  band: HrvBand | null
  confidence: number
  derivedFromInterpolated: boolean
  reason?: 'inputs_missing'
}

export function getHrvBand(hrv: number | null): HrvBand | null {
  if (hrv == null) return null
  for (const band of HRV_BANDS_MALE_39) {
    if (hrv >= band.min && hrv < band.max) return band
  }
  return HRV_BANDS_MALE_39[HRV_BANDS_MALE_39.length - 1]
}

export function computeHrvVariabilitySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): HrvVariabilityPoint[] {
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
        band: null,
        confidence: 0,
        derivedFromInterpolated,
        reason: 'inputs_missing' as const,
      }
    }

    const confidence = derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1

    return {
      date: s.date,
      hrv,
      sma7,
      sma30,
      rollingSd7,
      sdBandHigh: sma7 != null && rollingSd7 != null ? sma7 + rollingSd7 : null,
      sdBandLow: sma7 != null && rollingSd7 != null ? Math.max(0, sma7 - rollingSd7) : null,
      band: getHrvBand(hrv),
      confidence,
      derivedFromInterpolated,
    }
  })
}
