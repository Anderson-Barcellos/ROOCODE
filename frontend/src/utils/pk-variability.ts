/**
 * PK Variability × Mood — camada derivada diária para Insights.
 *
 * ENTRADA
 * - `snapshots`: DailySnapshot[] (já agregado por dia)
 * - `series`: série PK diária (`cmax_est`, `cmin_est`, `auc_est`) do backend
 * - `med` + `doses`: parâmetros PK + eventos de dose para recomputar TIR
 *
 * TRANSFORMAÇÃO
 * 1) Constrói séries diárias por métrica (CV, swing, TIR e métricas condicionais)
 * 2) Pareia métrica×humor por lag (0..3d)
 * 3) Estima Pearson por lag + contraste Q1×Q4
 * 4) Avalia robustez por replicação cross-janela (30/60/90d)
 * 5) Expõe sinais de censura amostral (plateau_baixo insuficiente)
 *
 * SAÍDA
 * - `PKVariabilityHypothesis` pronto para UI (linhas por lag, flags de robustez,
 *   consistência cross-lag e metadados de censura)
 *
 * SUPOSIÇÕES
 * - Correlação é descritiva (não causal)
 * - Humor vem de auto-relato (sampling bias)
 * - Série PK diária do backend e cálculo local de TIR devem permanecer coerentes
 * - Pairing é sempre por data ISO (YYYY-MM-DD), sem imputar humor ausente
 */

import { calculateConcentration, DEFAULT_PK_BODY_WEIGHT_KG, type PKDose, type PKMedication } from './pharmacokinetics'
import { pearson, type CorrelationResult } from './statistics'
import type { ConcentrationSeriesPoint } from '@/lib/api'
import type { DailySnapshot } from '@/types/apple-health'

export const PK_VARIABILITY_WINDOW_DAYS = 14
export const PK_VARIABILITY_LAG_DAYS = [0, 1, 2, 3] as const
export const PK_VARIABILITY_REPLICATION_WINDOWS = [30, 60, 90] as const
export const PK_VARIABILITY_TIR_HOURS_PER_DAY = 24
export const PK_VARIABILITY_FALLBACK_ANALYSIS_DAYS = 60
export const PK_VARIABILITY_DOSE_WARMUP_DAYS = 14
export const PK_VARIABILITY_TRANSGRESSOR_MIN_OUT_HOURS = 2
export const PK_VARIABILITY_PLATEAU_LOW_THRESHOLD_HOURS = 4
export const PK_VARIABILITY_MIN_PLATEAU_LOW_DAYS = 5
export const PK_VARIABILITY_LOW_POWER_CELL_N = 5

export type PKVariabilityMetric = 'cv' | 'swing' | 'tir' | 'swing_in_range' | 'swing_transgressor'

export function isDoseDerivedVariabilityMetric(metric: PKVariabilityMetric): boolean {
  return metric === 'tir' || metric === 'swing_in_range' || metric === 'swing_transgressor'
}

export interface DoseDerivedReliability {
  reliable: boolean
  warning: string | null
}

export const PK_VARIABILITY_METRICS: PKVariabilityMetric[] = [
  'cv',
  'swing',
  'tir',
  'swing_in_range',
  'swing_transgressor',
]

export const PK_VARIABILITY_METRIC_LABELS: Record<PKVariabilityMetric, string> = {
  cv: 'CV% inter-dia (cmax)',
  swing: 'Swing intra-dia',
  tir: 'Time in Range',
  swing_in_range: 'Swing intra-range',
  swing_transgressor: 'Swing transgressor',
}

export const PK_VARIABILITY_METRIC_UNITS: Record<PKVariabilityMetric, string> = {
  cv: '%',
  swing: '%',
  tir: 'h/dia',
  swing_in_range: '%',
  swing_transgressor: '%',
}

export const PK_VARIABILITY_METRIC_DESCRIPTIONS: Record<PKVariabilityMetric, string> = {
  cv: 'Coeficiente de variação dos picos diários numa janela de 14 dias. Baixo = pico consistente.',
  swing: '(cmax − cmin) / média do dia × 100. Baixo = curva plana no dia. Alto = montanha-russa.',
  tir: 'Horas do dia em que a concentração ficou dentro do range terapêutico da substância.',
  swing_in_range: 'Swing apenas em dias 100% dentro do range (TIR=24h).',
  swing_transgressor: `Swing apenas em dias com ≥${PK_VARIABILITY_TRANSGRESSOR_MIN_OUT_HOURS}h fora do range.`,
}

