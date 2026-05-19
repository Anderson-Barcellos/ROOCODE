import type { DailySnapshot } from '../types/apple-health'
import { mean } from './date'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type MovementEfficiencyComponentKey =
  | 'walkingAsymmetry'
  | 'doubleSupport'
  | 'walkingSpeed'
  | 'stepLength'
  | 'groundContact'

export interface MovementEfficiencyComponent {
  key: MovementEfficiencyComponentKey
  label: string
  value: number | null
  unit: string
  score: number | null
  baseWeight: number
  activeWeight: number
  note: string
}

export interface MovementEfficiencyResult {
  score: number | null
  confidence: number
  readiness: 'robust' | 'exploratory' | 'collecting'
  readinessStatus: 'standby' | 'collecting' | 'exploratory' | 'robust'
  components: MovementEfficiencyComponent[]
  inputsUsed: number
  gaitDays: number
  persistentAsymmetryAlert: boolean
  lowSpeedAlert: boolean
  verdict: string
  reason: 'ok' | 'inputs_missing' | 'insufficient_readiness'
  evidence: IndexEvidenceReport
}

const WEIGHTS: Record<MovementEfficiencyComponentKey, number> = {
  walkingAsymmetry: 0.35,
  doubleSupport: 0.25,
  walkingSpeed: 0.2,
  stepLength: 0.15,
  groundContact: 0.05,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function scale(value: number, low: number, high: number, lowScore = 20, highScore = 95): number {
  const ratio = clamp((value - low) / (high - low), 0, 1)
  return lowScore + ratio * (highScore - lowScore)
}

function inverseScale(value: number, low: number, high: number, highScore = 95, lowScore = 20): number {
  const ratio = clamp((value - low) / (high - low), 0, 1)
  return highScore - ratio * (highScore - lowScore)
}

function component(
  key: MovementEfficiencyComponentKey,
  label: string,
  value: number | null,
  unit: string,
  score: number | null,
  note: string,
): MovementEfficiencyComponent {
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

export function computeMovementEfficiency(
  snapshots: ReadonlyArray<DailySnapshot>,
): MovementEfficiencyResult {
  const readinessGate = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.movementEfficiencyIndex,
    'MovementEfficiency',
  )
  const real = snapshots.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted && snapshot.health)
  const gaitDays = real.filter((snapshot) =>
    snapshot.health?.walkingSpeedKmh != null ||
    snapshot.health?.walkingAsymmetryPct != null ||
    snapshot.health?.walkingStepLengthCm != null,
  ).length
  const latest = [...real].reverse().find((snapshot) =>
    snapshot.health?.walkingSpeedKmh != null ||
    snapshot.health?.walkingAsymmetryPct != null ||
    snapshot.health?.walkingStepLengthCm != null ||
    snapshot.health?.walkingDoubleSupportPct != null,
  )

  const h = latest?.health ?? null
  const components = [
    component(
      'walkingAsymmetry',
      'Assimetria',
      h?.walkingAsymmetryPct ?? null,
      '%',
      h?.walkingAsymmetryPct == null ? null : inverseScale(h.walkingAsymmetryPct, 1, 8),
      'sinal principal de risco',
    ),
    component(
      'doubleSupport',
      'Suporte duplo',
      h?.walkingDoubleSupportPct ?? null,
      '%',
      h?.walkingDoubleSupportPct == null ? null : inverseScale(h.walkingDoubleSupportPct, 20, 36),
      h?.walkingDoubleSupportPct == null ? 'aguardando coluna Apple' : 'proxy de estabilidade',
    ),
    component(
      'walkingSpeed',
      'Velocidade',
      h?.walkingSpeedKmh ?? null,
      'km/h',
      h?.walkingSpeedKmh == null ? null : scale(h.walkingSpeedKmh, 3.4, 5.8),
      'vital sign motor',
    ),
    component(
      'stepLength',
      'Comprimento do passo',
      h?.walkingStepLengthCm ?? null,
      'cm',
      h?.walkingStepLengthCm == null ? null : scale(h.walkingStepLengthCm, 55, 88),
      'amplitude mecânica',
    ),
    component(
      'groundContact',
      'Contato no solo',
      h?.runningGroundContactTimeMs ?? null,
      'ms',
      h?.runningGroundContactTimeMs == null ? null : inverseScale(h.runningGroundContactTimeMs, 220, 340),
      h?.runningGroundContactTimeMs == null ? 'só aparece em corrida' : 'mecânica de corrida',
    ),
  ]

  const active = components.filter((item) => item.score != null)
  const totalWeight = active.reduce((sum, item) => sum + item.baseWeight, 0)
  const score = totalWeight > 0
    ? active.reduce((sum, item) => sum + (item.score ?? 0) * item.baseWeight, 0) / totalWeight
    : null
  const confidence = totalWeight

  const recent14 = real
    .filter((snapshot) => snapshot.health?.walkingAsymmetryPct != null || snapshot.health?.walkingSpeedKmh != null)
    .slice(-14)
  const asymMean14 = mean(recent14.map((snapshot) => snapshot.health?.walkingAsymmetryPct ?? null))
  const speedMean14 = mean(recent14.map((snapshot) => snapshot.health?.walkingSpeedKmh ?? null))
  const persistentAsymmetryAlert = recent14.length >= 14 && asymMean14 != null && asymMean14 > 5
  const lowSpeedAlert = recent14.length >= 14 && speedMean14 != null && speedMean14 < 3.6

  const readiness =
    gaitDays >= 21 && active.length >= 4
      ? 'robust'
      : gaitDays >= 10 && active.length >= 3
        ? 'exploratory'
        : 'collecting'
  const readinessStatus = readinessGate.status
  const eligible = readinessStatus !== 'standby'
  const gatedScore = eligible ? score : null

  const verdict =
    gatedScore == null
      ? 'Ainda faltam sinais de marcha para estimar eficiência motora.'
      : persistentAsymmetryAlert
        ? 'Assimetria persistente acima de 5% por janela suficiente; não diagnostica, mas merece acompanhamento neurológico/medicamentoso.'
        : lowSpeedAlert
          ? 'Velocidade média de marcha abaixo de 1,0 m/s de forma consistente; sinal de descondicionamento ou disfunção subclínica a acompanhar.'
          : gatedScore >= 75
            ? 'Mecânica de marcha preservada nos sinais disponíveis, sem alerta persistente de assimetria.'
            : gatedScore >= 55
              ? 'Mecânica intermediária: há sinal de eficiência menor, mas sem padrão persistente de alto risco.'
              : 'Eficiência de marcha baixa no período; observar tendência antes de inferir causa.'
  const usedKeys = active.map((item) => item.key)
  const missingKeys = components.filter((item) => item.score == null).map((item) => item.key)
  const baseConfidence = clamp(confidence, 0, 1)

  return {
    score: gatedScore,
    confidence: baseConfidence,
    readiness,
    readinessStatus,
    components,
    inputsUsed: active.length,
    gaitDays,
    persistentAsymmetryAlert,
    lowSpeedAlert,
    verdict,
    reason: gatedScore == null ? (eligible ? 'inputs_missing' : 'insufficient_readiness') : 'ok',
    evidence: buildIndexEvidenceReport({
      eligible: gatedScore != null,
      reason: gatedScore == null ? (eligible ? 'inputs_missing' : 'insufficient_readiness') : 'ok',
      inputsUsed: usedKeys,
      inputsMissing: missingKeys,
      proxiesUsed: [],
      usedInterpolated: false,
      confidencePenalty: baseConfidence,
      readiness: readinessStatus,
    }),
  }
}

export function formatMovementReadiness(result: MovementEfficiencyResult): string {
  if (result.readiness === 'robust') return `Robusto · ${result.gaitDays} dias`
  if (result.readiness === 'exploratory') return `Exploratório · ${result.gaitDays}/21 dias`
  return `Coletando · ${result.gaitDays}/10 dias`
}
