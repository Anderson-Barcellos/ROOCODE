import type { DailySnapshot } from '@/types/apple-health'
import { computeRollingBaseline, type PersonalBaseline } from './personal-baselines'
import { buildPulseTemperatureProxySeries } from './pulse-temperature-proxy'
import { computeSleepDebt } from './sleep-debt'
import { computeSleepQualityScoreSeries } from './sleep-quality-score'
import { INTERP_CONFIDENCE_MULTIPLIER } from './interp-policy'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export const RECOVERY_INDEX_WEIGHTS = {
  sleep: 0.32,
  sleepDebt: 0.18,
  hrv: 0.22,
  rhr: 0.18,
  pulseTemp: 0.10,
} as const

const MIN_INPUTS_REQUIRED = 3
const BASELINE_MIN_POINTS = 14
const BASELINE_MATURE_POINTS = 30
const BASELINE_WINDOW_SIZE = 90
const Z_CLAMP = 2
const SLEEP_DEBT_CAP_HOURS = 10

export interface RecoveryIndexComponents {
  sleep: number
  sleepDebt: number
  hrv: number
  rhr: number
  pulseTemp: number
}

export type RecoveryIndexComponentKey = keyof RecoveryIndexComponents

export interface RecoveryIndexPoint {
  date: string
  score: number | null
  components: RecoveryIndexComponents | null
  inputsUsed: ReadonlyArray<RecoveryIndexComponentKey>
  completeness: number
  confidence: number
  derivedFromInterpolated: boolean
  exploratory: boolean
  reason?: 'baseline_missing' | 'inputs_missing' | 'insufficient_readiness'
  evidence: IndexEvidenceReport
}

export interface RecoveryIndexBaselines {
  hrv: PersonalBaseline | null
  rhr: PersonalBaseline | null
  pulseTemp: PersonalBaseline | null
}

