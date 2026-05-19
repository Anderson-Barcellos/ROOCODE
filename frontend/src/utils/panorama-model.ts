import { getDay, parseISO } from 'date-fns'

import type { DoseRecord } from '../lib/api'
import type { MedicationRegimenEntry } from '../types/pharmacology'
import type { DailySnapshot } from '../types/apple-health'
import { computePanoramaConfidence } from './panorama-top'
import {
  computeRecoveryIndexSeries,
  rankRecoveryIndexComponents,
} from './recovery-index'
import { computeFunctionalCapacity } from './functional-capacity'
import { computeCircadianRobustness } from './circadian-robustness'
import { computeCoverageStatus, type CoverageClass, type CoverageStatus } from './pk-coverage'
import { trendDirection, type TrendDirection } from './statistics'
import { computeLatestSocialJetLag } from './sleep-regularity'

export type PanoramaPillarKey = 'recovery' | 'capacity' | 'chronobiology'

export interface PanoramaPillarCard {
  key: PanoramaPillarKey
  label: string
  score: number | null
  trend: TrendDirection
  sparkline: number[]
  limiterText: string | null
  confidencePct: number
  confidenceLabel: string
  targetTab: 'recuperacao' | 'capacidade'
  targetAnchor?: string
}

export interface PanoramaBridgeMood {
  average7d: number | null
  trend: TrendDirection
  sparkline: number[]
  verdict: string
}

export type PanoramaPkBridgeBadgeTone = 'green' | 'yellow' | 'red' | 'white'

export interface PanoramaPkBridgeItem {
  substance: string
  tone: PanoramaPkBridgeBadgeTone
  statusLabel: string
  klass: CoverageClass
}

export interface PanoramaPkModulation {
  active: boolean
  level: 'none' | 'missing_dose' | 'moderate' | 'high'
  cap: number | null
  label: string
  detail: string
}

export interface PanoramaDayDecision {
  score: number | null
  rawScore: number | null
  status: 'green' | 'yellow' | 'red' | 'neutral'
  headline: string
  limiter: PanoramaPillarKey | null
  limiterText: string | null
  contextLine: string
  actions: string[]
  confidencePct: number
  confidenceLabel: string
  confidenceDetail: string
  latestDate: string | null
  pkModulation: PanoramaPkModulation
}

export interface PanoramaWeeklyComparisonRow {
  key: PanoramaPillarKey
  label: string
  weekdayMean: number | null
  weekendMean: number | null
  deltaWeekendMinusWeekday: number | null
}

export interface PanoramaHistoryPoint {
  date: string
  composite: number | null
  recovery: number | null
  capacity: number | null
  chronobiology: number | null
}

export interface PanoramaModel {
  decision: PanoramaDayDecision
  triad: PanoramaPillarCard[]
  moodBridge: PanoramaBridgeMood
  pkBridge: PanoramaPkBridgeItem[]
  weeklyComparison: PanoramaWeeklyComparisonRow[]
  socialJetLagHours: number | null
  history: PanoramaHistoryPoint[]
}

interface BuildPanoramaModelInput {
  snapshots: DailySnapshot[]
  doses: DoseRecord[]
  regimen: MedicationRegimenEntry[]
}

interface PillarSeriesPoint {
  date: string
  score: number | null
  confidence: number
  limiterText: string | null
}

const WEIGHTS: Record<PanoramaPillarKey, number> = {
  recovery: 0.4,
  capacity: 0.35,
  chronobiology: 0.25,
}

const MODERATE_PK_CLASSES = new Set<CoverageClass>(['queda', 'cobertura_incompleta'])
const HIGH_PK_CLASSES = new Set<CoverageClass>(['vulnerabilidade', 'acima_faixa'])

const LIMITER_LABEL: Record<PanoramaPillarKey, string> = {
  recovery: 'Recuperação abaixo da sua baseline recente',
  capacity: 'Capacidade funcional abaixo da sua baseline recente',
  chronobiology: 'Cronobiologia abaixo da sua baseline recente',
}

