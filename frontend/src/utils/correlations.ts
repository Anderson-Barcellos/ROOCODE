/**
 * Correlations util — matriz de correlações diárias para Insights.
 *
 * ENTRADA
 * - `DailySnapshot[]` já agregado por dia.
 *
 * TRANSFORMAÇÃO
 * - Extrai séries por métrica (`health`, `mood`, `medicationCount`)
 * - Faz pareamento índice-a-índice para lag 0
 * - Para lags > 0, usa `laggedPairs(xs, ys, lag)`
 *
 * SAÍDA
 * - `CorrelationResult` por par de métricas (com r, p, n)
 * - `applyFdrToCorrelations` para corrigir múltiplos testes (BH FDR)
 *
 * SUPOSIÇÕES
 * - Mínimo de pares válidos por correlação: 10
 * - Não imputa valores ausentes
 */

import type { DailySnapshot } from '../types/apple-health'
import { laggedPairs, pearson } from './statistics'
import type { CorrelationResult } from './statistics'
import { benjaminiHochbergFdr } from './intraday-correlation'

export const MIN_CORRELATION_PAIRS = 10

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
  if (pairs.length < MIN_CORRELATION_PAIRS) return null
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

/**
 * Aplica correção FDR Benjamini-Hochberg a um conjunto de CorrelationResult.
 * Mutates: cada result.qValueFdr é populado in-place.
 * Útil quando um componente testa N pares simultaneamente (ex.: CorrelationHeatmap
 * com 12 métricas × 2 lags = 24 testes).
 */
export function applyFdrToCorrelations(results: Array<CorrelationResult | null>): void {
  const pValues = results.map((r) => r?.pValue ?? null)
  const qValues = benjaminiHochbergFdr(pValues)
  results.forEach((result, index) => {
    if (result) result.qValueFdr = qValues[index]
  })
}
