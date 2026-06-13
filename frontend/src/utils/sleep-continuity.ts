/**
 * Continuidade do sono — leitura clínica direta (sem score 0-100).
 *
 * Eficiência = asleep/inBed (prefere sleepEfficiencyPct derivado; recalcula dos
 * brutos como fallback). WASO = sleepAwakeHours. Faixas AASM clássicas. Os
 * componentes já entram diluídos no sleep-quality-score; aqui ganham superfície
 * própria. Política visual_only: interpolado recebe confidence 0.7.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type EfficiencyBand = 'ideal' | 'limitrofe' | 'pobre'
export type WasoBand = 'ideal' | 'limitrofe' | 'fragmentado'

const EFF_IDEAL = 85
const EFF_LIMIT = 75
const WASO_IDEAL_H = 0.5
const WASO_LIMIT_H = 1.0
const SUMMARY_WINDOW_DAYS = 14
const INTERP_CONFIDENCE_MULTIPLIER = 0.7

export interface SleepContinuityPoint {
  date: string
  efficiencyPct: number | null
  efficiencyBand: EfficiencyBand | null
  wasoHours: number | null
  wasoBand: WasoBand | null
  confidence: number
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface SleepContinuitySummary {
  latest: SleepContinuityPoint | null
  meanEfficiencyPct: number | null
  meanWasoHours: number | null
  nightsUsed: number
}

function effBand(pct: number): EfficiencyBand {
  if (pct >= EFF_IDEAL) return 'ideal'
  if (pct >= EFF_LIMIT) return 'limitrofe'
  return 'pobre'
}

function wasoBand(hours: number): WasoBand {
  if (hours < WASO_IDEAL_H) return 'ideal'
  if (hours <= WASO_LIMIT_H) return 'limitrofe'
  return 'fragmentado'
}

function efficiencyOf(snap: DailySnapshot): number | null {
  const direct = snap.health?.sleepEfficiencyPct
  if (direct != null && Number.isFinite(direct)) return direct
  const asleep = snap.health?.sleepAsleepHours
  const inBed = snap.health?.sleepInBedHours
  if (asleep != null && inBed != null && Number.isFinite(asleep) && Number.isFinite(inBed) && inBed > 0) {
    return (asleep / inBed) * 100
  }
  return null
}

export function computeSleepContinuitySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepContinuityPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.sleepContinuityIndex,
    'SleepContinuity',
  )

  return snapshots.map((snap) => {
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const efficiencyPct = efficiencyOf(snap)
    const wasoRaw = snap.health?.sleepAwakeHours
    const wasoHours = wasoRaw != null && Number.isFinite(wasoRaw) ? wasoRaw : null

    const inputsUsed: string[] = []
    if (efficiencyPct != null) inputsUsed.push('sleepEfficiencyPct')
    if (wasoHours != null) inputsUsed.push('sleepAwakeHours')
    const hasAny = inputsUsed.length > 0
    const confidence = hasAny ? (derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1) : 0

    return {
      date: snap.date,
      efficiencyPct,
      efficiencyBand: efficiencyPct != null ? effBand(efficiencyPct) : null,
      wasoHours,
      wasoBand: wasoHours != null ? wasoBand(wasoHours) : null,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible: hasAny && readiness.status !== 'standby',
        reason: hasAny
          ? readiness.status === 'standby'
            ? 'insufficient_readiness'
            : 'ok'
          : 'inputs_missing',
        inputsUsed,
        inputsMissing: hasAny ? [] : ['sleepEfficiencyPct', 'sleepAwakeHours'],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeSleepContinuitySummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepContinuitySummary {
  const series = computeSleepContinuitySeries(snapshots)
  const recent = series.slice(-SUMMARY_WINDOW_DAYS).filter((p) => !p.derivedFromInterpolated)
  const latest = series.filter((p) => p.efficiencyPct != null || p.wasoHours != null).at(-1) ?? null

  const effs = recent.map((p) => p.efficiencyPct).filter((v): v is number => v != null)
  const wasos = recent.map((p) => p.wasoHours).filter((v): v is number => v != null)
  const mean = (arr: number[]): number | null => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

  return {
    latest,
    meanEfficiencyPct: mean(effs),
    meanWasoHours: mean(wasos),
    nightsUsed: recent.length,
  }
}