function mean(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (!numeric.length) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

function weightedMean(values: Partial<Record<PanoramaPillarKey, number | null>>): number | null {
  let sum = 0
  let weightSum = 0
  for (const key of Object.keys(WEIGHTS) as PanoramaPillarKey[]) {
    const value = values[key]
    if (value == null || !Number.isFinite(value)) continue
    sum += value * WEIGHTS[key]
    weightSum += WEIGHTS[key]
  }
  if (weightSum === 0) return null
  return sum / weightSum
}

function applyEma(values: Array<number | null>, alpha = 0.32): Array<number | null> {
  let last: number | null = null
  return values.map((value) => {
    if (value == null || !Number.isFinite(value)) return last
    if (last == null) {
      last = value
      return value
    }
    last = alpha * value + (1 - alpha) * last
    return last
  })
}

function latestNonNull<T>(values: T[], getter: (value: T) => number | null): T | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = getter(values[index])
    if (value != null && Number.isFinite(value)) return values[index]
  }
  return null
}

function buildRecoverySeries(snapshots: DailySnapshot[]): PillarSeriesPoint[] {
  const labelMap = {
    sleep: 'sono recente',
    sleepDebt: 'débito de sono',
    hrv: 'HRV',
    rhr: 'FC repouso',
    pulseTemp: 'temperatura noturna',
  } as const

  return computeRecoveryIndexSeries(snapshots).map((point) => {
    const limiter = point.components
      ? rankRecoveryIndexComponents(point.components, point.inputsUsed)[0]
      : null
    return {
      date: point.date,
      score: point.score,
      confidence: point.confidence,
      limiterText: limiter ? labelMap[limiter.component] : null,
    }
  })
}

function buildCapacitySeries(snapshots: DailySnapshot[]): PillarSeriesPoint[] {
  return snapshots.map((snapshot, index) => {
    const window = snapshots.slice(0, index + 1)
    const result = computeFunctionalCapacity(window, snapshots)
    const limiter = result.components
      .filter((component) => component.score != null)
      .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))[0]

    return {
      date: snapshot.date,
      score: result.score,
      confidence: result.confidence,
      limiterText: limiter?.label ?? null,
    }
  })
}

function buildChronobiologySeries(snapshots: DailySnapshot[]): PillarSeriesPoint[] {
  return snapshots.map((snapshot, index) => {
    const window = snapshots.slice(0, index + 1)
    const result = computeCircadianRobustness(window)
    const limiter = result.components
      .filter((component) => component.score != null)
      .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))[0]

    return {
      date: snapshot.date,
      score: result.score,
      confidence: result.confidence,
      limiterText: limiter?.label ?? null,
    }
  })
}

function toTriadCard(
  key: PanoramaPillarKey,
  series: PillarSeriesPoint[],
  targetTab: 'recuperacao' | 'capacidade',
  targetAnchor?: string,
): PanoramaPillarCard {
  const latest = latestNonNull(series, (point) => point.score)
  const scoreSeries = series.map((point) => point.score)
  const sparkline = scoreSeries
    .filter((score): score is number => score != null && Number.isFinite(score))
    .slice(-7)

  const trend = trendDirection(sparkline)

  const label =
    key === 'recovery'
      ? 'Recuperação'
      : key === 'capacity'
      ? 'Capacidade'
      : 'Cronobiologia'

  const confidencePct = latest ? Math.round(latest.confidence * 100) : 0
  const confidenceLabel =
    confidencePct >= 90
      ? 'Robusta'
      : confidencePct >= 65
      ? 'Parcial'
      : confidencePct > 0
      ? 'Exploratória'
      : 'Coletando'

  return {
    key,
    label,
    score: latest?.score ?? null,
    trend,
    sparkline,
    limiterText: latest?.limiterText ?? null,
    confidencePct,
    confidenceLabel,
    targetTab,
    targetAnchor,
  }
}

function buildMoodBridge(snapshots: DailySnapshot[]): PanoramaBridgeMood {
  const realMood = snapshots
    .filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted)
    .map((snapshot) => snapshot.mood?.valence ?? null)

  const latest7 = realMood
    .filter((value): value is number => value != null && Number.isFinite(value))
    .slice(-7)

  const average7d = mean(latest7)
  const trend = trendDirection(latest7)

  const verdict =
    trend === 'improving'
      ? 'Humor em melhora nas últimas medições.'
      : trend === 'worsening'
      ? 'Humor em deterioração recente; vale revisar carga e cobertura.'
      : 'Humor estável no período recente.'

  return {
    average7d,
    trend,
    sparkline: latest7,
    verdict,
  }
}

