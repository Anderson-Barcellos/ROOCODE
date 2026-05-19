import type { DailySnapshot } from '../types/apple-health'
import { mean } from './date'
import { computeRollingBaseline } from './personal-baselines'
import { buildPulseTemperatureProxySeries } from './pulse-temperature-proxy'
import { computeSleepRegularitySeries } from './sleep-regularity'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type CircadianRobustnessComponentKey =
  | 'sleepRegularity'
  | 'daylight'
  | 'temperatureAmplitude'
  | 'heartRateContrast'

export interface CircadianRobustnessComponent {
  key: CircadianRobustnessComponentKey
  label: string
  value: number | null
  unit: string
  score: number | null
  baseWeight: number
  activeWeight: number
  note: string
}

export interface CircadianRobustnessResult {
  score: number | null
  confidence: number
  readiness: 'robust' | 'exploratory' | 'collecting'
  readinessStatus: 'standby' | 'collecting' | 'exploratory' | 'robust'
  components: CircadianRobustnessComponent[]
  completeDays: number
  inputsUsed: number
  amplitudeAvailable: boolean
  verdict: string
  reason: 'ok' | 'inputs_missing' | 'insufficient_readiness'
  evidence: IndexEvidenceReport
}

const WEIGHTS: Record<CircadianRobustnessComponentKey, number> = {
  sleepRegularity: 0.3,
  daylight: 0.25,
  temperatureAmplitude: 0.25,
  heartRateContrast: 0.2,
}

const TEMP_BASELINE_MIN_POINTS = 10
const TEMP_BASELINE_WINDOW = 30
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function scale(value: number, low: number, high: number, lowScore = 20, highScore = 95): number {
  const ratio = clamp((value - low) / (high - low), 0, 1)
  return lowScore + ratio * (highScore - lowScore)
}

function component(
  key: CircadianRobustnessComponentKey,
  label: string,
  value: number | null,
  unit: string,
  score: number | null,
  note: string,
): CircadianRobustnessComponent {
  const baseWeight = WEIGHTS[key]
  return {
    key,
    label,
    value,
    unit,
    score,
    baseWeight,
    activeWeight: score == null ? 0 : baseWeight,
    note,
  }
}

function latestNumber(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]
    if (value != null && Number.isFinite(value)) return value
  }
  return null
}

function scoreThermalBaselineDeviation(deviation: number | null): number | null {
  if (deviation == null || !Number.isFinite(deviation)) return null
  const abs = Math.abs(deviation)
  if (abs <= 0.15) return 95
  if (abs >= 0.8) return 20
  return scale(0.8 - abs, 0, 0.65, 20, 95)
}

