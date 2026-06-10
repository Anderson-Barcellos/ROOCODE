import {
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
  /** q-value após correção Benjamini-Hochberg (FDR). Populado por quem testa
   *  múltiplos pares simultaneamente (correlation-heatmap, mood-lag-hypothesis).
   *  null quando não foi aplicado controle de múltiplos testes. */
  qValueFdr?: number | null
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

const LANCZOS_G = 7
const LANCZOS_COEFFICIENTS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9.984369578019572e-6,
  1.5056327351493116e-7,
]

function logGamma(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return Number.NaN
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value)
  }

  const z = value - 1
  let x = LANCZOS_COEFFICIENTS[0]
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    x += LANCZOS_COEFFICIENTS[i] / (z + i)
  }

  const t = z + LANCZOS_G + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200
  const epsilon = 3e-14
  const minDenominator = 1e-300

  const sumAB = a + b
  const aPlus1 = a + 1
  const aMinus1 = a - 1

  let c = 1
  let d = 1 - (sumAB * x) / aPlus1
  if (Math.abs(d) < minDenominator) d = minDenominator
  d = 1 / d
  let h = d

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m

    let aa = (m * (b - m) * x) / ((aMinus1 + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < minDenominator) d = minDenominator
    c = 1 + aa / c
    if (Math.abs(c) < minDenominator) c = minDenominator
    d = 1 / d
    h *= d * c

    aa = (-(a + m) * (sumAB + m) * x) / ((a + m2) * (aPlus1 + m2))
    d = 1 + aa * d
    if (Math.abs(d) < minDenominator) d = minDenominator
    c = 1 + aa / c
    if (Math.abs(c) < minDenominator) c = minDenominator
    d = 1 / d

    const step = d * c
    h *= step
    if (Math.abs(step - 1) < epsilon) break
  }

  return h
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return Number.NaN
  }
  if (x <= 0) return 0
  if (x >= 1) return 1

  const logBeta = logGamma(a) + logGamma(b) - logGamma(a + b)
  if (!Number.isFinite(logBeta)) return Number.NaN

  const logFront = a * Math.log(x) + b * Math.log1p(-x) - logBeta
  const front = Math.exp(logFront)
  if (!Number.isFinite(front)) return Number.NaN

  const pivot = (a + 1) / (a + b + 2)
  if (x < pivot) {
    return (front * betaContinuedFraction(a, b, x)) / a
  }

  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

function correlationStrength(r: number): CorrelationResult['strength'] {
  const abs = Math.abs(r)
  if (abs > 0.7) return 'strong'
  if (abs > 0.4) return 'moderate'
  if (abs > 0.2) return 'weak'
  return 'negligible'
}

export function pearsonPValueFromR(r: number, n: number): number {
  if (!Number.isFinite(r) || n < 3) return Number.NaN

  const absR = Math.abs(Math.max(-1, Math.min(1, r)))
  if (absR >= 1) return 0

  const degreesOfFreedom = n - 2
  const denominator = 1 - absR * absR
  if (denominator <= 0) return 0

  // p exato bilateral via distribuição t de Student:
  // t = r * sqrt((n-2)/(1-r^2)), p = I_x(df/2, 1/2), x = df/(df+t^2).
  const tAbs = absR * Math.sqrt(degreesOfFreedom / denominator)
  const x = degreesOfFreedom / (degreesOfFreedom + tAbs * tAbs)
  const p = regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5)
  if (!Number.isFinite(p)) return Number.NaN
  return Math.max(0, Math.min(1, p))
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
  const pValue = pearsonPValueFromR(r, n)

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
    // SD amostral (Bessel: divisão por n-1) para consistência com
    // personal-baselines.ts e o resto do pipeline. Antes da auditoria
    // 2026-05-15 esta função usava variância populacional (div por n),
    // inflando levemente os z-scores em janelas pequenas.
    const variance = window.length > 1
      ? window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (window.length - 1)
      : 0
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
