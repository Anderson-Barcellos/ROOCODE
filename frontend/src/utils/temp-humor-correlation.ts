/**
 * Temp×Humor Correlation — pipeline diário com baseline pessoal.
 *
 * Hipótese pré-registrada (Anders + memória 09/05):
 *   - Aumento da temperatura do pulso noturno (delta vs baseline 30d)
 *     precede queda da valência de humor com lag de +1 a +2 dias.
 *   - Mecanismo candidato: inflamação subclínica, disautonomia ou
 *     fragmentação circadiana.
 *
 * Robustez (não p-hacking):
 *   - Lag sweep [-3,-2,-1,0,+1,+2,+3] dias testa se pico está em +1d.
 *   - Lags negativos = controle de causalidade (pico em lag<0 = espúrio).
 *   - FDR Benjamini-Hochberg sobre m=7 lags.
 *   - Baseline rolling 30d com mín 14 pontos reais (padrão M3/M4/M5).
 *   - Filtra dias interpolated/forecasted upstream.
 */

import type { DailySnapshot } from '../types/apple-health'
import { computeRollingBaseline } from './personal-baselines'
import {
  benjaminiHochbergFdr,
  fisherCi95,
  pearson,
} from './intraday-correlation'
import { pearsonPValueFromR } from './statistics'

export const LAG_DAYS_SWEEP = [-3, -2, -1, 0, 1, 2, 3] as const
export const MIN_VALID_PAIRS = 10
export const MAX_LAG_ABS = 3
export const MIN_TOTAL_SAMPLES = MIN_VALID_PAIRS + MAX_LAG_ABS
export const PREREGISTERED_LAG_DAYS = 1
export const BASELINE_WINDOW_DAYS = 30
export const BASELINE_MIN_POINTS = 14

export interface DailyTempSample {
  date: string
  tempDelta: number
  valence: number | null
}

export interface LagEstimate {
  lagDays: number
  r: number
  p: number
  qFdr: number | null
  n: number
  ciLower: number | null
  ciUpper: number | null
}

export interface TempHumorAnalysis {
  samples: DailyTempSample[]
  lags: LagEstimate[]
  peakLagDays: number | null
  preregistered: {
    expectedLagDays: number
    expectedDirection: 'negative'
    observedR: number | null
    observedDirection: 'negative' | 'positive' | 'neutral' | 'missing'
    contradicted: boolean
    note: string
  }
}

function shiftIsoDate(dateIso: string, lagDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null
  const base = new Date(`${dateIso}T00:00:00Z`)
  if (!Number.isFinite(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + lagDays)
  return base.toISOString().slice(0, 10)
}

function isExcluded(snap: DailySnapshot): boolean {
  return snap.interpolated === true || snap.forecasted === true
}

/**
 * Para cada snapshot real (não interpolado/forecasted) com temperatura e
 * baseline pessoal disponíveis, calcula tempDelta = temp - baseline.mean.
 *
 * A baseline de cada dia usa apenas snapshots ANTERIORES filtrados
 * (causal — sem leak de dados futuros).
 */
export function buildTempHumorSamples(snapshots: DailySnapshot[]): DailyTempSample[] {
  const out: DailyTempSample[] = []

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i]
    if (isExcluded(snap)) continue

    const temp = snap.health?.pulseTemperatureC
    if (temp == null || !Number.isFinite(temp)) continue

    const priorTemps: Array<number | null> = []
    for (let j = 0; j < i; j++) {
      const prev = snapshots[j]
      if (isExcluded(prev)) continue
      const v = prev.health?.pulseTemperatureC
      priorTemps.push(v != null && Number.isFinite(v) ? v : null)
    }

    const baseline = computeRollingBaseline(priorTemps, {
      windowSize: BASELINE_WINDOW_DAYS,
      minPoints: BASELINE_MIN_POINTS,
    })
    if (!baseline) continue

    out.push({
      date: snap.date,
      tempDelta: temp - baseline.mean,
      valence: snap.mood?.valence ?? null,
    })
  }

  return out
}