interface PartialComponentsResult {
  components: RecoveryIndexComponents
  inputsUsed: RecoveryIndexComponentKey[]
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function zScore(value: number, baseline: PersonalBaseline): number {
  if (baseline.sd === 0) return 0
  return (value - baseline.mean) / baseline.sd
}

function zToScore(z: number): number {
  const clamped = clamp(z, -Z_CLAMP, Z_CLAMP)
  return ((clamped + Z_CLAMP) / (2 * Z_CLAMP)) * 100
}

function zToScoreInverted(z: number): number {
  const clamped = clamp(z, -Z_CLAMP, Z_CLAMP)
  return ((Z_CLAMP - clamped) / (2 * Z_CLAMP)) * 100
}

function absoluteZToScore(z: number): number {
  const normalized = clamp(Math.abs(z), 0, Z_CLAMP)
  return (1 - normalized / Z_CLAMP) * 100
}

function computeSleepComponent(
  latestSleepScore: number | null,
  trailingSleepAverage: number | null,
): number | null {
  if (latestSleepScore == null && trailingSleepAverage == null) return null
  if (latestSleepScore != null && trailingSleepAverage != null) {
    return latestSleepScore * 0.6 + trailingSleepAverage * 0.4
  }
  return latestSleepScore ?? trailingSleepAverage
}

function computeSleepDebtScore(hours: number | null): number | null {
  if (hours == null || !Number.isFinite(hours)) return null
  const debt = clamp(hours, 0, SLEEP_DEBT_CAP_HOURS)
  return (1 - debt / SLEEP_DEBT_CAP_HOURS) * 100
}

export function computeRecoveryIndexBaselines(
  snapshots: ReadonlyArray<DailySnapshot>,
): RecoveryIndexBaselines {
  const realHrv = snapshots.map((snapshot) =>
    snapshot.forecasted || snapshot.interpolated ? null : snapshot.health?.hrvSdnn ?? null,
  )
  const realRhr = snapshots.map((snapshot) =>
    snapshot.forecasted || snapshot.interpolated ? null : snapshot.health?.restingHeartRate ?? null,
  )
  const realTemp = snapshots.map((snapshot) =>
    snapshot.forecasted || snapshot.interpolated ? null : snapshot.health?.pulseTemperatureC ?? null,
  )

  return {
    hrv: computeRollingBaseline(realHrv, { minPoints: BASELINE_MIN_POINTS, windowSize: BASELINE_WINDOW_SIZE }),
    rhr: computeRollingBaseline(realRhr, { minPoints: BASELINE_MIN_POINTS, windowSize: BASELINE_WINDOW_SIZE }),
    pulseTemp: computeRollingBaseline(realTemp, { minPoints: BASELINE_MIN_POINTS, windowSize: BASELINE_WINDOW_SIZE }),
  }
}

function buildPartialComponents(
  inputs: {
    sleep: number | null
    sleepDebt: number | null
    hrv: number | null
    rhr: number | null
    pulseTemp: number | null
  },
  baselines: RecoveryIndexBaselines,
): PartialComponentsResult | null {
  const components: RecoveryIndexComponents = {
    sleep: 0,
    sleepDebt: 0,
    hrv: 0,
    rhr: 0,
    pulseTemp: 0,
  }
  const inputsUsed: RecoveryIndexComponentKey[] = []

  if (inputs.sleep != null && Number.isFinite(inputs.sleep)) {
    components.sleep = clamp(inputs.sleep, 0, 100)
    inputsUsed.push('sleep')
  }
  if (inputs.sleepDebt != null && Number.isFinite(inputs.sleepDebt)) {
    components.sleepDebt = clamp(inputs.sleepDebt, 0, 100)
    inputsUsed.push('sleepDebt')
  }
  if (baselines.hrv && inputs.hrv != null && Number.isFinite(inputs.hrv)) {
    components.hrv = zToScore(zScore(inputs.hrv, baselines.hrv))
    inputsUsed.push('hrv')
  }
  if (baselines.rhr && inputs.rhr != null && Number.isFinite(inputs.rhr)) {
    components.rhr = zToScoreInverted(zScore(inputs.rhr, baselines.rhr))
    inputsUsed.push('rhr')
  }
  if (baselines.pulseTemp && inputs.pulseTemp != null && Number.isFinite(inputs.pulseTemp)) {
    components.pulseTemp = absoluteZToScore(zScore(inputs.pulseTemp, baselines.pulseTemp))
    inputsUsed.push('pulseTemp')
  }

  if (inputsUsed.length < MIN_INPUTS_REQUIRED) return null
  return { components, inputsUsed }
}

function weightedScoreFrom(
  components: RecoveryIndexComponents,
  inputsUsed: ReadonlyArray<RecoveryIndexComponentKey>,
): number {
  let weightedSum = 0
  let totalWeight = 0

  for (const key of inputsUsed) {
    weightedSum += components[key] * RECOVERY_INDEX_WEIGHTS[key]
    totalWeight += RECOVERY_INDEX_WEIGHTS[key]
  }

  if (totalWeight === 0) return 0
  return weightedSum / totalWeight
}

export function rankRecoveryIndexComponents(
  components: RecoveryIndexComponents,
  inputsUsed?: ReadonlyArray<RecoveryIndexComponentKey>,
): Array<{ component: RecoveryIndexComponentKey; score: number }> {
  const keys = inputsUsed && inputsUsed.length > 0
    ? inputsUsed
    : (Object.keys(components) as RecoveryIndexComponentKey[])
  return keys
    .map((component) => ({ component, score: components[component] }))
    .sort((left, right) => left.score - right.score)
}

export function computeRecoveryIndexSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): RecoveryIndexPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.recoveryIndex,
    'RecoveryIndex',
  )
  const baselines = computeRecoveryIndexBaselines(snapshots)
  const sleepDebtSeries = computeSleepDebt(snapshots as DailySnapshot[])
  const sleepQualitySeries = computeSleepQualityScoreSeries(snapshots)
  const pulseTempProxy = buildPulseTemperatureProxySeries(snapshots)

  const debtByDate = new Map(sleepDebtSeries.map((point) => [point.date, point.debt_cumulative_7d]))

  return snapshots.map((snapshot, index) => {
    const derivedFromInterpolated = !!(snapshot.interpolated || snapshot.forecasted)
    const currentSleepQuality = sleepQualitySeries[index]?.score ?? null
    const trailingSleepQuality = (() => {
      const recent = sleepQualitySeries
        .slice(Math.max(0, index - 6), index + 1)
        .map((point) => point.score)
        .filter((value): value is number => value != null && Number.isFinite(value))
      if (!recent.length) return null
      return recent.reduce((sum, value) => sum + value, 0) / recent.length
    })()

    const partial = buildPartialComponents(
      {
        sleep: computeSleepComponent(currentSleepQuality, trailingSleepQuality),
        sleepDebt: computeSleepDebtScore(debtByDate.get(snapshot.date) ?? null),
        hrv: snapshot.health?.hrvSdnn ?? null,
        rhr: snapshot.health?.restingHeartRate ?? null,
        pulseTemp: pulseTempProxy.values[index] ?? null,
      },
      baselines,
    )

    const exploratory = [
      baselines.hrv?.n ?? 0,
      baselines.rhr?.n ?? 0,
      baselines.pulseTemp?.n ?? 0,
    ].some((points) => points > 0 && points < BASELINE_MATURE_POINTS)

    if (!partial) {
      const hasAnyBaseline = Boolean(baselines.hrv || baselines.rhr || baselines.pulseTemp)
      const reason = hasAnyBaseline ? 'inputs_missing' : 'baseline_missing'
      return {
        date: snapshot.date,
        score: null,
        components: null,
        inputsUsed: [],
        completeness: 0,
        confidence: 0,
        derivedFromInterpolated,
        exploratory,
        reason,
        evidence: buildIndexEvidenceReport({
          eligible: false,
          reason,
          inputsUsed: [],
          inputsMissing: ['sleep', 'sleepDebt', 'hrv', 'rhr', 'pulseTemp'],
          proxiesUsed: [],
          usedInterpolated: derivedFromInterpolated,
          confidencePenalty: 0,
          readiness: readiness.status,
        }),
      }
    }

    const score = clamp(weightedScoreFrom(partial.components, partial.inputsUsed), 0, 100)
    const completeness = partial.inputsUsed.length / 5
    const baseConfidence = derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1
    const pulseTempIsProxy =
      snapshot.health?.pulseTemperatureC == null &&
      pulseTempProxy.values[index] != null
    const proxyConfidencePenalty = pulseTempIsProxy ? 0.95 : 1
    const confidence = baseConfidence * completeness * proxyConfidencePenalty
    const eligible = readiness.status !== 'standby'

    return {
      date: snapshot.date,
      score: eligible ? score : null,
      components: partial.components,
      inputsUsed: partial.inputsUsed,
      completeness,
      confidence,
      derivedFromInterpolated,
      exploratory,
      reason: eligible ? undefined : 'insufficient_readiness',
      evidence: buildIndexEvidenceReport({
        eligible,
        reason: eligible ? 'ok' : 'insufficient_readiness',
        inputsUsed: partial.inputsUsed,
        inputsMissing: (['sleep', 'sleepDebt', 'hrv', 'rhr', 'pulseTemp'] as RecoveryIndexComponentKey[]).filter(
          (key) => !partial.inputsUsed.includes(key),
        ),
        proxiesUsed: pulseTempIsProxy ? ['pulseTemperatureProxy'] : [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}
