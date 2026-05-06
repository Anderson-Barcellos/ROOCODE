import type { DailySnapshot } from '../types/apple-health'
import { laggedPairs, pearson } from './statistics'
import type { CorrelationResult } from './statistics'

export const METRIC_KEYS = [
  'sleepTotalHours',
  'sleepDeepHours',
  'sleepRemHours',
  'sleepCoreHours',
  'sleepEfficiencyPct',
  'hrvSdnn',
  'restingHeartRate',
  'cardioRecoveryBpm',
  'spo2',
  'activeEnergyKcal',
  'exerciseMinutes',
  'daylightMinutes',
  'pulseTemperatureC',
  'steps',
  'medicationCount',
  'valence',
] as const

export type MetricKey = (typeof METRIC_KEYS)[number]

export const METRIC_LABELS: Record<MetricKey, string> = {
  sleepTotalHours: 'Sono total',
  sleepDeepHours: 'Sono profundo',
  sleepRemHours: 'Sono REM',
  sleepCoreHours: 'Sono núcleo',
  sleepEfficiencyPct: 'Eficiência sono',
  hrvSdnn: 'HRV',
  restingHeartRate: 'FC repouso',
  cardioRecoveryBpm: 'Recuperação cardíaca',
  spo2: 'SpO2',
  activeEnergyKcal: 'Energia ativa',
  exerciseMinutes: 'Exercício',
  daylightMinutes: 'Luz do dia',
  pulseTemperatureC: 'Temp. pulso',
  steps: 'Passos',
  medicationCount: 'Doses logadas',
  valence: 'Humor',
}

export function extractMetricValues(snapshots: DailySnapshot[], key: MetricKey): Array<number | null> {
  return snapshots.map((s) => {
    if (key === 'valence') return s.mood?.valence ?? null
    if (key === 'medicationCount') return s.medications?.count ?? null
    return (s.health as Record<string, number | null> | null)?.[key] ?? null
  })
}

export function correlate(
  snapshots: DailySnapshot[],
  xKey: MetricKey,
  yKey: MetricKey,
  lag = 0,
): CorrelationResult | null {
  const xs = extractMetricValues(snapshots, xKey)
  const ys = extractMetricValues(snapshots, yKey)

  if (lag === 0) {
    return pearson(xs, ys)
  }

  const pairs = laggedPairs(xs, ys, lag)
  if (pairs.length < 10) return null
  return pearson(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  )
}

export interface CorrelationPair {
  xKey: MetricKey
  yKey: MetricKey
  xLabel: string
  yLabel: string
  lag: number
  result: CorrelationResult
}

const HEALTH_KEYS: MetricKey[] = [
  'sleepTotalHours', 'sleepDeepHours', 'sleepRemHours', 'sleepCoreHours',
  'sleepEfficiencyPct', 'hrvSdnn', 'restingHeartRate', 'cardioRecoveryBpm', 'spo2',
  'activeEnergyKcal', 'exerciseMinutes', 'daylightMinutes', 'pulseTemperatureC',
]

