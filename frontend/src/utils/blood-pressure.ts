/**
 * Pressão Arterial — card dormente (aba Coração).
 *
 * Hoje o Apple só registra PA em ~2% dos dias (spot-check no manguito). O card
 * nasce dormente via readiness: enquanto a cobertura real estiver abaixo do
 * `collectingMin`, mostra "Coletando — N medições"; quando o Anders acumular o
 * suficiente, acende sozinho com a classificação ACC/AHA 2017.
 *
 * Sem dipping noturno (o Apple não mede PA durante o sono).
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness, type ReadinessStatus } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type BpClass = 'normal' | 'elevada' | 'has1' | 'has2'

export interface BloodPressurePoint {
  date: string
  systolic: number | null
  diastolic: number | null
  klass: BpClass | null
  confidence: number
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface BloodPressureSummary {
  latest: BloodPressurePoint | null
  meanSystolic: number | null
  meanDiastolic: number | null
  classification: BpClass | null
  measurementsUsed: number
  readiness: ReadinessStatus | 'unknown'
  dormant: boolean
}

// ACC/AHA 2017. Ordem importa: mais grave primeiro.
export function classifyBloodPressure(systolic: number, diastolic: number): BpClass {
  if (systolic >= 140 || diastolic >= 90) return 'has2'
  if (systolic >= 130 || diastolic >= 80) return 'has1'
  if (systolic >= 120) return 'elevada'
  return 'normal'
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function computeBloodPressureSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): BloodPressurePoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.bloodPressureIndex,
    'BloodPressure',
  )

  return snapshots.map((snap) => {
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const sysRaw = snap.health?.systolicMmHg
    const diaRaw = snap.health?.diastolicMmHg
    const systolic = sysRaw != null && Number.isFinite(sysRaw) ? sysRaw : null
    const diastolic = diaRaw != null && Number.isFinite(diaRaw) ? diaRaw : null
    const has = systolic != null && diastolic != null
    const confidence = has ? (derivedFromInterpolated ? 0.7 : 1) : 0

    return {
      date: snap.date,
      systolic,
      diastolic,
      klass: has ? classifyBloodPressure(systolic, diastolic) : null,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible: has && readiness.status !== 'standby',
        reason: has ? (readiness.status === 'standby' ? 'insufficient_readiness' : 'ok') : 'inputs_missing',
        inputsUsed: has ? ['systolicMmHg', 'diastolicMmHg'] : [],
        inputsMissing: has ? [] : ['systolicMmHg', 'diastolicMmHg'],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeBloodPressureSummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): BloodPressureSummary {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.bloodPressureIndex,
    'BloodPressure',
  )
  const series = computeBloodPressureSeries(snapshots)
  const real = series.filter(
    (p) => !p.derivedFromInterpolated && p.systolic != null && p.diastolic != null,
  )
  const latest = real.at(-1) ?? null
  const meanSystolic = mean(real.map((p) => p.systolic as number))
  const meanDiastolic = mean(real.map((p) => p.diastolic as number))
  // Dormente enquanto a readiness não saiu de standby (cobertura abaixo do mínimo).
  const dormant = readiness.status === 'standby' || meanSystolic == null || meanDiastolic == null

  return {
    latest,
    meanSystolic,
    meanDiastolic,
    classification:
      !dormant && meanSystolic != null && meanDiastolic != null
        ? classifyBloodPressure(meanSystolic, meanDiastolic)
        : null,
    measurementsUsed: real.length,
    readiness: readiness.status,
    dormant,
  }
}
