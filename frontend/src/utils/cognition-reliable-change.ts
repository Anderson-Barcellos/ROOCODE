/**
 * Régua de mudança confiável da Cognição — híbrido SPC + RCI.
 *
 * Sobre as ~14 sessões de baseline (`baseline_phase === true`), deriva a banda
 * de controle individual (média ± 2σ/3σ — usa a própria variância do sujeito) e
 * o Reliable Change Index de Jacobson-Truax (número canônico, com r_xx de
 * literatura). Cada sessão pós-baseline é classificada contra essa régua, e a
 * flag de desacoplamento responde à hipótese central do módulo: a cognição
 * mudou sem o humor acompanhar (ou vice-versa)?
 *
 * Lógica PURA — calculada no frontend sobre o `timeline` de `/cognition/status`
 * (cada row já traz `baseline_phase`). Subsistema isolado: a proveniência fica
 * aqui, não na matriz central `index-evidence.ts`.
 *
 * Decisões batidas (2026-06-18): rotativos (fluência/leitura/flanker) ficam fora
 * — n≈4-5 no baseline é frágil demais pra σ confiável.
 */
import type { CognitiveSessionChartRow } from '../types/cognition'
import { computeRollingBaseline, type PersonalBaseline } from './personal-baselines'
import type { MetricPolarity } from './statistics'

export type ReliableMetricKey =
  | 'pvt_lapses'
  | 'pvt_response_speed'
  | 'pvt_median_rt_ms'
  | 'span_primary'
  | 'mood'
  | 'energy'
  | 'anxiety'

/** Polaridade por eixo — hoje só vivia em comentários inline; aqui vira mapa único. */
export const COGNITIVE_POLARITY: Record<ReliableMetricKey, MetricPolarity> = {
  pvt_lapses: 'lower-is-better',
  pvt_response_speed: 'higher-is-better',
  pvt_median_rt_ms: 'lower-is-better',
  span_primary: 'higher-is-better',
  mood: 'higher-is-better',
  energy: 'higher-is-better',
  anxiety: 'lower-is-better',
}

/**
 * Confiabilidade test-retest (r_xx) de literatura — RATIFICÁVEL pelo Anders.
 * PVT tem confiabilidade alta (~0.8); span e VAS de humor são moderados (~0.7).
 * Valores conservadores; ajustar conforme norma adotada.
 */
export const COGNITIVE_RELIABILITY: Record<ReliableMetricKey, number> = {
  pvt_lapses: 0.8,
  pvt_response_speed: 0.8,
  pvt_median_rt_ms: 0.8,
  span_primary: 0.7,
  mood: 0.7,
  energy: 0.7,
  anxiety: 0.7,
}

/** Eixos que compõem cada lado da hipótese de desacoplamento. */
export const COGNITION_AXIS_KEYS: ReliableMetricKey[] = [
  'pvt_lapses',
  'pvt_response_speed',
  'span_primary',
]
export const MOOD_AXIS_KEYS: ReliableMetricKey[] = ['mood', 'energy', 'anxiety']

export interface SpcBands {
  warnLow: number
  warnHigh: number
  signalLow: number
  signalHigh: number
}

export type ChangeBand = 'within' | 'warn' | 'signal'
export type ChangeDirection = 'improve' | 'worsen' | 'none'

export interface ChangeClassification {
  rci: number
  reliable: boolean
  band: ChangeBand
  direction: ChangeDirection
}

const RCI_THRESHOLD = 1.96

/** Média + SD amostral (n-1) das sessões de baseline para uma métrica. */
export function computeBaselineStats(
  rows: ReadonlyArray<CognitiveSessionChartRow>,
  key: ReliableMetricKey,
  minPoints = 14,
): PersonalBaseline | null {
  const values = rows.filter((row) => row.baseline_phase).map((row) => row[key])
  return computeRollingBaseline(values, { minPoints, windowSize: 9999 })
}