export function computeAllCorrelations(snapshots: DailySnapshot[]): CorrelationPair[] {
  const results: CorrelationPair[] = []

  // Todas as combinações saúde×saúde com lag 0
  for (let i = 0; i < HEALTH_KEYS.length; i++) {
    for (let j = i + 1; j < HEALTH_KEYS.length; j++) {
      const xKey = HEALTH_KEYS[i]
      const yKey = HEALTH_KEYS[j]
      const result = correlate(snapshots, xKey, yKey, 0)
      if (result && result.strength !== 'negligible') {
        results.push({ xKey, yKey, xLabel: METRIC_LABELS[xKey], yLabel: METRIC_LABELS[yKey], lag: 0, result })
      }
    }
  }

  // Humor vs saúde — lag 0 e lag +1
  for (const hKey of HEALTH_KEYS) {
    for (const lag of [0, 1]) {
      const result = correlate(snapshots, hKey, 'valence', lag)
      if (result) {
        results.push({
          xKey: hKey, yKey: 'valence',
          xLabel: METRIC_LABELS[hKey], yLabel: METRIC_LABELS.valence,
          lag, result,
        })
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.result.r) - Math.abs(a.result.r)).slice(0, 20)
}

export interface PresetCorrelation {
  xKey: MetricKey
  yKey: MetricKey
  lag: number
  description: string
}

export const PRESET_CORRELATIONS: PresetCorrelation[] = [
  { xKey: 'sleepTotalHours', yKey: 'valence', lag: 1, description: 'Sono → Humor amanhã' },
  { xKey: 'hrvSdnn', yKey: 'valence', lag: 0, description: 'HRV → Humor (mesmo dia)' },
  { xKey: 'exerciseMinutes', yKey: 'sleepTotalHours', lag: 0, description: 'Exercício → Qualidade sono' },
  { xKey: 'daylightMinutes', yKey: 'sleepTotalHours', lag: 0, description: 'Luz do dia → Sono' },
  { xKey: 'restingHeartRate', yKey: 'valence', lag: 0, description: 'FC repouso → Humor (inversa)' },
  { xKey: 'pulseTemperatureC', yKey: 'sleepDeepHours', lag: 0, description: 'Temp. noturna → Sono profundo' },
  { xKey: 'spo2', yKey: 'sleepTotalHours', lag: 0, description: 'SpO2 → Sono total' },
  { xKey: 'activeEnergyKcal', yKey: 'hrvSdnn', lag: 1, description: 'Energia ativa → HRV amanhã' },
]

export type MoodLagQuality = 'insufficient' | 'partial' | 'observable'

export interface MoodLagMetricOption {
  key: MetricKey
  label: string
  unit: string
}

export interface MoodLagHypothesisRow {
  lagDays: number
  n: number
  quality: MoodLagQuality
  result: CorrelationResult | null
  metricMean: number | null
  aboveMeanMood: number | null
  belowMeanMood: number | null
  moodDelta: number | null
}

export interface MoodLagHypothesis {
  metricKey: MetricKey
  label: string
  unit: string
  rows: MoodLagHypothesisRow[]
  bestLagDays: number | null
  bestResult: CorrelationResult | null
  realMoodDays: number
}

interface MoodLagPair {
  metric: number
  mood: number
}

export const MOOD_LAG_METRICS: MoodLagMetricOption[] = [
  { key: 'sleepTotalHours', label: METRIC_LABELS.sleepTotalHours, unit: 'h' },
  { key: 'hrvSdnn', label: METRIC_LABELS.hrvSdnn, unit: 'ms' },
  { key: 'restingHeartRate', label: METRIC_LABELS.restingHeartRate, unit: 'bpm' },
  { key: 'steps', label: METRIC_LABELS.steps, unit: 'passos' },
  { key: 'daylightMinutes', label: METRIC_LABELS.daylightMinutes, unit: 'min' },
  { key: 'medicationCount', label: METRIC_LABELS.medicationCount, unit: 'dose(s)' },
]

const MOOD_LAG_DAYS = [0, 1, 2, 3]

function qualityForPairCount(pairCount: number): MoodLagQuality {
  if (pairCount < 10) return 'insufficient'
  if (pairCount < 25) return 'partial'
  return 'observable'
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildLagPairs(values: Array<number | null>, moods: Array<number | null>, lagDays: number): MoodLagPair[] {
  const pairs: MoodLagPair[] = []
  for (let i = 0; i + lagDays < Math.min(values.length, moods.length); i++) {
    const metric = values[i]
    const mood = moods[i + lagDays]
    if (
      metric != null &&
      mood != null &&
      Number.isFinite(metric) &&
      Number.isFinite(mood)
    ) {
      pairs.push({ metric, mood })
    }
  }
  return pairs
}

function buildMoodBaseline(pairs: MoodLagPair[]) {
  const metricMean = mean(pairs.map((pair) => pair.metric))
  if (metricMean == null) {
    return { metricMean: null, aboveMeanMood: null, belowMeanMood: null, moodDelta: null }
  }

  const above = pairs.filter((pair) => pair.metric >= metricMean).map((pair) => pair.mood)
  const below = pairs.filter((pair) => pair.metric < metricMean).map((pair) => pair.mood)
  const aboveMeanMood = mean(above)
  const belowMeanMood = mean(below)
  const moodDelta = aboveMeanMood != null && belowMeanMood != null
    ? aboveMeanMood - belowMeanMood
    : null

  return { metricMean, aboveMeanMood, belowMeanMood, moodDelta }
}

export function buildMoodLagHypothesis(
  snapshots: DailySnapshot[],
  metricKey: MetricKey,
  lagDays = MOOD_LAG_DAYS,
): MoodLagHypothesis {
  const usable = snapshots.filter((snapshot) => !snapshot.forecasted && !snapshot.interpolated)
  const values = extractMetricValues(usable, metricKey)
  const moods = extractMetricValues(usable, 'valence')
  const metricOption = MOOD_LAG_METRICS.find((metric) => metric.key === metricKey)
  const rows = lagDays.map((lag): MoodLagHypothesisRow => {
    const pairs = buildLagPairs(values, moods, lag)
    const result = pairs.length >= 10
      ? pearson(
          pairs.map((pair) => pair.metric),
          pairs.map((pair) => pair.mood),
        )
      : null
    return {
      lagDays: lag,
      n: pairs.length,
      quality: qualityForPairCount(pairs.length),
      result,
      ...buildMoodBaseline(pairs),
    }
  })

  const best = rows
    .filter((row): row is MoodLagHypothesisRow & { result: CorrelationResult } => row.result != null)
    .sort((a, b) => Math.abs(b.result.r) - Math.abs(a.result.r))[0]

  return {
    metricKey,
    label: metricOption?.label ?? METRIC_LABELS[metricKey],
    unit: metricOption?.unit ?? '',
    rows,
    bestLagDays: best?.lagDays ?? null,
    bestResult: best?.result ?? null,
    realMoodDays: usable.filter((snapshot) => snapshot.mood?.valence != null).length,
  }
}
