import type { DailySnapshot } from '../types/apple-health'
import { computeChronotropicSeries } from './chronotropic-response'
import { computeHeartRateReserveSeries } from './heart-rate-reserve'
import { estimateVo2MaxUthSorensen, ANDERS_HRMAX_BPM } from './health-policies'
import { mean } from './date'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type FunctionalCapacityComponentKey =
  | 'vo2Estimated'
  | 'vo2SixMinuteWalk'
  | 'heartRateReserve'
  | 'chronotropic'
  | 'heartRateRecovery'

export interface FunctionalCapacityComponent {
  key: FunctionalCapacityComponentKey
  label: string
  value: number | null
  unit: string
  score: number | null
  baseWeight: number
  activeWeight: number
  confidence: number
  status: 'ok' | 'missing'
  note: string
}

export interface FunctionalCapacityResult {
  date: string | null
  score: number | null
  confidence: number
  readiness: 'robust' | 'exploratory' | 'collecting'
  readinessStatus: 'standby' | 'collecting' | 'exploratory' | 'robust'
  components: FunctionalCapacityComponent[]
  inputsUsed: number
  eventsUsed: number
  vo2Estimated: number | null
  vo2SixMinuteWalk: number | null
  vo2Divergence: number | null
  verdict: string
  reason: 'ok' | 'inputs_missing' | 'insufficient_readiness'
  evidence: IndexEvidenceReport
}

const WEIGHTS: Record<FunctionalCapacityComponentKey, number> = {
  vo2Estimated: 0.3,
  vo2SixMinuteWalk: 0.2,
  heartRateReserve: 0.2,
  chronotropic: 0.2,
  heartRateRecovery: 0.1,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function scale(value: number, low: number, high: number, lowScore = 20, highScore = 95): number {
  if (high <= low) return lowScore
  const ratio = clamp((value - low) / (high - low), 0, 1)
  return lowScore + ratio * (highScore - lowScore)
}

function latestRealHealthSnapshot(snapshots: ReadonlyArray<DailySnapshot>): DailySnapshot | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index]
    if (!snapshot.forecasted && !snapshot.interpolated && snapshot.health) return snapshot
  }
  return null
}

function latestHealthValue(
  snapshots: ReadonlyArray<DailySnapshot>,
  getter: (snapshot: DailySnapshot) => number | null | undefined,
): { value: number; date: string } | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index]
    if (snapshot.forecasted || snapshot.interpolated || !snapshot.health) continue
    const value = getter(snapshot)
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { value, date: snapshot.date }
    }
  }
  return null
}

function latestSeriesValue<T extends { date: string }>(
  series: ReadonlyArray<T>,
  visibleDates: ReadonlySet<string>,
  getter: (point: T) => number | null | undefined,
): { value: number; date: string; point: T } | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const point = series[index]
    if ('derivedFromInterpolated' in point && point.derivedFromInterpolated === true) continue
    if (!visibleDates.has(point.date)) continue
    const value = getter(point)
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { value, date: point.date, point }
    }
  }
  return null
}

function estimateVo2FromSixMinuteWalk(distanceMeters: number | null): number | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters <= 0) return null
  return 3.98 + 0.03 * distanceMeters
}

function component(
  key: FunctionalCapacityComponentKey,
  label: string,
  value: number | null,
  unit: string,
  score: number | null,
  confidence: number,
  note: string,
): FunctionalCapacityComponent {
  const baseWeight = WEIGHTS[key]
  return {
    key,
    label,
    value,
    unit,
    score,
    baseWeight,
    activeWeight: score == null ? 0 : baseWeight,
    confidence: score == null ? 0 : confidence,
    status: score == null ? 'missing' : 'ok',
    note,
  }
}

