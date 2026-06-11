/**
 * HeatmapCell — célula reusável de heatmap de correlação.
 *
 * Originalmente embedada em pk-humor-correlation.tsx; extraída pra permitir
 * reuso em pk-variability-heatmap.tsx (mesmo padrão visual).
 *
 * Convenção de cor:
 *   - r positivo → teal (concentração ↑ → métrica ↑)
 *   - r negativo → red (concentração ↑ → métrica ↓)
 *   - intensidade ∝ |r|
 *
 * Marcadores:
 *   - ★ amarelo se q < threshold (default 0.05) — significância pós-FDR
 *   - borda âmbar se isPeak (célula de pico da linha)
 *   - opacidade reduzida se isControl (lag negativo etc.)
 *
 * Helpers de formatação ficam em heatmap-helpers.ts pra atender ao
 * react-refresh/only-export-components.
 */

import { formatCi, formatP, formatR, heatmapColorForR } from './heatmap-helpers'

export interface HeatmapCellEstimate {
  r: number
  n: number
  p?: number | null
  qFdr?: number | null
  ciLower?: number | null
  ciUpper?: number | null
}

export interface HeatmapCellProps {
  estimate: HeatmapCellEstimate | null
  label?: string
  isPeak?: boolean
  isControl?: boolean
  tone?: 'default' | 'watch' | 'noise'
  selected?: boolean
  onSelect?: () => void
  significanceThreshold?: number
  muteNonSignificant?: boolean
}

export function HeatmapCell({
  estimate,
  label,
  isPeak = false,
  isControl = false,
  tone = 'default',
  selected = false,
  onSelect,
  significanceThreshold = 0.05,
  muteNonSignificant = false,
}: HeatmapCellProps) {
  if (!estimate) {
    return (
      <div
        className={`h-12 rounded-md border border-slate-100 bg-slate-50/50 ${
          isControl ? 'opacity-60' : ''
        }`}
      />
    )
  }
  const significant =
    estimate.qFdr != null && Number.isFinite(estimate.qFdr) && estimate.qFdr < significanceThreshold
  const effectiveMute = muteNonSignificant || tone === 'noise'
  const backgroundColor =
    effectiveMute && !significant
      ? 'rgba(226, 232, 240, 0.75)'
      : heatmapColorForR(estimate.r)
  const tooltip =
    `r ${formatR(estimate.r)} · IC95% ${formatCi(estimate.ciLower, estimate.ciUpper)}` +
    ` · p ${formatP(estimate.p)} · q ${formatP(estimate.qFdr)} · n ${estimate.n}`
  const className = `relative flex h-12 items-center justify-center rounded-md border text-xs font-mono ${
    isPeak ? 'border-2 border-amber-500' : 'border-slate-200'
  } ${isControl ? 'opacity-70' : ''} ${
    selected ? 'ring-2 ring-slate-900/35 ring-offset-1' : ''
  } ${
    tone === 'watch' ? 'opacity-90' : tone === 'noise' ? 'opacity-70' : ''
  }`
  const content = (
    <>
      {estimate.r > 0.05 && (
        <span className="absolute left-0.5 top-0.5 text-[0.55rem] text-teal-700 dark:text-teal-300">↑</span>
      )}
      {estimate.r < -0.05 && (
        <span className="absolute left-0.5 top-0.5 text-[0.55rem] text-red-500">↓</span>
      )}
      <span className="text-slate-900 mix-blend-luminosity">{formatR(estimate.r)}</span>
      {significant && <span className="absolute right-0.5 top-0.5 text-amber-600 dark:text-amber-300">★</span>}
    </>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        title={tooltip}
        aria-label={label ? `${label}: ${tooltip}` : tooltip}
        aria-pressed={selected}
        onClick={onSelect}
        className={`${className} cursor-pointer transition hover:ring-2 hover:ring-slate-900/20 hover:ring-offset-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-1`}
        style={{ background: backgroundColor }}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      title={tooltip}
      className={className}
      style={{ background: backgroundColor }}
    >
      {content}
    </div>
  )
}
