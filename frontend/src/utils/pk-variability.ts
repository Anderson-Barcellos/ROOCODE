/**
 * PK Variability × Mood — utilitários puros pra responder:
 *   "Concentrações irregulares OU muito estáveis afetam humor negativamente?"
 *
 * 3 métricas de variabilidade clínica:
 *   - cv:    CV% inter-dia de cmax (consistência do pico diário)
 *   - swing: (cmax-cmin) / Css_avg empírico (montanha-russa intra-dia)
 *   - tir:   horas/dia dentro do therapeutic_range (drug forgiveness)
 *
 * Cada métrica vira uma série temporal diária; pareada com valência do humor
 * em lags 0-3d via Pearson, complementada por delta Q1×Q4 (sweet spot em U).
 *
 * Reusa pipeline e padrões já presentes no codebase:
 *   - `calculateConcentration` em pharmacokinetics.ts (sampling intra-dia pro TIR)
 *   - `pearson` de statistics.ts (retorna CorrelationResult com r/n/pValue)
 *   - estrutura de `MoodLagHypothesis` de correlations.ts (lag sweep 0-3d)
 *
 * Caveats clínicos:
 *   - LHL drugs (Lexapro/Lamictal t½≥29h) têm CV baixíssimo natural — desvios são sinal real
 *   - SHL drugs (Venvanse t½=11h) têm swing alto fisiológico — interpretar dentro da substância
 *   - Variabilidade ≠ adesão pura — mistura PK + adesão + fisiologia (não causal)
 *   - Apple State of Mind tem sampling bias (emoções fortes sub-amostram neutro)
 */

import { calculateConcentration, DEFAULT_PK_BODY_WEIGHT_KG, type PKMedication, type PKDose } from './pharmacokinetics'
import { pearson, type CorrelationResult } from './statistics'
import type { DailySnapshot } from '@/types/apple-health'
import type { ConcentrationSeriesPoint } from '@/lib/api'

export const PK_VARIABILITY_WINDOW_DAYS = 14
export const PK_VARIABILITY_LAG_DAYS = [0, 1, 2, 3] as const
export const PK_VARIABILITY_TIR_HOURS_PER_DAY = 24
export const PK_VARIABILITY_FALLBACK_ANALYSIS_DAYS = 60
export const PK_VARIABILITY_DOSE_WARMUP_DAYS = 14

export type PKVariabilityMetric = 'cv' | 'swing' | 'tir'

export const PK_VARIABILITY_METRICS: PKVariabilityMetric[] = ['cv', 'swing', 'tir']

export const PK_VARIABILITY_METRIC_LABELS: Record<PKVariabilityMetric, string> = {
  cv: 'CV% inter-dia (cmax)',
  swing: 'Swing intra-dia',
  tir: 'Time in Range',
}

export const PK_VARIABILITY_METRIC_UNITS: Record<PKVariabilityMetric, string> = {
  cv: '%',
  swing: '%',
  tir: 'h/dia',
}

export const PK_VARIABILITY_METRIC_DESCRIPTIONS: Record<PKVariabilityMetric, string> = {
  cv: 'Coeficiente de variação dos picos diários numa janela de 14 dias. Baixo = pico consistente.',
  swing: '(cmax − cmin) / média do dia × 100. Baixo = curva plana no dia. Alto = montanha-russa.',
  tir: 'Horas do dia em que a concentração ficou dentro do range terapêutico da substância.',
}

export interface PKVariabilityAnalysisWindow {
  fromIso: string
  toIso: string
  doseHours: number
  spanDays: number
  usesFallback: boolean
}