export interface PKVariabilityAnalysisWindow {
  fromIso: string
  toIso: string
  doseHours: number
  spanDays: number
  usesFallback: boolean
}

export interface DailyRangeExposure {
  inRangeHours: number | null
  outOfRangeHours: number | null
  belowRangeHours: number | null
  aboveRangeHours: number | null
  lowExitClass: 'in_range' | 'vale_breve' | 'plateau_baixo' | null
}

export interface PKVariabilityCensorship {
  lowPlateauDays: number
  briefValleyDays: number
  censoredForPlateau: boolean
}

export interface PKVariabilityWindowEstimate {
  windowDays: number
  n: number
  result: CorrelationResult | null
}

export interface PKReplicationSummary {
  replicates: boolean
  direction: 'positive' | 'negative' | 'mixed' | 'none'
  magnitudeSpread: number | null
  signInversion: boolean
  replicatedWindows: number[]
  fragileReason: 'none' | 'insufficient' | 'single-window' | 'sign-inversion' | 'magnitude-drift'
}

export type PKVariabilityQuality = 'insufficient' | 'partial' | 'observable' | 'censored'

interface VariabilityPair {
  metric: number
  mood: number
}

function isoFromUtcMs(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function qualityForPairCount(pairs: number, censored = false): PKVariabilityQuality {
  if (censored) return 'censored'
  if (pairs < 10) return 'insufficient'
  if (pairs < 25) return 'partial'
  return 'observable'
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function quantileSorted(sortedValues: number[], q: number): number {
  if (!sortedValues.length) return Number.NaN
  const p = Math.max(0, Math.min(1, q))
  const pos = (sortedValues.length - 1) * p
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  if (lower === upper) return sortedValues[lower]
  const w = pos - lower
  return sortedValues[lower] * (1 - w) + sortedValues[upper] * w
}

function bucketIndex(value: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return i
  }
  return thresholds.length
}

/**
 * Janela canônica da feature: usa todo o histórico real recebido no componente.
 */
export function getPkVariabilityAnalysisWindow(
  snapshots: DailySnapshot[],
  now: Date = new Date(),
): PKVariabilityAnalysisWindow {
  const dayMs = 24 * 3600 * 1000
  const nowMs = now.getTime()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const validDays = snapshots
    .filter((s) => !s.forecasted && !s.interpolated && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
    .map((s) => Date.parse(`${s.date}T00:00:00Z`))
    .filter((t) => Number.isFinite(t) && t <= todayUtc)
    .sort((a, b) => a - b)

  const usesFallback = validDays.length === 0
  const fromMs = usesFallback ? todayUtc - (PK_VARIABILITY_FALLBACK_ANALYSIS_DAYS - 1) * dayMs : validDays[0]
  const toMs = usesFallback ? todayUtc : validDays[validDays.length - 1]
  const spanDays = Math.max(1, Math.round((toMs - fromMs) / dayMs) + 1)
  const doseLookbackMs = Math.max(0, nowMs - fromMs) + PK_VARIABILITY_DOSE_WARMUP_DAYS * dayMs
  const doseHours = Math.max(24, Math.ceil(doseLookbackMs / 3600000))

  return {
    fromIso: isoFromUtcMs(fromMs),
    toIso: isoFromUtcMs(toMs),
    doseHours,
    spanDays,
    usesFallback,
  }
}

/**
 * CV% (coefficient of variation) em janela móvel sobre `cmax_est`.
 */
export function computeRollingCv(
  cmaxSeries: Array<number | null>,
  windowDays: number = PK_VARIABILITY_WINDOW_DAYS,
): Array<number | null> {
  const minValid = Math.max(3, Math.floor(windowDays / 2))
  return cmaxSeries.map((_, i) => {
    const start = Math.max(0, i - windowDays + 1)
    const window = cmaxSeries
      .slice(start, i + 1)
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
    if (window.length < minValid) return null
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    if (mean <= 0) return null
    const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / window.length
    return (Math.sqrt(variance) / mean) * 100
  })
}

/**
 * Swing intra-dia empírico: (cmax − cmin) / média × 100.
 */
export function computeSwingSeries(series: ConcentrationSeriesPoint[]): Array<number | null> {
  return series.map((p) => {
    if (!Number.isFinite(p.cmax_est) || !Number.isFinite(p.cmin_est)) return null
    const avg = (p.cmax_est + p.cmin_est) / 2
    if (avg <= 0) return null
    return ((p.cmax_est - p.cmin_est) / avg) * 100
  })
}

/**
 * Exposição diária em relação ao range terapêutico (24 amostras horárias).
 */
export function computeDailyRangeExposureSeries(
  med: PKMedication,
  doses: PKDose[],
  dates: string[],
  weightKg: number = DEFAULT_PK_BODY_WEIGHT_KG,
): DailyRangeExposure[] {
  const range = med.therapeuticRange
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min >= range.max) {
    return dates.map(() => ({
      inRangeHours: null,
      outOfRangeHours: null,
      belowRangeHours: null,
      aboveRangeHours: null,
      lowExitClass: null,
    }))
  }

  return dates.map((dateStr) => {
    const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime()
    if (!Number.isFinite(dayStart)) {
      return {
        inRangeHours: null,
        outOfRangeHours: null,
        belowRangeHours: null,
        aboveRangeHours: null,
        lowExitClass: null,
      }
    }
    let inRange = 0
    let belowRange = 0
    let aboveRange = 0
    for (let h = 0; h < PK_VARIABILITY_TIR_HOURS_PER_DAY; h++) {
      const t = dayStart + h * 3600 * 1000
      const c = calculateConcentration(med, doses, t, weightKg)
      if (!Number.isFinite(c)) continue
      if (c < range.min) {
        belowRange += 1
      } else if (c > range.max) {
        aboveRange += 1
      } else {
        inRange += 1
      }
    }

    const outOfRange = belowRange + aboveRange
    const lowExitClass =
      belowRange === 0
        ? 'in_range'
        : belowRange < PK_VARIABILITY_PLATEAU_LOW_THRESHOLD_HOURS
          ? 'vale_breve'
          : 'plateau_baixo'

    return {
      inRangeHours: inRange,
      outOfRangeHours: outOfRange,
      belowRangeHours: belowRange,
      aboveRangeHours: aboveRange,
      lowExitClass,
    }
  })
}

/**
 * Time in Range diário (h/dia).
 */
export function computeTirSeries(
  med: PKMedication,
  doses: PKDose[],
  dates: string[],
  weightKg: number = DEFAULT_PK_BODY_WEIGHT_KG,
): Array<number | null> {
  return computeDailyRangeExposureSeries(med, doses, dates, weightKg).map((x) => x.inRangeHours)
}

export function summarizePkCensorship(rangeExposure: DailyRangeExposure[]): PKVariabilityCensorship {
  const lowPlateauDays = rangeExposure.filter((x) => x.lowExitClass === 'plateau_baixo').length
  const briefValleyDays = rangeExposure.filter((x) => x.lowExitClass === 'vale_breve').length
  return {
    lowPlateauDays,
    briefValleyDays,
    censoredForPlateau: lowPlateauDays < PK_VARIABILITY_MIN_PLATEAU_LOW_DAYS,
  }
}

export function evaluateDoseDerivedReliability(
  metric: PKVariabilityMetric,
  series: ConcentrationSeriesPoint[],
  doses: PKDose[],
  hasRangeExposureOverride = false,
): DoseDerivedReliability {
  if (!isDoseDerivedVariabilityMetric(metric)) {
    return { reliable: true, warning: null }
  }

  if (hasRangeExposureOverride) {
    return { reliable: true, warning: null }
  }

  const hasDoseEvents = doses.some(
    (dose) => Number.isFinite(dose.timestamp) && Number.isFinite(dose.doseAmount) && dose.doseAmount > 0,
  )
  const hasPositiveSeries = series.some(
    (point) =>
      (Number.isFinite(point.cmax_est) && point.cmax_est > 0) ||
      (Number.isFinite(point.cmin_est) && point.cmin_est > 0),
  )

  if (!hasDoseEvents && hasPositiveSeries) {
    return {
      reliable: false,
      warning:
        'Métrica de range desativada: série PK com concentração positiva sem doses reais locais (possível fallback de regime no backend).',
    }
  }

  return { reliable: true, warning: null }
}

/**
 * Dispatch único — gera série diária da métrica escolhida.
 */
export function buildPkVariabilitySeries(
  metric: PKVariabilityMetric,
  med: PKMedication,
  doses: PKDose[],
  series: ConcentrationSeriesPoint[],
  weightKg: number = DEFAULT_PK_BODY_WEIGHT_KG,
  rangeExposureOverride?: DailyRangeExposure[],
): Array<number | null> {
  const hasRangeOverride =
    Array.isArray(rangeExposureOverride) &&
    rangeExposureOverride.length === series.length
  const reliability = evaluateDoseDerivedReliability(metric, series, doses, hasRangeOverride)
  if (!reliability.reliable) {
    return series.map(() => null)
  }

  const dates = series.map((p) => p.date)
  const swingSeries = computeSwingSeries(series)

  if (metric === 'cv') {
    return computeRollingCv(series.map((p) => p.cmax_est), PK_VARIABILITY_WINDOW_DAYS)
  }

  if (metric === 'swing') return swingSeries

  const rangeExposure = hasRangeOverride
    ? rangeExposureOverride
    : computeDailyRangeExposureSeries(med, doses, dates, weightKg)
  if (metric === 'tir') return rangeExposure.map((x) => x.inRangeHours)

  if (metric === 'swing_in_range') {
    return swingSeries.map((value, i) => {
      const inRange = rangeExposure[i]?.inRangeHours
      return value != null && inRange === PK_VARIABILITY_TIR_HOURS_PER_DAY ? value : null
    })
  }

  if (metric === 'swing_transgressor') {
    return swingSeries.map((value, i) => {
      const outHours = rangeExposure[i]?.outOfRangeHours
      return value != null && outHours != null && outHours >= PK_VARIABILITY_TRANSGRESSOR_MIN_OUT_HOURS
        ? value
        : null
    })
  }

  return []
}

function buildLagPairs(
  metricSeries: Array<number | null>,
  moodSeries: Array<number | null>,
  lagDays: number,
): VariabilityPair[] {
  const pairs: VariabilityPair[] = []
  const upper = Math.min(metricSeries.length, moodSeries.length) - lagDays
  for (let i = 0; i < upper; i++) {
    const m = metricSeries[i]
    const mood = moodSeries[i + lagDays]
    if (m != null && mood != null && Number.isFinite(m) && Number.isFinite(mood)) {
      pairs.push({ metric: m, mood })
    }
  }
  return pairs
}

function evaluateReplication(windowEstimates: PKVariabilityWindowEstimate[]): PKReplicationSummary {
  const valid = windowEstimates.filter(
    (x): x is PKVariabilityWindowEstimate & { result: CorrelationResult } => x.result != null,
  )
  if (valid.length === 0) {
    return {
      replicates: false,
      direction: 'none',
      magnitudeSpread: null,
      signInversion: false,
      replicatedWindows: [],
      fragileReason: 'insufficient',
    }
  }
  if (valid.length === 1) {
    return {
      replicates: false,
      direction: valid[0].result.r >= 0 ? 'positive' : 'negative',
      magnitudeSpread: null,
      signInversion: false,
      replicatedWindows: [valid[0].windowDays],
      fragileReason: 'single-window',
    }
  }

  const hasPos = valid.some((x) => x.result.r > 0)
  const hasNeg = valid.some((x) => x.result.r < 0)
  if (hasPos && hasNeg) {
    return {
      replicates: false,
      direction: 'mixed',
      magnitudeSpread: null,
      signInversion: true,
      replicatedWindows: valid.map((x) => x.windowDays),
      fragileReason: 'sign-inversion',
    }
  }

  const absRs = valid.map((x) => Math.abs(x.result.r))
  const spread = Math.max(...absRs) - Math.min(...absRs)
  const replicates = spread <= 0.1

  return {
    replicates,
    direction: hasPos ? 'positive' : 'negative',
    magnitudeSpread: spread,
    signInversion: false,
    replicatedWindows: valid.map((x) => x.windowDays),
    fragileReason: replicates ? 'none' : 'magnitude-drift',
  }
}

function buildWindowEstimates(
  metricSeries: Array<number | null>,
  moodSeries: Array<number | null>,
  lagDays: number,
): PKVariabilityWindowEstimate[] {
  return PK_VARIABILITY_REPLICATION_WINDOWS.map((windowDays) => {
    const start = Math.max(0, Math.min(metricSeries.length, moodSeries.length) - windowDays)
    const metricSlice = metricSeries.slice(start)
    const moodSlice = moodSeries.slice(start)
    const pairs = buildLagPairs(metricSlice, moodSlice, lagDays)
    return {
      windowDays,
      n: pairs.length,
      result:
        pairs.length >= 10
          ? pearson(
              pairs.map((p) => p.metric),
              pairs.map((p) => p.mood),
            )
          : null,
    }
  })
}

export interface QuartileDelta {
  q1Mood: number | null
  q4Mood: number | null
  q1q4Delta: number | null
  q1n: number
  q4n: number
}

/**
 * Humor médio em Q1 vs Q4 da métrica para capturar padrões não-lineares.
 */
export function computeQuartileMoodDelta(pairs: VariabilityPair[]): QuartileDelta {
  if (pairs.length < 8) {
    return { q1Mood: null, q4Mood: null, q1q4Delta: null, q1n: 0, q4n: 0 }
  }
  const sorted = [...pairs].sort((a, b) => a.metric - b.metric)
  const quartileCount = Math.max(2, Math.floor(sorted.length / 4))
  const q1 = sorted.slice(0, quartileCount)
  const q4 = sorted.slice(-quartileCount)
  const q1Mood = q1.reduce((s, p) => s + p.mood, 0) / q1.length
  const q4Mood = q4.reduce((s, p) => s + p.mood, 0) / q4.length
  return {
    q1Mood,
    q4Mood,
    q1q4Delta: q4Mood - q1Mood,
    q1n: q1.length,
    q4n: q4.length,
  }
}

export interface PKVariabilityRow {
  lagDays: number
  n: number
  quality: PKVariabilityQuality
  result: CorrelationResult | null
  q1Mood: number | null
  q4Mood: number | null
  q1q4Delta: number | null
  q1n: number
  q4n: number
  windowEstimates: PKVariabilityWindowEstimate[]
  replication: PKReplicationSummary
  censored: boolean
  censorReason: string | null
}

export interface PKCrossLagConsistency {
  consistent: boolean
  maxStreak: number
  direction: 'positive' | 'negative' | 'mixed' | 'none'
}

export interface PKVariabilityHypothesis {
  substanceId: string
  substanceName: string
  metric: PKVariabilityMetric
  metricLabel: string
  metricUnit: string
  rows: PKVariabilityRow[]
  bestLagDays: number | null
  bestResult: CorrelationResult | null
  realMoodDays: number
  hasMetricData: boolean
  hasMoodData: boolean
  censorship: PKVariabilityCensorship
  crossLagConsistency: PKCrossLagConsistency
  doseDerivedMetricsReliable: boolean
  coherenceWarning: string | null
}

function evaluateCrossLagConsistency(rows: PKVariabilityRow[]): PKCrossLagConsistency {
  const candidates = rows
    .filter((row): row is PKVariabilityRow & { result: CorrelationResult } => row.result != null)
    .sort((a, b) => a.lagDays - b.lagDays)

  if (candidates.length < 3) {
    return { consistent: false, maxStreak: 0, direction: 'none' }
  }

  let maxStreak = 1
  let bestDirection: 'positive' | 'negative' | 'mixed' | 'none' = 'none'

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i]
    let streak = 1
    const direction = base.result.r >= 0 ? 'positive' : 'negative'
    let minAbs = Math.abs(base.result.r)
    let maxAbs = Math.abs(base.result.r)

    for (let j = i + 1; j < candidates.length; j++) {
      const prev = candidates[j - 1]
      const curr = candidates[j]
      if (curr.lagDays !== prev.lagDays + 1) break
      if ((curr.result.r >= 0 ? 'positive' : 'negative') !== direction) break
      const absR = Math.abs(curr.result.r)
      minAbs = Math.min(minAbs, absR)
      maxAbs = Math.max(maxAbs, absR)
      if (maxAbs - minAbs > 0.1) break
      streak += 1
    }

    if (streak > maxStreak) {
      maxStreak = streak
      bestDirection = direction
    }
  }

  return {
    consistent: maxStreak >= 3,
    maxStreak,
    direction: bestDirection,
  }
}

