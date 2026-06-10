import type { DailySnapshot } from '@/types/apple-health'

import {
  calculateConcentration,
  getMoodCorrelationWindowMs,
  PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML,
  type PKDose,
  type PKMedication,
} from './pharmacokinetics'

export interface DailyEmaSample {
  date: string
  ema: number
  valence: number | null
}

export const LAG_DAYS_SWEEP = [-3, -2, -1, 0, 1, 2, 3] as const
export const MIN_VALID_PAIRS = 10
export const MAX_LAG_ABS = 3
export const MIN_TOTAL_SAMPLES = MIN_VALID_PAIRS + MAX_LAG_ABS

function shiftIsoDate(dateIso: string, lagDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null
  const base = new Date(`${dateIso}T00:00:00Z`)
  if (!Number.isFinite(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + lagDays)
  return base.toISOString().slice(0, 10)
}

function isExcludedSnapshot(snapshot: DailySnapshot): boolean {
  return snapshot.interpolated === true || snapshot.forecasted === true
}

export function buildDailyEmaSamples(
  med: PKMedication,
  doses: PKDose[],
  snapshots: DailySnapshot[],
  weightKg: number,
): DailyEmaSample[] {
  const windowMs = getMoodCorrelationWindowMs(med)
  const hourMs = 60 * 60 * 1000
  const numPoints = Math.max(6, Math.round(windowMs / hourMs))

  const samples: DailyEmaSample[] = []
  for (const snapshot of snapshots) {
    if (isExcludedSnapshot(snapshot)) continue

    const eod = new Date(`${snapshot.date}T23:59:59`).getTime()
    if (!Number.isFinite(eod)) continue

    let weightedSum = 0
    let weightSum = 0
    for (let i = 0; i < numPoints; i++) {
      const t = eod - i * hourMs
      const concentration = calculateConcentration(med, doses, t, weightKg)
      if (Number.isFinite(concentration) && concentration > PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML) {
        const ageMs = i * hourMs
        const weight = Math.exp(-ageMs / Math.max(windowMs, hourMs))
        weightedSum += concentration * weight
        weightSum += weight
      }
    }

    if (weightSum > 0) {
      samples.push({
        date: snapshot.date,
        ema: weightedSum / weightSum,
        valence: snapshot.mood?.valence ?? null,
      })
    }
  }

  return samples
}

export function pairAtLag(
  samples: DailyEmaSample[],
  lagDays: number,
): { xs: number[]; ys: number[] } {
  const byDate = new Map(samples.map((sample) => [sample.date, sample]))
  const xs: number[] = []
  const ys: number[] = []

  for (const sample of samples) {
    const shiftedDate = shiftIsoDate(sample.date, lagDays)
    if (!shiftedDate) continue
    const paired = byDate.get(shiftedDate)
    if (!paired) continue

    const ema = sample.ema
    const valence = paired.valence
    if (Number.isFinite(ema) && valence != null && Number.isFinite(valence)) {
      xs.push(ema)
      ys.push(valence)
    }
  }

  return { xs, ys }
}
