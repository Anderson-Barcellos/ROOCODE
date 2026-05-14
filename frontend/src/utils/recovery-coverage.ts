/**
 * Recovery Score coverage — fonte única do badge + texto descritivo do chart
 * (BACKLOG #29 / RECOVERY-001, 2026-05-14).
 *
 * Antes existiam dois motores divergentes:
 *   • Texto inline no `recovery-score-chart` contava 5/5 inputs (via
 *     `coverageSummary`).
 *   • Badge `<DataReadinessGate>` consultava só `hrvSdnn`.
 * Resultado: "4/35 completos" coexistia com "Robusto · 29/35 válidos".
 *
 * Este módulo centraliza o cálculo: recebe a série Recovery Score já
 * computada e devolve a contagem + badge derivado de uma única regra.
 */

import type { RecoveryScorePoint } from './recovery-score'

export type RecoveryCoverageBadge = 'robusto' | 'aceitavel' | 'preliminar' | 'insuficiente'

export interface RecoveryCoverage {
  totalDays: number
  /** Dias com score != null e completeness === 1 (5/5 inputs reais). */
  completeDays: number
  /** Dias com score != null (qualquer ≥3/5 inputs, incl. interpolados). */
  validDays: number
  /** Dias com score != null mas completeness < 1. */
  partialDays: number
  /** Dias derivados de interpolação/forecast (subset de validDays). */
  interpolatedDays: number
  /** Dias sem baseline pessoal HRV/RHR formada. */
  baselineMissingDays: number
  /** Dias com baseline mas < 3/5 inputs disponíveis. */
  inputsMissingDays: number
  /** Fração `completeDays / totalDays` (0..1). */
  completeRatio: number
  badge: RecoveryCoverageBadge
}

const BADGE_THRESHOLDS: ReadonlyArray<{ min: number; badge: RecoveryCoverageBadge }> = [
  { min: 0.8, badge: 'robusto' },
  { min: 0.5, badge: 'aceitavel' },
  { min: 0.2, badge: 'preliminar' },
  { min: 0, badge: 'insuficiente' },
]

function classifyBadge(ratio: number): RecoveryCoverageBadge {
  for (const t of BADGE_THRESHOLDS) {
    if (ratio >= t.min) return t.badge
  }
  return 'insuficiente'
}

export function computeRecoveryCoverage(
  series: ReadonlyArray<RecoveryScorePoint>,
): RecoveryCoverage {
  let completeDays = 0
  let validDays = 0
  let partialDays = 0
  let interpolatedDays = 0
  let baselineMissingDays = 0
  let inputsMissingDays = 0

  for (const point of series) {
    if (point.reason === 'baseline_missing') baselineMissingDays += 1
    if (point.reason === 'inputs_missing') inputsMissingDays += 1
    if (point.score == null) continue
    validDays += 1
    if (point.derivedFromInterpolated) interpolatedDays += 1
    if (point.completeness >= 1) {
      completeDays += 1
    } else {
      partialDays += 1
    }
  }

  const totalDays = series.length
  const completeRatio = totalDays > 0 ? completeDays / totalDays : 0
  const badge = classifyBadge(completeRatio)

  return {
    totalDays,
    completeDays,
    validDays,
    partialDays,
    interpolatedDays,
    baselineMissingDays,
    inputsMissingDays,
    completeRatio,
    badge,
  }
}

const BADGE_LABEL: Record<RecoveryCoverageBadge, string> = {
  robusto: 'Robusto',
  aceitavel: 'Aceitável',
  preliminar: 'Preliminar',
  insuficiente: 'Insuficiente',
}

const BADGE_COLOR: Record<RecoveryCoverageBadge, { bg: string; text: string }> = {
  robusto: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  aceitavel: { bg: 'bg-sky-50', text: 'text-sky-700' },
  preliminar: { bg: 'bg-amber-50', text: 'text-amber-700' },
  insuficiente: { bg: 'bg-slate-50', text: 'text-slate-600' },
}

export function badgeLabel(badge: RecoveryCoverageBadge): string {
  return BADGE_LABEL[badge]
}

export function badgeColor(badge: RecoveryCoverageBadge): { bg: string; text: string } {
  return BADGE_COLOR[badge]
}
