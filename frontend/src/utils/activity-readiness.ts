import type { DailyHealthMetrics, DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

type HealthKey = keyof Pick<
  DailyHealthMetrics,
  | 'steps'
  | 'activeEnergyKcal'
  | 'walkingSpeedKmh'
  | 'walkingStepLengthCm'
  | 'walkingAsymmetryPct'
  | 'physicalEffort'
>

export type ActivityReadinessClass = 'usar_energia' | 'ritmo_normal' | 'poupar'
export type ActivityReadinessTone = 'positive' | 'watch' | 'negative' | 'neutral'

export interface ActivityReadinessFactor {
  key: HealthKey
  label: string
  value: number | null
  baseline: number | null
  score: number | null
  tone: ActivityReadinessTone
  message: string
  unit: string
}

export interface ActivityReadinessResult {
  date: string | null
  score: number | null
  klass: ActivityReadinessClass | null
  headline: string
  summary: string
  confidence: number
  factors: ActivityReadinessFactor[]
  reason: 'ok' | 'insufficient_data' | 'insufficient_readiness'
  evidence: IndexEvidenceReport
}

interface FactorDefinition {
  key: HealthKey
  label: string
  unit: string
  weight: number
}

const FACTORS: FactorDefinition[] = [
  { key: 'steps', label: 'Passos', unit: 'passos', weight: 0.25 },
  { key: 'activeEnergyKcal', label: 'Energia ativa', unit: 'kcal', weight: 0.15 },
  { key: 'walkingSpeedKmh', label: 'Velocidade de marcha', unit: 'km/h', weight: 0.2 },
  { key: 'walkingStepLengthCm', label: 'Comprimento do passo', unit: 'cm', weight: 0.15 },
  { key: 'walkingAsymmetryPct', label: 'Assimetria', unit: '%', weight: 0.15 },
  { key: 'physicalEffort', label: 'Esforço físico', unit: 'kcal/h·kg', weight: 0.1 },
]

function numeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(numeric)
  if (!valid.length) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function latestHealthSnapshot(snapshots: DailySnapshot[]): DailySnapshot | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index]
    if (snapshot.health && !snapshot.forecasted) return snapshot
  }
  return null
}

function buildBaseline(snapshots: DailySnapshot[], latestDate: string): Partial<Record<HealthKey, number | null>> {
  const prior = snapshots
    .filter((snapshot) => snapshot.date < latestDate && snapshot.health && !snapshot.interpolated && !snapshot.forecasted)
    .slice(-30)

  return Object.fromEntries(
    FACTORS.map((factor) => [factor.key, mean(prior.map((snapshot) => snapshot.health?.[factor.key] ?? null))]),
  ) as Partial<Record<HealthKey, number | null>>
}

function scoreAgainstBaseline(value: number, baseline: number | null): number | null {
  if (baseline == null || baseline <= 0) return null
  const ratio = value / baseline
  if (ratio >= 0.95) return 90
  if (ratio >= 0.8) return 75
  if (ratio >= 0.65) return 55
  if (ratio >= 0.5) return 35
  return 20
}

/**
 * Score de assimetria de marcha com baseline pessoal quando disponível.
 *
 * Antes da auditoria 2026-05-15 era 100% absoluto (≤3% = 90, ≤5% = 70, ...).
 * Inconsistente com os outros fatores do mesmo card que usam baseline 30d.
 * Para alguém com assimetria habitual de 7%, o score fixo 45 sempre aparecia
 * como "negativo" sem contexto.
 *
 * Agora: se há baseline pessoal, comparamos por ratio (valor/baseline) — mais
 * que 25% acima do habitual = piora real. Sem baseline (primeiros dias), fallback
 * absoluto pra preservar o sinal mínimo.
 */
function scoreAsymmetry(value: number, baseline: number | null): number {
  if (baseline == null || baseline <= 0) {
    if (value <= 3) return 90
    if (value <= 5) return 70
    if (value <= 8) return 45
    return 20
  }
  const ratio = value / baseline
  if (ratio <= 0.85) return 95   // melhor que habitual
  if (ratio <= 1.05) return 85   // próximo do habitual
  if (ratio <= 1.25) return 60   // levemente pior
  if (ratio <= 1.5) return 40    // pior
  return 25                      // muito pior que habitual
}

function scorePhysicalEffort(value: number, baseline: number | null, steps: number | null, stepsBaseline: number | null): number | null {
  if (baseline == null || baseline <= 0) return null
  const effortRatio = value / baseline
  const stepsRatio = steps != null && stepsBaseline != null && stepsBaseline > 0 ? steps / stepsBaseline : null
  if (effortRatio >= 1.25 && (stepsRatio == null || stepsRatio < 0.85)) return 45
  if (effortRatio >= 1.45) return 55
  if (effortRatio >= 0.8 && effortRatio <= 1.25) return 85
  return 70
}

function toneForScore(score: number | null): ActivityReadinessTone {
  if (score == null) return 'neutral'
  if (score >= 75) return 'positive'
  if (score >= 55) return 'watch'
  return 'negative'
}

function messageForFactor(factor: FactorDefinition, score: number | null): string {
  if (score == null) return 'sem baseline pessoal suficiente'
  if (factor.key === 'physicalEffort' && score < 55) return 'esforço alto para pouco deslocamento'
  if (factor.key === 'walkingAsymmetryPct' && score < 55) return 'assimetria de marcha acima do habitual'
  if (score >= 75) return 'preservado vs baseline pessoal'
  if (score >= 55) return 'queda leve vs baseline pessoal'
  return 'queda relevante vs baseline pessoal'
}