/**
 * Pipeline completo: métrica diária → lag sweep 0-3d → robustez cross-janela.
 */
export function analyzePkVariabilityVsMood(
  substanceId: string,
  substanceName: string,
  metric: PKVariabilityMetric,
  snapshots: DailySnapshot[],
  series: ConcentrationSeriesPoint[],
  med: PKMedication,
  doses: PKDose[],
  weightKg: number = DEFAULT_PK_BODY_WEIGHT_KG,
  rangeExposureOverride?: DailyRangeExposure[],
): PKVariabilityHypothesis {
  const usable = snapshots.filter((s) => !s.forecasted && !s.interpolated)
  const moodByDate = new Map<string, number | null>()
  for (const s of usable) moodByDate.set(s.date, s.mood?.valence ?? null)

  const dates = series.map((p) => p.date)
  const hasRangeOverride =
    Array.isArray(rangeExposureOverride) &&
    rangeExposureOverride.length === series.length
  const rangeExposure = hasRangeOverride
    ? rangeExposureOverride
    : computeDailyRangeExposureSeries(med, doses, dates, weightKg)
  const censorship = summarizePkCensorship(rangeExposure)
  const reliability = evaluateDoseDerivedReliability(metric, series, doses, hasRangeOverride)
  const metricSeries = buildPkVariabilitySeries(
    metric,
    med,
    doses,
    series,
    weightKg,
    rangeExposure,
  )
  const dateAlignedMood: Array<number | null> = series.map((p) => moodByDate.get(p.date) ?? null)
  const realMoodDays = dateAlignedMood.filter((v) => v != null).length

  const hasMetricData = metricSeries.some((v) => v != null)
  const hasMoodData = realMoodDays >= 5

  const metricIsCensored = metric === 'swing_transgressor' && censorship.censoredForPlateau
  const metricUnavailable = !reliability.reliable

  const rows: PKVariabilityRow[] = PK_VARIABILITY_LAG_DAYS.map((lag) => {
    const pairs = buildLagPairs(metricSeries, dateAlignedMood, lag)
    const windowEstimates = buildWindowEstimates(metricSeries, dateAlignedMood, lag)
    const replication = evaluateReplication(windowEstimates)
    const result =
      pairs.length >= 10 && !metricIsCensored && !metricUnavailable
        ? pearson(
            pairs.map((p) => p.metric),
            pairs.map((p) => p.mood),
          )
        : null
    const q = computeQuartileMoodDelta(pairs)
    return {
      lagDays: lag,
      n: pairs.length,
      quality: qualityForPairCount(pairs.length, metricIsCensored || metricUnavailable),
      result,
      q1Mood: q.q1Mood,
      q4Mood: q.q4Mood,
      q1q4Delta: q.q1q4Delta,
      q1n: q.q1n,
      q4n: q.q4n,
      windowEstimates,
      replication,
      censored: metricIsCensored,
      censorReason: metricIsCensored
        ? `N_plateau_baixo=${censorship.lowPlateauDays} (<${PK_VARIABILITY_MIN_PLATEAU_LOW_DAYS})`
        : metricUnavailable
          ? reliability.warning
          : null,
    }
  })

  const best = rows
    .filter((r): r is PKVariabilityRow & { result: CorrelationResult } => r.result != null)
    .sort((a, b) => Math.abs(b.result.r) - Math.abs(a.result.r))[0]

  return {
    substanceId,
    substanceName,
    metric,
    metricLabel: PK_VARIABILITY_METRIC_LABELS[metric],
    metricUnit: PK_VARIABILITY_METRIC_UNITS[metric],
    rows,
    bestLagDays: best?.lagDays ?? null,
    bestResult: best?.result ?? null,
    realMoodDays,
    hasMetricData,
    hasMoodData,
    censorship,
    crossLagConsistency: evaluateCrossLagConsistency(rows),
    doseDerivedMetricsReliable: reliability.reliable,
    coherenceWarning: reliability.warning,
  }
}

