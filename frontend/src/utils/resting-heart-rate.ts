/**
 * FC de Repouso — leitura clínica dedicada (aba Coração).
 *
 * A FC de repouso já era input de outros índices, mas sem superfície própria.
 * Aqui ganha leitura direta: valor, média do período, tendência e faixa de risco
 * cardiovascular. Janela = período recebido (sem slice interno; lição do Sono).
 *
 * Faixas de referência adulto (FC repouso ↔ risco CV/mortalidade — populacional,
 * não alvo individual): ótima <65 · normal 65–75 · elevada 75–85 · alta ≥85.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type RestingHrBand = 'otima' | 'normal' | 'elevada' | 'alta'
export type RestingHrTrend = 'subindo' | 'descendo' | 'estavel'

const BAND_NORMAL_LO = 65
const BAND_ELEVADA_LO = 75
const BAND_ALTA_LO = 85
const TREND_DELTA_BPM = 2 // delta mínimo pra declarar tendência
const INTERP_CONFIDENCE_MULTIPLIER = 0.7

export interface RestingHeartRatePoint {
  date: string
  bpm: number | null
  band: RestingHrBand | null
  confidence: number
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface RestingHeartRateSummary {
  latest: RestingHeartRatePoint | null
  meanBpm: number | null
  trend: RestingHrTrend | null
  nightsUsed: number
}

function bandOf(bpm: number): RestingHrBand {
  if (bpm < BAND_NORMAL_LO) return 'otima'
  if (bpm < BAND_ELEVADA_LO) return 'normal'
  if (bpm < BAND_ALTA_LO) return 'elevada'
  return 'alta'
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function computeRestingHeartRateSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): RestingHeartRatePoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.restingHeartRateIndex,
    'RestingHeartRate',
  )

  return snapshots.map((snap) => {
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const raw = snap.health?.restingHeartRate
    const bpm = raw != null && Number.isFinite(raw) ? raw : null
    const has = bpm != null
    const confidence = has ? (derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1) : 0

    return {
      date: snap.date,
      bpm,
      band: bpm != null ? bandOf(bpm) : null,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible: has && readiness.status !== 'standby',
        reason: has ? (readiness.status === 'standby' ? 'insufficient_readiness' : 'ok') : 'inputs_missing',
        inputsUsed: has ? ['restingHeartRate'] : [],
        inputsMissing: has ? [] : ['restingHeartRate'],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeRestingHeartRateSummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): RestingHeartRateSummary {
  const series = computeRestingHeartRateSeries(snapshots)
  const real = series.filter((p) => !p.derivedFromInterpolated && p.bpm != null)
  const latest = real.at(-1) ?? null
  const values = real.map((p) => p.bpm as number)

  // Tendência: média da metade mais recente vs a mais antiga do período.
  let trend: RestingHrTrend | null = null
  if (values.length >= 4) {
    const half = Math.floor(values.length / 2)
    const older = mean(values.slice(0, half))
    const recent = mean(values.slice(half))
    if (older != null && recent != null) {
      const delta = recent - older
      trend = delta > TREND_DELTA_BPM ? 'subindo' : delta < -TREND_DELTA_BPM ? 'descendo' : 'estavel'
    }
  }

  return {
    latest,
    meanBpm: mean(values),
    trend,
    nightsUsed: real.length,
  }
}