/** Banda de controle: média ± 2σ (alerta) e ± 3σ (sinal). */
export function spcBands(stats: PersonalBaseline): SpcBands {
  return {
    warnLow: stats.mean - 2 * stats.sd,
    warnHigh: stats.mean + 2 * stats.sd,
    signalLow: stats.mean - 3 * stats.sd,
    signalHigh: stats.mean + 3 * stats.sd,
  }
}

/** RCI Jacobson-Truax: (x − μ) / (σ·√(2·(1 − r_xx))). Degenera a 0 se σ=0. */
export function reliableChangeIndex(value: number, stats: PersonalBaseline, rxx: number): number {
  const seDiff = stats.sd * Math.sqrt(2 * (1 - rxx))
  if (!(seDiff > 0)) return 0
  return (value - stats.mean) / seDiff
}

/** Classifica uma sessão contra a régua: banda SPC + RCI + direção pela polaridade. */
export function classifyChange(
  value: number | null,
  stats: PersonalBaseline,
  rxx: number,
  polarity: MetricPolarity,
): ChangeClassification | null {
  if (value == null || !Number.isFinite(value)) return null

  const rci = reliableChangeIndex(value, stats, rxx)
  const reliable = Math.abs(rci) >= RCI_THRESHOLD
  const bands = spcBands(stats)

  let band: ChangeBand = 'within'
  if (value <= bands.signalLow || value >= bands.signalHigh) band = 'signal'
  else if (value <= bands.warnLow || value >= bands.warnHigh) band = 'warn'

  let direction: ChangeDirection = 'none'
  if (band !== 'within' || reliable) {
    const higherThanBaseline = value > stats.mean
    const goodWhenHigher = polarity === 'higher-is-better'
    direction = higherThanBaseline === goodWhenHigher ? 'improve' : 'worsen'
  }

  return { rci, reliable, band, direction }
}

export interface SessionDecouplingFlags {
  id: string
  date: string
  cognitionMoved: boolean
  moodMoved: boolean
  decoupled: boolean
}

export interface DecouplingResult {
  perSession: SessionDecouplingFlags[]
  decoupledCount: number
  evaluatedCount: number
}

function groupMoved(
  row: CognitiveSessionChartRow,
  keys: ReliableMetricKey[],
  statsByKey: Partial<Record<ReliableMetricKey, PersonalBaseline>>,
): boolean {
  return keys.some((key) => {
    const stats = statsByKey[key]
    if (!stats) return false
    const change = classifyChange(row[key], stats, COGNITIVE_RELIABILITY[key], COGNITIVE_POLARITY[key])
    return change != null && (change.reliable || change.band !== 'within')
  })
}

/**
 * Por sessão pós-baseline: a cognição cruzou a régua mas o humor não (ou
 * vice-versa)? Testa direto o desacoplamento humor×cognição.
 */
export function detectDecoupling(rows: ReadonlyArray<CognitiveSessionChartRow>): DecouplingResult {
  const allKeys = [...COGNITION_AXIS_KEYS, ...MOOD_AXIS_KEYS]
  const statsByKey: Partial<Record<ReliableMetricKey, PersonalBaseline>> = {}
  for (const key of allKeys) {
    const stats = computeBaselineStats(rows, key)
    if (stats) statsByKey[key] = stats
  }

  const perSession: SessionDecouplingFlags[] = []
  for (const row of rows) {
    if (row.baseline_phase) continue
    const cognitionMoved = groupMoved(row, COGNITION_AXIS_KEYS, statsByKey)
    const moodMoved = groupMoved(row, MOOD_AXIS_KEYS, statsByKey)
    perSession.push({
      id: row.id,
      date: row.date,
      cognitionMoved,
      moodMoved,
      decoupled: cognitionMoved !== moodMoved,
    })
  }

  return {
    perSession,
    decoupledCount: perSession.filter((session) => session.decoupled).length,
    evaluatedCount: perSession.length,
  }
}