export function computeFunctionalCapacity(
  snapshots: ReadonlyArray<DailySnapshot>,
  baselineSnapshots: ReadonlyArray<DailySnapshot> = snapshots,
): FunctionalCapacityResult {
  const readinessGate = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.functionalCapacityIndex,
    'FunctionalCapacityIndex',
  )
  const latest = latestRealHealthSnapshot(snapshots)
  const hrrSeries = computeHeartRateReserveSeries(baselineSnapshots as DailySnapshot[])
  const chronoSeries = computeChronotropicSeries(baselineSnapshots as DailySnapshot[])
  const visibleDates = new Set(snapshots.map((snapshot) => snapshot.date))
  const latestHrr = latestSeriesValue(hrrSeries, visibleDates, (point) => point.hrr)
  const latestChrono = latestSeriesValue(chronoSeries, visibleDates, (point) => point.zScore)
  const latestVo2 = latestHealthValue(snapshots, (snapshot) => snapshot.health?.vo2Max)
  const latestRhr = latestHealthValue(snapshots, (snapshot) => snapshot.health?.restingHeartRate)
  const latestSixMinuteWalk = latestHealthValue(snapshots, (snapshot) => snapshot.health?.sixMinuteWalkMeters)
  const latestHrrOneMinute = latestHealthValue(snapshots, (snapshot) => snapshot.health?.cardioRecoveryBpm)

  const vo2Predicted = estimateVo2MaxUthSorensen(latestRhr?.value ?? null)
  const vo2Estimated = vo2Predicted ?? latestVo2?.value ?? null
  const sixMinuteWalkDistance = latestSixMinuteWalk?.value ?? null
  const vo2SixMinuteWalk = estimateVo2FromSixMinuteWalk(sixMinuteWalkDistance)
  const hrr = latestHrr?.value ?? null
  const chrono = latestChrono?.value ?? null
  const hrrOneMinute = latestHrrOneMinute?.value ?? null

  const realEffortDays = baselineSnapshots.filter((snapshot) => {
    if (snapshot.interpolated || snapshot.forecasted || !snapshot.health) return false
    return (
      snapshot.health.walkingHeartRateAvg != null ||
      snapshot.health.cardioRecoveryBpm != null ||
      snapshot.health.sixMinuteWalkMeters != null
    )
  }).length

  const components = [
    component(
      'vo2Estimated',
      'VO2 estimado',
      vo2Estimated,
      'ml/kg/min',
      vo2Estimated == null ? null : scale(vo2Estimated, 28, 48),
      vo2Predicted != null ? 0.65 : 0.9,
      vo2Predicted != null
        ? `fórmula por FC repouso · ${latestRhr?.date}`
        : latestVo2 != null
          ? `Apple/AutoExport · ${latestVo2.date}`
          : 'sem VO2 nem FC repouso no recorte',
    ),
    component(
      'vo2SixMinuteWalk',
      'VO2 6MWT',
      vo2SixMinuteWalk,
      'ml/kg/min',
      vo2SixMinuteWalk == null ? null : scale(vo2SixMinuteWalk, 16, 26),
      0.95,
      sixMinuteWalkDistance == null ? 'aguardando teste de 6 minutos' : `${Math.round(sixMinuteWalkDistance)} m · ${latestSixMinuteWalk?.date}`,
    ),
    component(
      'heartRateReserve',
      'Reserva cardíaca',
      hrr,
      'bpm',
      hrr == null ? null : scale(hrr, 90, 130),
      latestHrr?.point.confidence ?? 0,
      latestHrr == null ? 'sem FC repouso no recorte' : `HRmax estimada menos FC repouso · ${latestHrr.date}`,
    ),
    component(
      'chronotropic',
      'Cronotrópica',
      chrono,
      'z',
      chrono == null ? null : scale(chrono, -1.5, 1.5, 25, 95),
      latestChrono?.point.confidence ?? 0,
      latestChrono == null ? 'sem FC caminhada + repouso no recorte' : `z-score pessoal caminhada vs repouso · ${latestChrono.date}`,
    ),
    component(
      'heartRateRecovery',
      'HRR 1min',
      hrrOneMinute,
      'bpm',
      hrrOneMinute == null ? null : scale(hrrOneMinute, 8, 22),
      hrrOneMinute == null ? 0 : 0.8,
      hrrOneMinute == null ? 'sem fonte registrada em Recuperação Cardio' : `queda FC no 1o minuto · ${latestHrrOneMinute?.date}`,
    ),
  ]

  const active = components.filter((item) => item.score != null)
  const totalWeight = active.reduce((sum, item) => sum + item.baseWeight, 0)
  const score = totalWeight > 0
    ? active.reduce((sum, item) => sum + (item.score ?? 0) * item.baseWeight, 0) / totalWeight
    : null
  const confidence = totalWeight > 0
    ? active.reduce((sum, item) => sum + item.confidence * item.baseWeight, 0) / totalWeight * (totalWeight / 1)
    : 0

  const vo2Divergence =
    vo2Estimated != null && vo2SixMinuteWalk != null
      ? vo2SixMinuteWalk - vo2Estimated
      : null
  const readiness =
    active.length >= 4 && realEffortDays >= 28
      ? 'robust'
      : active.length >= 3 && realEffortDays >= 10
        ? 'exploratory'
        : 'collecting'
  const eligible = readinessGate.status !== 'standby'
  const readinessStatus = readinessGate.status

  const activityAvg = mean(
    snapshots
      .filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted)
      .slice(-30)
      .map((snapshot) => snapshot.health?.steps ?? null),
  )
  const sedentaryPrefix =
    activityAvg != null && activityAvg < 5000
      ? 'Capacidade medida em contexto sedentário: '
      : ''

  const gatedScore = eligible ? score : null
  const verdict =
    gatedScore == null
      ? 'Ainda faltam sinais sob esforço para estimar capacidade funcional.'
      : gatedScore >= 72
        ? `${sedentaryPrefix}reserva funcional preservada nos inputs disponíveis, com leitura ainda dependente de eventos de esforço reais.`
        : gatedScore >= 50
          ? `${sedentaryPrefix}capacidade funcional intermediária; os dados sugerem margem para ganho com carga aeróbica progressiva.`
          : `${sedentaryPrefix}capacidade funcional baixa no período; priorizar aumento de deslocamento diário antes de treino estruturado.`

  const usedKeys = active.map((item) => item.key)
  const missingKeys = components.filter((item) => item.score == null).map((item) => item.key)
  const baseConfidence = clamp(confidence, 0, 1)

  return {
    date: latest?.date ?? null,
    score: gatedScore,
    confidence: baseConfidence,
    readiness,
    readinessStatus,
    components,
    inputsUsed: active.length,
    eventsUsed: realEffortDays,
    vo2Estimated,
    vo2SixMinuteWalk,
    vo2Divergence,
    verdict,
    reason: gatedScore == null ? (eligible ? 'inputs_missing' : 'insufficient_readiness') : 'ok',
    evidence: buildIndexEvidenceReport({
      eligible: gatedScore != null,
      reason: gatedScore == null ? (eligible ? 'inputs_missing' : 'insufficient_readiness') : 'ok',
      inputsUsed: usedKeys,
      inputsMissing: missingKeys,
      proxiesUsed: vo2Predicted != null && latestVo2 == null ? ['vo2FromRhr'] : [],
      usedInterpolated: false,
      confidencePenalty: baseConfidence,
      readiness: readinessStatus,
    }),
  }
}

export function formatFunctionalCapacityReadiness(result: FunctionalCapacityResult): string {
  if (result.readiness === 'robust') return `Robusto · ${result.eventsUsed} dias/eventos`
  if (result.readiness === 'exploratory') return `Exploratório · ${result.eventsUsed}/28 dias/eventos`
  return `Coletando · ${result.eventsUsed}/10 dias/eventos`
}

export function getFunctionalCapacityTone(score: number | null): 'positive' | 'watch' | 'negative' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 72) return 'positive'
  if (score >= 50) return 'watch'
  return 'negative'
}

export function getEstimatedHrMaxLabel(): string {
  return `${ANDERS_HRMAX_BPM} bpm estimado`
}
