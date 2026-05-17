import type { DailySnapshot } from '@/types/apple-health'

export type PanoramaConfidenceTier = 'robusta' | 'parcial' | 'baixa'

export interface PanoramaConfidence {
  tier: PanoramaConfidenceTier
  label: string
  detail: string
  className: string
}

export interface PanoramaCoverageSummary {
  realDays: number
  totalDays: number
  coveragePct: number
  label: string
  detail: string
}

type PanoramaSnapshotLike = Pick<DailySnapshot, 'date' | 'interpolated' | 'forecasted'>

function pluralizeDay(count: number, singularAdjective: string, pluralAdjective: string): string {
  return `${count} ${count === 1 ? `dia ${singularAdjective}` : `dias ${pluralAdjective}`}`
}

function buildInterpolationDetail(interpolatedDays: number): string {
  return interpolatedDays === 1
    ? '1 dia interpolado na janela'
    : `${interpolatedDays} dias interpolados na janela`
}

export function computePanoramaCoverage(
  snapshotsInRange: ReadonlyArray<PanoramaSnapshotLike>,
): PanoramaCoverageSummary {
  const totalDays = snapshotsInRange.length
  const realDays = snapshotsInRange.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted).length
  const coveragePct = totalDays > 0 ? Math.round((realDays / totalDays) * 100) : 0

  return {
    realDays,
    totalDays,
    coveragePct,
    label: pluralizeDay(realDays, 'real', 'reais'),
    detail: `${coveragePct}% da janela`,
  }
}

export function computePanoramaConfidence({
  snapshotsInRange,
  score,
  completeness,
  confidence,
  derivedFromInterpolated,
}: {
  snapshotsInRange: PanoramaSnapshotLike[]
  score: number | null
  completeness: number
  confidence: number
  derivedFromInterpolated: boolean
}): PanoramaConfidence {
  const coverage = computePanoramaCoverage(snapshotsInRange)
  const interpolatedDays = snapshotsInRange.filter((snapshot) => snapshot.interpolated).length
  const completenessPct = Math.round(completeness * 100)
  const confidencePct = Math.round(confidence * 100)
  const hasRelevantInterpolation = derivedFromInterpolated || interpolatedDays > 0

  const compactReason = () => {
    if (hasRelevantInterpolation) return buildInterpolationDetail(interpolatedDays || 1)
    if (score == null || coverage.realDays < 7) return coverage.label
    if (completeness < 0.8) return `${completenessPct}% dos inputs`
    if (confidence < 0.9) return `${confidencePct}% de confiança`
    return coverage.label
  }

  if (score == null || coverage.realDays < 3) {
    return {
      tier: 'baixa',
      label: 'Confiança baixa',
      detail: compactReason(),
      className: 'border-rose-200 bg-rose-50 text-rose-800',
    }
  }

  if (coverage.realDays < 7 || completeness < 0.8 || confidence < 0.9 || hasRelevantInterpolation) {
    return {
      tier: 'parcial',
      label: 'Confiança parcial',
      detail: compactReason(),
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }

  return {
    tier: 'robusta',
    label: 'Confiança robusta',
    detail: `${coverage.label} · sem interpolação`,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
}
