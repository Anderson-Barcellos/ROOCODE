/**
 * Carga Cardíaca do Estimulante — aba Coração.
 *
 * Cruza a exposição diária ao estimulante (Venvanse / lisdexanfetamina,
 * simpaticomimética) com FC de repouso e HRV, para responder: "quanto o
 * estimulante custa ao meu coração?".
 *
 * Util autocontido — reusa só as peças genéricas (calculateConcentration,
 * pearson, pValueFromR, benjaminiHochbergFdr). NÃO mexe na infra PK×Humor.
 *
 * Guarda anti-espúrio: com dose fixa diária a exposição varia pouco. Se o
 * coeficiente de variação da exposição estiver abaixo de MIN_EXPOSURE_CV, o
 * resultado é 'insufficient_variance' — sem correlação instável travestida de
 * sinal. Correlação, não causalidade.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { calculateConcentration, type PKMedication, type PKDose } from './pharmacokinetics'
import { pearson, benjaminiHochbergFdr } from './intraday-correlation'
import { pValueFromR } from './temp-humor-correlation'

export type CardiacTarget = 'restingHeartRate' | 'hrvSdnn'
export type StimulantReason = 'ok' | 'med_unavailable' | 'insufficient_data' | 'insufficient_variance'

const SAMPLE_HOURS = [0, 3, 6, 9, 12, 15, 18, 21]
const LAGS = [0, 1, 2, 3]
const MIN_PAIRS = 14
const MIN_EXPOSURE_CV = 0.1
const TARGETS: CardiacTarget[] = ['restingHeartRate', 'hrvSdnn']

export interface StimulantCardiacCell {
  target: CardiacTarget
  lag: number
  r: number | null
  pValue: number | null
  qValue: number | null
  n: number
}

export interface StimulantScatterPoint {
  exposure: number
  value: number
}

export interface StimulantCardiacLoadSummary {
  reason: StimulantReason
  exposureCv: number | null
  cells: StimulantCardiacCell[]
  scatter: StimulantScatterPoint[]
  bestCell: StimulantCardiacCell | null
}

// Exposição diária ≈ AUC: média da concentração amostrada ao longo do dia.
function dailyExposure(med: PKMedication, doses: PKDose[], dateIso: string, weightKg: number): number | null {
  const samples: number[] = []
  for (const h of SAMPLE_HOURS) {
    const hh = String(h).padStart(2, '0')
    const t = new Date(`${dateIso}T${hh}:00:00`).getTime()
    if (!Number.isFinite(t)) continue
    const c = calculateConcentration(med, doses, t, weightKg)
    if (Number.isFinite(c)) samples.push(c)
  }
  if (!samples.length) return null
  return samples.reduce((a, b) => a + b, 0) / samples.length
}

function realTarget(snap: DailySnapshot, target: CardiacTarget): number | null {
  if (snap.interpolated || snap.forecasted) return null
  const v = snap.health?.[target]
  return v != null && Number.isFinite(v) ? v : null
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return null
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance) / Math.abs(mean)
}

export function computeStimulantCardiacLoad(
  snapshots: ReadonlyArray<DailySnapshot>,
  med: PKMedication | null,
  doses: PKDose[],
  weightKg: number,
): StimulantCardiacLoadSummary {
  const empty = (reason: StimulantReason, exposureCv: number | null = null): StimulantCardiacLoadSummary => ({
    reason,
    exposureCv,
    cells: [],
    scatter: [],
    bestCell: null,
  })

  if (!med) return empty('med_unavailable')

  const exposures = snapshots.map((s) => dailyExposure(med, doses, s.date, weightKg))
  const exposureVals = exposures.filter((e): e is number => e != null && e > 0)
  const exposureCv = coefficientOfVariation(exposureVals)

  if (exposureVals.length < MIN_PAIRS) return empty('insufficient_data', exposureCv)
  if (exposureCv == null || exposureCv < MIN_EXPOSURE_CV) return empty('insufficient_variance', exposureCv)

  const cells: StimulantCardiacCell[] = []
  const pForFdr: Array<number | null> = []

  for (const target of TARGETS) {
    for (const lag of LAGS) {
      const xs: number[] = []
      const ys: number[] = []
      for (let i = lag; i < snapshots.length; i += 1) {
        const exp = exposures[i - lag]
        const val = realTarget(snapshots[i], target)
        if (exp != null && exp > 0 && val != null) {
          xs.push(exp)
          ys.push(val)
        }
      }
      const n = xs.length
      const r = n >= MIN_PAIRS ? pearson(xs, ys) : null
      const pValue = r != null && Number.isFinite(r) ? pValueFromR(r, n) : null
      cells.push({ target, lag, r, pValue, qValue: null, n })
      pForFdr.push(pValue)
    }
  }

  const q = benjaminiHochbergFdr(pForFdr)
  cells.forEach((cell, i) => {
    cell.qValue = q[i] ?? null
  })

  const scatter: StimulantScatterPoint[] = []
  for (let i = 0; i < snapshots.length; i += 1) {
    const exp = exposures[i]
    const val = realTarget(snapshots[i], 'restingHeartRate')
    if (exp != null && exp > 0 && val != null) scatter.push({ exposure: exp, value: val })
  }

  const valid = cells.filter((c) => c.qValue != null && c.r != null)
  const bestCell = valid.length
    ? valid.reduce((a, b) => ((b.qValue as number) < (a.qValue as number) ? b : a))
    : null

  return { reason: 'ok', exposureCv, cells, scatter, bestCell }
}