function isoFromUtcMs(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * Janela canônica da feature: usa todo o histórico real recebido no componente.
 * A UI pode mostrar poucos dias, mas a estatística não deve cortar a base sem
 * que o card declare explicitamente uma janela própria.
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
  const fromMs = usesFallback
    ? todayUtc - (PK_VARIABILITY_FALLBACK_ANALYSIS_DAYS - 1) * dayMs
    : validDays[0]
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

export type PKVariabilityQuality = 'insufficient' | 'partial' | 'observable'

function qualityForPairCount(pairs: number): PKVariabilityQuality {
  if (pairs < 10) return 'insufficient'
  if (pairs < 25) return 'partial'
  return 'observable'
}

/**
 * CV% (coefficient of variation) em janela móvel — sobre `cmax_est`.
 * Retorna null pra dias com janela insuficiente (mínimo: metade do window).
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
 * Swing intra-dia empírico: (cmax − cmin) / média × 100. Por dia.
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
 * Time in Range — horas/dia em que a concentração caiu dentro de [min, max].
 * Sample 24 instantes por dia (h=0..23 UTC) via calculateConcentration.
 * Retorna null se a substância não tem therapeuticRange definido.
 */
export function computeTirSeries(
  med: PKMedication,
  doses: PKDose[],
  dates: string[],
  weightKg: number = DEFAULT_PK_BODY_WEIGHT_KG,
): Array<number | null> {
  const range = med.therapeuticRange
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min >= range.max) {
    return dates.map(() => null)
  }
  return dates.map((dateStr) => {
    const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime()
    if (!Number.isFinite(dayStart)) return null
    let inRange = 0
    for (let h = 0; h < PK_VARIABILITY_TIR_HOURS_PER_DAY; h++) {
      const t = dayStart + h * 3600 * 1000
      const c = calculateConcentration(med, doses, t, weightKg)
      if (Number.isFinite(c) && c >= range.min && c <= range.max) inRange += 1
    }
    return inRange
  })
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
): Array<number | null> {
  if (metric === 'cv') {
    return computeRollingCv(
      series.map((p) => p.cmax_est),
      PK_VARIABILITY_WINDOW_DAYS,
    )
  }
  if (metric === 'swing') {
    return computeSwingSeries(series)
  }
  if (metric === 'tir') {
    return computeTirSeries(med, doses, series.map((p) => p.date), weightKg)
  }
  return []
}

interface VariabilityPair {
  metric: number
  mood: number
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

export interface QuartileDelta {
  q1Mood: number | null
  q4Mood: number | null
  q1q4Delta: number | null
  q1n: number
  q4n: number
}

/**
 * Humor médio em Q1 (mais estável/baixo) vs Q4 (mais instável/alto) da métrica.
 * Detecta sweet spot em U que Pearson sozinho perde (sinal não-monotônico).
 * Precisa de ≥8 pares pra calcular (Q1 e Q4 com pelo menos 2 cada).
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
}

/**
 * Pipeline completo: gera série de variabilidade, pareia com humor por data,
 * faz lag sweep 0-3d com Pearson + quartil. Análogo a buildMoodLagHypothesis
 * de correlations.ts mas pro domínio PK.
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
): PKVariabilityHypothesis {
  const usable = snapshots.filter((s) => !s.forecasted && !s.interpolated)
  const moodByDate = new Map<string, number | null>()
  for (const s of usable) moodByDate.set(s.date, s.mood?.valence ?? null)

  const metricSeries = buildPkVariabilitySeries(metric, med, doses, series, weightKg)
  const dateAlignedMood: Array<number | null> = series.map((p) => moodByDate.get(p.date) ?? null)
  const realMoodDays = dateAlignedMood.filter((v) => v != null).length

  const hasMetricData = metricSeries.some((v) => v != null)
  const hasMoodData = realMoodDays >= 5

  const rows: PKVariabilityRow[] = PK_VARIABILITY_LAG_DAYS.map((lag) => {
    const pairs = buildLagPairs(metricSeries, dateAlignedMood, lag)
    const result =
      pairs.length >= 10
        ? pearson(
            pairs.map((p) => p.metric),
            pairs.map((p) => p.mood),
          )
        : null
    const q = computeQuartileMoodDelta(pairs)
    return {
      lagDays: lag,
      n: pairs.length,
      quality: qualityForPairCount(pairs.length),
      result,
      q1Mood: q.q1Mood,
      q4Mood: q.q4Mood,
      q1q4Delta: q.q1q4Delta,
      q1n: q.q1n,
      q4n: q.q4n,
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
  }
}

/**
 * Critério pro relatório textual aparecer: sinal forte E robusto.
 * r > 0.3 OU r < -0.3 (efeito moderado-pra-cima), n >= 20, p < 0.05.
 * Não usa FDR aqui porque o card mostra UMA hipótese por vez, não múltiplas.
 */
export function hasStrongVariabilitySignal(row: PKVariabilityRow | null | undefined): boolean {
  if (!row || !row.result) return false
  return (
    Math.abs(row.result.r) >= 0.3 &&
    row.n >= 20 &&
    Number.isFinite(row.result.pValue) &&
    row.result.pValue < 0.05
  )
}
