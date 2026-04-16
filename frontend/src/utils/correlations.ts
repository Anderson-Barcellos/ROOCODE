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
  'spo2',
  'activeEnergyKcal',
  'exerciseMinutes',
  'daylightMinutes',
  'pulseTemperatureC',
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
  spo2: 'SpO2',
  activeEnergyKcal: 'Energia ativa',
  exerciseMinutes: 'Exercício',
  daylightMinutes: 'Luz do dia',
  pulseTemperatureC: 'Temp. pulso',
  valence: 'Humor',
}

export function extractMetricValues(snapshots: DailySnapshot[], key: MetricKey): Array<number | null> {
  return snapshots.map((s) => {
    if (key === 'valence') return s.mood?.valence ?? null
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
  'sleepEfficiencyPct', 'hrvSdnn', 'restingHeartRate', 'spo2',
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