function classify(score: number): ActivityReadinessClass {
  if (score >= 75) return 'usar_energia'
  if (score >= 55) return 'ritmo_normal'
  return 'poupar'
}

const CLASS_TEXT: Record<ActivityReadinessClass, { headline: string; summary: string }> = {
  usar_energia: {
    headline: 'Energia locomotora preservada',
    summary: 'Bom dia para usar energia: volume, marcha ou esforço estão próximos do teu baseline recente.',
  },
  ritmo_normal: {
    headline: 'Ritmo normal, sem forçar demais',
    summary: 'Há sinal intermediário: dá para manter rotina, mas vale evitar extrapolar se sono/PK também estiverem ruins.',
  },
  poupar: {
    headline: 'Dia para poupar energia',
    summary: 'O padrão de movimento sugere baixa prontidão: reduzir carga física/cognitiva pode proteger recuperação.',
  },
}

export function computeActivityReadiness(
  snapshots: DailySnapshot[],
  baselineSnapshots: DailySnapshot[] = snapshots,
): ActivityReadinessResult {
  const readiness = evaluateReadiness(
    snapshots,
    CHART_REQUIREMENTS.activityReadinessIndex,
    'ActivityReadiness',
  )
  const latest = latestHealthSnapshot(snapshots)
  if (!latest?.health) {
    return {
      date: null,
      score: null,
      klass: null,
      headline: 'Sem dados de atividade no período',
      summary: 'Precisa de métricas de movimento para estimar prontidão locomotora.',
      confidence: 0,
      factors: [],
      reason: 'insufficient_data',
      evidence: buildIndexEvidenceReport({
        eligible: false,
        reason: 'inputs_missing',
        inputsUsed: [],
        inputsMissing: FACTORS.map((factor) => factor.key),
        proxiesUsed: [],
        usedInterpolated: false,
        confidencePenalty: 0,
        readiness: readiness.status,
      }),
    }
  }

  const baseline = buildBaseline(baselineSnapshots, latest.date)
  const health = latest.health
  const steps = health.steps
  const stepsBaseline = baseline.steps ?? null

  const factors = FACTORS.map((factor): ActivityReadinessFactor => {
    const value = health[factor.key]
    const baselineValue = baseline[factor.key] ?? null
    let score: number | null = null

    if (numeric(value)) {
      if (factor.key === 'walkingAsymmetryPct') {
        score = scoreAsymmetry(value, baselineValue)
      } else if (factor.key === 'physicalEffort') {
        score = scorePhysicalEffort(value, baselineValue, steps, stepsBaseline)
      } else {
        score = scoreAgainstBaseline(value, baselineValue)
      }
    }

    return {
      key: factor.key,
      label: factor.label,
      unit: factor.unit,
      value: numeric(value) ? value : null,
      baseline: baselineValue,
      score,
      tone: toneForScore(score),
      message: messageForFactor(factor, score),
    }
  })

  const scored = factors
    .map((factor) => {
      const def = FACTORS.find((candidate) => candidate.key === factor.key)!
      return factor.score == null ? null : { score: factor.score, weight: def.weight }
    })
    .filter((entry): entry is { score: number; weight: number } => entry != null)

  if (scored.length < 3) {
    return {
      date: latest.date,
      score: null,
      klass: null,
      headline: 'Baseline de atividade em formação',
      summary: 'Precisa de pelo menos 3 sinais com baseline recente para sugerir usar energia ou poupar.',
      confidence: latest.interpolated ? 0.4 : 0.6,
      factors,
      reason: 'insufficient_data',
      evidence: buildIndexEvidenceReport({
        eligible: false,
        reason: 'inputs_missing',
        inputsUsed: factors.filter((factor) => factor.score != null).map((factor) => factor.key),
        inputsMissing: FACTORS.filter((factor) => {
          const match = factors.find((item) => item.key === factor.key)
          return !match || match.score == null
        }).map((factor) => factor.key),
        proxiesUsed: [],
        usedInterpolated: !!latest.interpolated,
        confidencePenalty: latest.interpolated ? 0.4 : 0.6,
        readiness: readiness.status,
      }),
    }
  }

  const weightSum = scored.reduce((sum, entry) => sum + entry.weight, 0)
  const score = scored.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / weightSum
  const eligible = readiness.status !== 'standby'
  const klass = classify(score)
  const text = CLASS_TEXT[klass]
  const usedKeys = factors.filter((factor) => factor.score != null).map((factor) => factor.key)
  const missingKeys = factors.filter((factor) => factor.score == null).map((factor) => factor.key)

  return {
    date: latest.date,
    score: eligible ? score : null,
    klass: eligible ? klass : null,
    headline: text.headline,
    summary: text.summary,
    confidence: latest.interpolated ? 0.7 : 1,
    factors,
    reason: eligible ? 'ok' : 'insufficient_readiness',
    evidence: buildIndexEvidenceReport({
      eligible,
      reason: eligible ? 'ok' : 'insufficient_readiness',
      inputsUsed: usedKeys,
      inputsMissing: missingKeys,
      proxiesUsed: [],
      usedInterpolated: !!latest.interpolated,
      confidencePenalty: latest.interpolated ? 0.7 : 1,
      readiness: readiness.status,
    }),
  }
}