function statusTone(klass: CoverageClass): PanoramaPkBridgeBadgeTone {
  if (klass === 'acima_faixa' || klass === 'vulnerabilidade') return 'red'
  if (klass === 'queda' || klass === 'cobertura_incompleta') return 'yellow'
  if (klass === 'sem_faixa') return 'white'
  return 'green'
}

function statusLabel(klass: CoverageClass, missingDose: boolean): string {
  if (missingDose) return 'Sem dose registrada'
  if (klass === 'acima_faixa') return 'Supraterapêutico'
  if (klass === 'vulnerabilidade') return 'Subterapêutico'
  if (klass === 'queda') return 'Em queda'
  if (klass === 'cobertura_incompleta') return 'Cobertura incompleta'
  if (klass === 'sem_faixa') return 'Sem faixa clínica'
  return 'Em faixa'
}

export function summarizePkBridge(statuses: CoverageStatus[]): PanoramaPkBridgeItem[] {
  const critical = statuses.filter((status) => status.expectedDosesLast48h > 0 || status.loggedDosesLast48h > 0)
  return critical.map((status) => {
    const missingDose = status.expectedDosesLast48h > 0 && status.loggedDosesLast48h === 0
    return {
      substance: status.displayName,
      tone: missingDose ? 'white' : statusTone(status.klass),
      statusLabel: statusLabel(status.klass, missingDose),
      klass: status.klass,
    }
  })
}

export function selectPkModulation(statuses: CoverageStatus[]): PanoramaPkModulation {
  const relevant = statuses.filter((status) => status.expectedDosesLast48h > 0 || status.loggedDosesLast48h > 0)
  if (relevant.length === 0) {
    return {
      active: false,
      level: 'none',
      cap: null,
      label: 'Sem modulação farmacológica',
      detail: 'Sem substâncias críticas ativas na janela atual.',
    }
  }

  const high = relevant.filter((status) => HIGH_PK_CLASSES.has(status.klass))
  if (high.length > 0) {
    return {
      active: true,
      level: 'high',
      cap: 58,
      label: 'Ajuste farmacológico crítico',
      detail: `Veredito ajustado por PK crítica (${high.map((status) => status.displayName).join(', ')}).`,
    }
  }

  const moderate = relevant.filter((status) => MODERATE_PK_CLASSES.has(status.klass))
  if (moderate.length > 0) {
    return {
      active: true,
      level: 'moderate',
      cap: 72,
      label: 'Ajuste farmacológico moderado',
      detail: `Veredito ajustado por cobertura em risco (${moderate.map((status) => status.displayName).join(', ')}).`,
    }
  }

  const missingDose = relevant.filter(
    (status) => status.expectedDosesLast48h > 0 && status.loggedDosesLast48h === 0,
  )
  if (missingDose.length > 0) {
    return {
      active: true,
      level: 'missing_dose',
      cap: 68,
      label: 'Ajuste por dose ausente',
      detail: `Sem dose recente registrada para ${missingDose.map((status) => status.displayName).join(', ')}.`,
    }
  }

  return {
    active: false,
    level: 'none',
    cap: null,
    label: 'Sem modulação farmacológica',
    detail: 'Cobertura farmacológica sem ajustes de prudência no momento.',
  }
}

export function classifyDecisionStatus(
  score: number | null,
  pkLevel: PanoramaPkModulation['level'],
): PanoramaDayDecision['status'] {
  if (score == null || !Number.isFinite(score)) return 'neutral'
  if (pkLevel === 'high') return 'red'
  if (pkLevel === 'moderate' || pkLevel === 'missing_dose') {
    return score >= 45 ? 'yellow' : 'red'
  }
  if (score >= 70) return 'green'
  if (score >= 45) return 'yellow'
  return 'red'
}

function decisionHeadline(status: PanoramaDayDecision['status']): string {
  if (status === 'green') return 'Dia pra empurrar com critério'
  if (status === 'yellow') return 'Carga moderada recomendada'
  if (status === 'red') return 'Carga leve hoje'
  return 'Aguardando dados confiáveis'
}

