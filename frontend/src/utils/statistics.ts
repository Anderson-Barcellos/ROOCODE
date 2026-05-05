import {
  cumulativeStdNormalProbability,
  linearRegression,
  linearRegressionLine,
  sampleCorrelation,
} from 'simple-statistics'

export type TrendDirection = 'improving' | 'stable' | 'worsening'

export type MetricPolarity = 'higher-is-better' | 'lower-is-better'

export const METRIC_POLARITY: Record<string, MetricPolarity> = {
  sleepTotalHours: 'higher-is-better',
  sleepEfficiencyPct: 'higher-is-better',
  hrvSdnn: 'higher-is-better',
  spo2: 'higher-is-better',
  valence: 'higher-is-better',
  daylightMinutes: 'higher-is-better',
  exerciseMinutes: 'higher-is-better',
  activeEnergyKcal: 'higher-is-better',
  restingHeartRate: 'lower-is-better',
}

export interface CorrelationResult {
  r: number
  pValue: number
  n: number
  strength: 'strong' | 'moderate' | 'weak' | 'negligible'
  direction: 'positive' | 'negative'
  significant: boolean
}

export interface LinearRegressionResult {
  slope: number
  intercept: number
  predict: (x: number) => number
}

export interface AnomalyResult {
  date: string
  value: number
  expectedMean: number
  expectedStd: number
  deviations: number
  severity: 'mild' | 'moderate' | 'severe'
}

function correlationStrength(r: number): CorrelationResult['strength'] {
  const abs = Math.abs(r)
  if (abs > 0.7) return 'strong'
  if (abs > 0.4) return 'moderate'
  if (abs > 0.2) return 'weak'
  return 'negligible'
}

function pValueFromCorrelation(r: number, n: number): number {
  if (!Number.isFinite(r) || n < 4) return Number.NaN

  // Aproximação de Fisher z (bilateral).
  // Mais estável que usar distribuição normal diretamente no estatístico t.
  const clampedR = Math.max(-0.999999, Math.min(0.999999, r))
  const z = 0.5 * Math.log((1 + clampedR) / (1 - clampedR))
  const se = 1 / Math.sqrt(n - 3)
  const zScore = Math.abs(z / se)
  const raw = 2 * (1 - cumulativeStdNormalProbability(zScore))
  return Math.max(0, Math.min(1, raw))
}

export function pearson(
  xs: Array<number | null | undefined>,
  ys: Array<number | null | undefined>,
): CorrelationResult | null {
  const pairs: [number, number][] = []
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i]
    const y = ys[i]
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      pairs.push([x, y])
    }
  }

  if (pairs.length < 10) return null

  const xArr = pairs.map((p) => p[0])
  const yArr = pairs.map((p) => p[1])
  const r = sampleCorrelation(xArr, yArr)

  if (!Number.isFinite(r)) return null

  const n = pairs.length
  const pValue = pValueFromCorrelation(r, n)

  return {
    r,
    pValue,
    n,
    strength: correlationStrength(r),
    direction: r >= 0 ? 'positive' : 'negative',
    significant: pValue < 0.05,
  }
}

export function sma(values: Array<number | null | undefined>, window: number): Array<number | null> {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    const valid = slice.filter((v): v is number => v != null && Number.isFinite(v))
    if (valid.length < Math.max(1, Math.floor(window / 2))) return null
    return valid.reduce((a, b) => a + b, 0) / valid.length
  })
}

export function linearReg(
  values: Array<number | null | undefined>,
): LinearRegressionResult | null {
  const pairs: [number, number][] = values
    .map((v, i): [number, number] | null => (v != null && Number.isFinite(v) ? [i, v] : null))
    .filter((p): p is [number, number] => p !== null)

  if (pairs.length < 4) return null

  const reg = linearRegression(pairs)
  const predict = linearRegressionLine(reg)

  return {
    slope: reg.m,
    intercept: reg.b,
    predict,
  }
}

export function trendDirection(
  values: Array<number | null | undefined>,
  polarity: MetricPolarity = 'higher-is-better',
): TrendDirection {
  const reg = linearReg(values)
  if (!reg) return 'stable'

  const valid = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!valid.length) return 'stable'

  const mean = valid.reduce((a, b) => a + b, 0) / valid.length
  const relativeSlope = mean !== 0 ? Math.abs(reg.slope) / mean : 0

  if (relativeSlope < 0.005) return 'stable'

  const isRising = reg.slope > 0
  if (polarity === 'higher-is-better') {
    return isRising ? 'improving' : 'worsening'
  }
  return isRising ? 'worsening' : 'improving'
}

export function detectAnomalies(
  values: Array<number | null | undefined>,
  dates: string[],
  windowSize = 30,
): AnomalyResult[] {
  const results: AnomalyResult[] = []

  for (let i = windowSize; i < values.length; i++) {
    const current = values[i]
    if (current == null || !Number.isFinite(current)) continue

    const window = values
      .slice(Math.max(0, i - windowSize), i)
      .filter((v): v is number => v != null && Number.isFinite(v))

    if (window.length < 10) continue

    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / window.length
    const std = Math.sqrt(variance)

    if (std === 0) continue

    const deviations = Math.abs(current - mean) / std

    if (deviations > 2) {
      results.push({
        date: dates[i] ?? String(i),
        value: current,
        expectedMean: mean,
        expectedStd: std,
        deviations,
        severity: deviations > 3 ? 'severe' : deviations > 2.5 ? 'moderate' : 'mild',
      })
    }
  }

  return results
}

export function laggedPairs(
  xValues: Array<number | null | undefined>,
  yValues: Array<number | null | undefined>,
  lag: number,
): [number, number][] {
  const pairs: [number, number][] = []
  for (let i = 0; i < xValues.length - lag; i++) {
    const x = xValues[i]
    const y = yValues[i + lag]
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      pairs.push([x, y])
    }
  }
  return pairs
}