export function computeCircadianRobustness(
  snapshots: ReadonlyArray<DailySnapshot>,
): CircadianRobustnessResult {
  const readinessGate = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.circadianRobustnessIndex,
    'CircadianRobustness',
  )
  const real = snapshots.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted)
  const sleepRegularity = computeSleepRegularitySeries(real)
  const latestSri = latestNumber(sleepRegularity.map((point) => point.score))
  const daylightAvg = mean(real.slice(-14).map((snapshot) => snapshot.health?.daylightMinutes ?? null))
  const pulseTemp = buildPulseTemperatureProxySeries(real)
  const pulseTempBaseline = computeRollingBaseline(pulseTemp.values, {
    minPoints: TEMP_BASELINE_MIN_POINTS,
    windowSize: TEMP_BASELINE_WINDOW,
  })
  const latestPulseTemp = latestNumber(pulseTemp.values)
  const thermalBaselineDeviation =
    latestPulseTemp != null && pulseTempBaseline != null
      ? latestPulseTemp - pulseTempBaseline.mean
      : null
  const thermalScore = scoreThermalBaselineDeviation(thermalBaselineDeviation)
  const heartRateContrast = mean(
    real.slice(-14).map((snapshot) => {
      const meanHr = snapshot.health?.heartRateMean ?? null
      const rhr = snapshot.health?.restingHeartRate ?? null
      if (meanHr == null || rhr == null) return null
      return Math.max(0, meanHr - rhr)
    }),
  )

  const amplitudeAvailable = thermalScore != null

  const components = [
    component(
      'sleepRegularity',
      'SRI',
      latestSri,
      '/100',
      latestSri,
      'calculado na Recuperação',
    ),
    component(
      'daylight',
      'Luz do dia',
      daylightAvg,
      'min/dia',
      daylightAvg == null ? null : scale(daylightAvg, 20, 120),
      daylightAvg != null && daylightAvg >= 120 ? 'faixa ideal' : 'mínimo clínico: >30 min/dia',
    ),
    component(
      'temperatureAmplitude',
      'Temp. pulso vs baseline',
      thermalBaselineDeviation,
      'C',
      thermalScore,
      pulseTempBaseline == null
        ? 'baseline térmico em formação'
        : pulseTemp.interpolatedCount > 0
          ? `proxy noturna · ${pulseTemp.interpolatedCount} interpolações leves`
          : pulseTemp.trendedCount > 0
            ? `proxy noturna · ${pulseTemp.trendedCount} tendência curta`
            : 'proxy noturna por variação do baseline',
    ),
    component(
      'heartRateContrast',
      'Contraste FC ativa/sono',
      heartRateContrast,
      'bpm',
      heartRateContrast == null ? null : scale(heartRateContrast, 6, 24),
      'proxy por FC média diária menos FC repouso',
    ),
  ]

  const active = components.filter((item) => item.score != null)
  const totalWeight = active.reduce((sum, item) => sum + item.baseWeight, 0)
  const score = totalWeight > 0
    ? active.reduce((sum, item) => sum + (item.score ?? 0) * item.baseWeight, 0) / totalWeight
    : null
  const completeDays = real.filter((snapshot, index) => {
    const sri = sleepRegularity[index]?.score ?? null
    return (
      sri != null &&
      snapshot.health?.daylightMinutes != null &&
      pulseTemp.values[index] != null &&
      snapshot.health?.heartRateMean != null &&
      snapshot.health?.restingHeartRate != null
    )
  }).length
  const readiness =
    completeDays >= 28 && amplitudeAvailable
      ? 'robust'
      : completeDays >= 14
        ? 'exploratory'
        : 'collecting'
  const readinessStatus = readinessGate.status
  const eligible = readinessStatus !== 'standby'
  const proxyPenalty = pulseTemp.interpolatedCount > 0 || pulseTemp.trendedCount > 0 ? 0.95 : 1
  const baseConfidence = clamp(totalWeight * proxyPenalty, 0, 1)
  const gatedScore = eligible ? score : null

  const verdict =
    gatedScore == null
      ? 'Ainda faltam horários de sono, luz e FC para estimar robustez circadiana.'
      : !amplitudeAvailable
        ? 'Robustez circadiana parcial: SRI, luz e contraste cardíaco entram; baseline térmico ainda está em formação.'
        : gatedScore >= 70
          ? 'Ritmo circadiano preservado nos zeitgebers disponíveis, com variação térmica noturna próxima do baseline.'
          : gatedScore >= 45
            ? 'Ritmo circadiano intermediário; regularidade, luz ou desvio térmico noturno podem estar limitando.'
            : 'Ritmo circadiano frágil no período; zeitgebers, regularidade e desvio térmico merecem prioridade.'
  const usedKeys = active.map((item) => item.key)
  const missingKeys = components.filter((item) => item.score == null).map((item) => item.key)
  const hasThermalProxy = pulseTemp.interpolatedCount > 0 || pulseTemp.trendedCount > 0

  return {
    score: gatedScore,
    confidence: baseConfidence,
    readiness,
    readinessStatus,
    components,
    completeDays,
    inputsUsed: active.length,
    amplitudeAvailable,
    verdict,
    reason: gatedScore == null ? (eligible ? 'inputs_missing' : 'insufficient_readiness') : 'ok',
    evidence: buildIndexEvidenceReport({
      eligible: gatedScore != null,
      reason: gatedScore == null ? (eligible ? 'inputs_missing' : 'insufficient_readiness') : 'ok',
      inputsUsed: usedKeys,
      inputsMissing: missingKeys,
      proxiesUsed: hasThermalProxy ? ['pulseTemperatureProxy'] : [],
      usedInterpolated: false,
      confidencePenalty: baseConfidence,
      readiness: readinessStatus,
    }),
  }
}

export function formatCircadianReadiness(result: CircadianRobustnessResult): string {
  if (result.readiness === 'robust') return `Robusto · ${result.completeDays} dias`
  if (result.readiness === 'exploratory') return `Exploratório · ${result.completeDays}/28 dias`
  return `Coletando · ${result.completeDays}/14 dias`
}