function buildActions(
  status: PanoramaDayDecision['status'],
  limiter: PanoramaPillarKey | null,
): string[] {
  const base =
    status === 'green'
      ? 'Usar a janela para tarefas de maior demanda, mantendo monitoramento subjetivo ao longo do dia.'
      : status === 'yellow'
      ? 'Manter intensidade moderada e evitar decisões de alto custo fisiológico sem pausa planejada.'
      : status === 'red'
      ? 'Priorizar proteção de carga e recuperação ativa nas próximas 24 horas.'
      : 'Coletar mais dados antes de usar o painel como bússola principal.'

  const limiterAction: Record<PanoramaPillarKey, string> = {
    recovery: 'Foco em regularidade de sono e redução de atrito autonômico hoje.',
    capacity: 'Foco em carga fracionada e evitar picos de exigência contínua.',
    chronobiology: 'Foco em zeitgebers: luz matinal, horário consistente e proteção da noite.',
  }

  return limiter ? [base, limiterAction[limiter]] : [base]
}

function detectPrimaryLimiter(
  triad: PanoramaPillarCard[],
  history: PanoramaHistoryPoint[],
): PanoramaPillarKey | null {
  const deltas = triad
    .map((card) => {
      const current = card.score
      if (current == null || !Number.isFinite(current)) return null
      const historical = history
        .slice(-30, -1)
        .map((point) => point[card.key])
        .filter((value): value is number => value != null && Number.isFinite(value))

      const baseline = mean(historical)
      return {
        key: card.key,
        current,
        deltaFromBaseline: baseline != null ? current - baseline : null,
      }
    })
    .filter((item): item is { key: PanoramaPillarKey; current: number; deltaFromBaseline: number | null } => item !== null)

  const withBaseline = deltas.filter((item) => item.deltaFromBaseline != null)
  if (withBaseline.length > 0) {
    return withBaseline.sort((left, right) => (left.deltaFromBaseline ?? 0) - (right.deltaFromBaseline ?? 0))[0].key
  }

  if (deltas.length === 0) return null
  return deltas.sort((left, right) => left.current - right.current)[0].key
}

function buildWeeklyComparison(
  triadSeries: Record<PanoramaPillarKey, PillarSeriesPoint[]>,
): PanoramaWeeklyComparisonRow[] {
  const rows: PanoramaWeeklyComparisonRow[] = []

  for (const key of Object.keys(triadSeries) as PanoramaPillarKey[]) {
    const points = triadSeries[key]
    const weekday: number[] = []
    const weekend: number[] = []

    for (const point of points) {
      if (point.score == null || !Number.isFinite(point.score)) continue
      const day = getDay(parseISO(point.date))
      if (day === 0 || day === 6) {
        weekend.push(point.score)
      } else {
        weekday.push(point.score)
      }
    }

    const weekdayMean = mean(weekday)
    const weekendMean = mean(weekend)
    rows.push({
      key,
      label: key === 'recovery' ? 'Recuperação' : key === 'capacity' ? 'Capacidade' : 'Cronobiologia',
      weekdayMean,
      weekendMean,
      deltaWeekendMinusWeekday:
        weekdayMean != null && weekendMean != null ? weekendMean - weekdayMean : null,
    })
  }

  return rows
}

function buildHistory(
  snapshots: DailySnapshot[],
  recoverySeries: PillarSeriesPoint[],
  capacitySeries: PillarSeriesPoint[],
  chronoSeries: PillarSeriesPoint[],
  doses: DoseRecord[],
  regimen: MedicationRegimenEntry[],
): PanoramaHistoryPoint[] {
  const rawComposite = snapshots.map((snapshot, index) => ({
    date: snapshot.date,
    recovery: recoverySeries[index]?.score ?? null,
    capacity: capacitySeries[index]?.score ?? null,
    chronobiology: chronoSeries[index]?.score ?? null,
    composite: weightedMean({
      recovery: recoverySeries[index]?.score ?? null,
      capacity: capacitySeries[index]?.score ?? null,
      chronobiology: chronoSeries[index]?.score ?? null,
    }),
  }))

  const smoothed = applyEma(rawComposite.map((point) => point.composite))

  return rawComposite.map((point, index) => {
    const dayTs = new Date(`${point.date}T12:00:00`).getTime()
    const statuses = computeCoverageStatus(doses, regimen, { now: dayTs })
    const pkMod = selectPkModulation(statuses)
    const score = smoothed[index]
    const modulated =
      score != null && pkMod.cap != null
        ? Math.min(score, pkMod.cap)
        : score

    return {
      date: point.date,
      composite: modulated,
      recovery: point.recovery,
      capacity: point.capacity,
      chronobiology: point.chronobiology,
    }
  })
}