export interface SwingTirCrossTabCell {
  swingBin: number
  tirBin: number
  n: number
  moodMedian: number | null
  lowPower: boolean
}

export interface SwingTirCrossTab {
  bins: number
  swingThresholds: number[]
  tirThresholds: number[]
  cells: SwingTirCrossTabCell[]
  hypothesisCheck: {
    highTirModerateSwing: number | null
    highTirLowSwing: number | null
    lowTirHighSwing: number | null
    supportsRefinedHypothesis: boolean | null
    note: string
  }
}

/**
 * Cross-tab swing×TIR (tercis/quartis) com mediana de humor por célula.
 */
export function buildSwingTirCrossTab(
  swingSeries: Array<number | null>,
  tirSeries: Array<number | null>,
  moodSeries: Array<number | null>,
  bins = 3,
): SwingTirCrossTab {
  const triples = swingSeries
    .map((swing, i) => ({ swing, tir: tirSeries[i] ?? null, mood: moodSeries[i] ?? null }))
    .filter(
      (x): x is { swing: number; tir: number; mood: number } =>
        x.swing != null && x.tir != null && x.mood != null && Number.isFinite(x.swing) && Number.isFinite(x.tir) && Number.isFinite(x.mood),
    )

  const validBins = Math.max(3, Math.min(4, Math.floor(bins)))
  if (triples.length === 0) {
    return {
      bins: validBins,
      swingThresholds: [],
      tirThresholds: [],
      cells: [],
      hypothesisCheck: {
        highTirModerateSwing: null,
        highTirLowSwing: null,
        lowTirHighSwing: null,
        supportsRefinedHypothesis: null,
        note: 'Sem pares swing×TIR×humor suficientes.',
      },
    }
  }

  const swingSorted = triples.map((t) => t.swing).sort((a, b) => a - b)
  const tirSorted = triples.map((t) => t.tir).sort((a, b) => a - b)
  const probs = Array.from({ length: validBins - 1 }, (_, i) => (i + 1) / validBins)
  const swingThresholds = probs.map((p) => quantileSorted(swingSorted, p))
  const tirThresholds = probs.map((p) => quantileSorted(tirSorted, p))

  const moodBuckets = new Map<string, number[]>()
  for (const triple of triples) {
    const swingBin = bucketIndex(triple.swing, swingThresholds)
    const tirBin = bucketIndex(triple.tir, tirThresholds)
    const key = `${swingBin}-${tirBin}`
    const existing = moodBuckets.get(key) ?? []
    existing.push(triple.mood)
    moodBuckets.set(key, existing)
  }

  const cells: SwingTirCrossTabCell[] = []
  for (let swingBin = 0; swingBin < validBins; swingBin++) {
    for (let tirBin = 0; tirBin < validBins; tirBin++) {
      const key = `${swingBin}-${tirBin}`
      const values = moodBuckets.get(key) ?? []
      cells.push({
        swingBin,
        tirBin,
        n: values.length,
        moodMedian: median(values),
        lowPower: values.length > 0 && values.length < PK_VARIABILITY_LOW_POWER_CELL_N,
      })
    }
  }

  const highTirBin = validBins - 1
  const lowTirBin = 0
  const moderateSwingBin = validBins === 3 ? 1 : Math.floor((validBins - 1) / 2)
  const lowSwingBin = 0
  const highSwingBin = validBins - 1

  const getCellMedian = (swingBin: number, tirBin: number): number | null =>
    cells.find((cell) => cell.swingBin === swingBin && cell.tirBin === tirBin)?.moodMedian ?? null

  const highTirModerateSwing = getCellMedian(moderateSwingBin, highTirBin)
  const highTirLowSwing = getCellMedian(lowSwingBin, highTirBin)
  const lowTirHighSwing = getCellMedian(highSwingBin, lowTirBin)

  const canCompare =
    highTirModerateSwing != null &&
    highTirLowSwing != null &&
    lowTirHighSwing != null

  const supportsRefinedHypothesis = canCompare
    ? highTirModerateSwing > highTirLowSwing && highTirModerateSwing > lowTirHighSwing
    : null

  const note = canCompare
    ? supportsRefinedHypothesis
      ? 'Padrão favorece oscilação moderada com TIR alto.'
      : 'Padrão não confirma superioridade de oscilação moderada com TIR alto.'
    : 'Células-alvo incompletas para teste direto da hipótese refinada.'

  return {
    bins: validBins,
    swingThresholds,
    tirThresholds,
    cells,
    hypothesisCheck: {
      highTirModerateSwing,
      highTirLowSwing,
      lowTirHighSwing,
      supportsRefinedHypothesis,
      note,
    },
  }
}

/**
 * Mantido por retrocompatibilidade de cards legados.
 */
export function hasStrongVariabilitySignal(row: PKVariabilityRow | null | undefined): boolean {
  if (!row || !row.result) return false
  return (
    Math.abs(row.result.r) >= 0.3 &&
    row.n >= 20 &&
    Number.isFinite(row.result.pValue) &&
    row.result.pValue < 0.05 &&
    row.replication.replicates
  )
}