/**
 * Pareamento com lag por data de calendario (YYYY-MM-DD).
 * lag>0 = temp do dia D pareada com humor do dia D+lag.
 */
export function pairAtLag(
  samples: DailyTempSample[],
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
    const tempDelta = sample.tempDelta
    const valence = paired.valence
    if (Number.isFinite(tempDelta) && valence != null && Number.isFinite(valence)) {
      xs.push(tempDelta)
      ys.push(valence)
    }
  }
  return { xs, ys }
}

export function pValueFromR(r: number, n: number): number {
  return pearsonPValueFromR(r, n)
}

/**
 * Lag sweep completo com FDR e detecção de peak.
 *
 * peakLagDays: lag com maior |r| entre os significativos (q < 0.05).
 * null se nenhum lag passar do limiar.
 */
export function analyzeTempHumor(snapshots: DailySnapshot[]): TempHumorAnalysis {
  const samples = buildTempHumorSamples(snapshots)

  const emptyPreregistered = {
    expectedLagDays: PREREGISTERED_LAG_DAYS,
    expectedDirection: 'negative' as const,
    observedR: null,
    observedDirection: 'missing' as const,
    contradicted: false,
    note: 'Sem pares suficientes para avaliar a hipótese pré-registrada (+1d, direção negativa).',
  }

  if (samples.length < MIN_TOTAL_SAMPLES) {
    return { samples, lags: [], peakLagDays: null, preregistered: emptyPreregistered }
  }

  const base = LAG_DAYS_SWEEP.map((lagDays): Omit<LagEstimate, 'qFdr'> | null => {
    const { xs, ys } = pairAtLag(samples, lagDays)
    if (xs.length < MIN_VALID_PAIRS) return null
    const r = pearson(xs, ys)
    if (!Number.isFinite(r)) return null
    const p = pValueFromR(r, xs.length)
    const ci = fisherCi95(r, xs.length)
    return {
      lagDays,
      r,
      p,
      n: xs.length,
      ciLower: ci?.lower ?? null,
      ciUpper: ci?.upper ?? null,
    }
  })

  const pValues = base.map((est) => (est && Number.isFinite(est.p) ? est.p : null))
  const qValues = benjaminiHochbergFdr(pValues)

  const lags: LagEstimate[] = []
  base.forEach((est, idx) => {
    if (!est) return
    lags.push({ ...est, qFdr: qValues[idx] })
  })

  const significant = lags.filter((l) => l.qFdr != null && l.qFdr < 0.05)
  const peakLagDays = significant.length
    ? significant.reduce((peak, l) => (Math.abs(l.r) > Math.abs(peak.r) ? l : peak)).lagDays
    : null

  const prereg = lags.find((lag) => lag.lagDays === PREREGISTERED_LAG_DAYS)
  const observedR = prereg?.r ?? null
  const observedDirection =
    prereg == null
      ? 'missing'
      : prereg.r > 0.02
        ? 'positive'
        : prereg.r < -0.02
          ? 'negative'
          : 'neutral'
  const contradicted = observedDirection === 'positive'
  const note =
    prereg == null
      ? emptyPreregistered.note
      : observedDirection === 'negative'
        ? 'Direção pré-registrada confirmada em +1d (temperatura ↑ associada a valência ↓).'
        : observedDirection === 'neutral'
          ? 'Direção em +1d ficou neutra/inconclusiva no período atual.'
          : 'Hipótese pré-registrada contradita: em +1d a direção observada foi positiva.'

  return {
    samples,
    lags,
    peakLagDays,
    preregistered: {
      expectedLagDays: PREREGISTERED_LAG_DAYS,
      expectedDirection: 'negative',
      observedR,
      observedDirection,
      contradicted,
      note,
    },
  }
}