export function buildPanoramaModel({ snapshots, doses, regimen }: BuildPanoramaModelInput): PanoramaModel {
  const ordered = [...snapshots].sort((left, right) => left.date.localeCompare(right.date))
  const recoverySeries = buildRecoverySeries(ordered)
  const capacitySeries = buildCapacitySeries(ordered)
  const chronobiologySeries = buildChronobiologySeries(ordered)

  const triad = [
    toTriadCard('recovery', recoverySeries, 'recuperacao'),
    toTriadCard('capacity', capacitySeries, 'capacidade'),
    toTriadCard('chronobiology', chronobiologySeries, 'capacidade', 'capacity-panel-circadian'),
  ]

  const statuses = computeCoverageStatus(doses, regimen)
  const pkBridge = summarizePkBridge(statuses)
  const pkModulation = selectPkModulation(statuses)

  const history = buildHistory(
    ordered,
    recoverySeries,
    capacitySeries,
    chronobiologySeries,
    doses,
    regimen,
  )

  const latest = history.at(-1) ?? null
  const limiter = detectPrimaryLimiter(triad, history)

  const rawScore = latest?.composite ?? weightedMean({
    recovery: triad.find((card) => card.key === 'recovery')?.score ?? null,
    capacity: triad.find((card) => card.key === 'capacity')?.score ?? null,
    chronobiology: triad.find((card) => card.key === 'chronobiology')?.score ?? null,
  })

  const score = rawScore != null && pkModulation.cap != null
    ? Math.min(rawScore, pkModulation.cap)
    : rawScore

  const status = classifyDecisionStatus(score, pkModulation.level)
  const headline = decisionHeadline(status)
  const actions = buildActions(status, limiter)

  const latestRecovery = latestNonNull(recoverySeries, (point) => point.score)
  const latestCapacity = latestNonNull(capacitySeries, (point) => point.score)
  const latestChrono = latestNonNull(chronobiologySeries, (point) => point.score)

  const completeness =
    [latestRecovery?.score, latestCapacity?.score, latestChrono?.score]
      .filter((value): value is number => value != null && Number.isFinite(value)).length / 3

  const confidence = weightedMean({
    recovery: latestRecovery ? latestRecovery.confidence * 100 : null,
    capacity: latestCapacity ? latestCapacity.confidence * 100 : null,
    chronobiology: latestChrono ? latestChrono.confidence * 100 : null,
  })

  const confidenceInfo = computePanoramaConfidence({
    snapshotsInRange: ordered,
    score,
    completeness,
    confidence: confidence != null ? confidence / 100 : 0,
    derivedFromInterpolated: Boolean(ordered.at(-1)?.interpolated || ordered.at(-1)?.forecasted),
  })

  const moodBridge = buildMoodBridge(ordered)
  const weeklyComparison = buildWeeklyComparison({
    recovery: recoverySeries,
    capacity: capacitySeries,
    chronobiology: chronobiologySeries,
  })

  return {
    decision: {
      score,
      rawScore,
      status,
      headline,
      limiter,
      limiterText: limiter ? LIMITER_LABEL[limiter] : null,
      contextLine: limiter
        ? `Principal limitante atual: ${LIMITER_LABEL[limiter]}.`
        : 'Sem limitante dominante claro na janela atual.',
      actions,
      confidencePct: confidence != null ? Math.round(confidence) : 0,
      confidenceLabel: confidenceInfo.label,
      confidenceDetail: confidenceInfo.detail,
      latestDate: latest?.date ?? null,
      pkModulation,
    },
    triad,
    moodBridge,
    pkBridge,
    weeklyComparison,
    socialJetLagHours: computeLatestSocialJetLag(ordered).hours,
    history,
  }
}

export function trendArrow(trend: TrendDirection): '↗' | '→' | '↘' {
  if (trend === 'improving') return '↗'
  if (trend === 'worsening') return '↘'
  return '→'
}

export function formatMoodAverage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--'
  return value.toFixed(2).replace('.', ',')
}
