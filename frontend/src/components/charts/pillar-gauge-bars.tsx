import { useId } from 'react'

import { CHART_TOKENS } from './shared/chart-tokens'

/**
 * Substitui PanoramaSparkline com: (a) barra horizontal 0–100 com gauge
 * tricolor fixo (crítico / atenção / ótimo), (b) marcador thumb na posição
 * do valor atual, (c) mini-sparkline 7d em escala FIXA (sem normalização
 * local que mata magnitude absoluta), (d) tick lateral da média da janela.
 *
 * Suporta dois modos via `scale`:
 *  - `percent`: valores 0–100, zonas em 45 e 70.
 *  - `valence`: valores −1..+1 (mood), zonas em −0.3 e +0.3 (visual 35/65).
 */

export type PillarGaugeScale = 'percent' | 'valence'

interface PillarGaugeBarsProps {
  /** Série recente; até 7 pontos típicos. */
  values: number[]
  /** Valor atual destacado pelo thumb. `null` esconde o marcador. */
  currentValue: number | null
  /** Escala dos valores; default `percent`. */
  scale?: PillarGaugeScale
  /** Cor primária do thumb e do mini-spark; default teal-700. */
  accentColor?: string
  /** Marcador em borda tracejada quando valor atual é interpolado. */
  isInterpolated?: boolean
  /** Marcador em cor âmbar quando valor atual vem de forecast. */
  isForecast?: boolean
  /** Texto a11y descrevendo a métrica representada. */
  ariaLabel?: string
}

const ZONES_PERCENT = { low: 45, mid: 70 } as const
const ZONES_VALENCE = { low: 35, mid: 65 } as const

const ZONE_CRITICAL_FILL = '#ef4444' // red-500
const ZONE_ATTENTION_FILL = '#f59e0b' // amber-500

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function toVisualPct(value: number, scale: PillarGaugeScale): number {
  if (scale === 'valence') return clamp((value + 1) * 50, 0, 100)
  return clamp(value, 0, 100)
}

function zoneThresholds(scale: PillarGaugeScale) {
  return scale === 'valence' ? ZONES_VALENCE : ZONES_PERCENT
}

export function PillarGaugeBars({
  values,
  currentValue,
  scale = 'percent',
  accentColor = CHART_TOKENS.series.composite,
  isInterpolated = false,
  isForecast = false,
  ariaLabel,
}: PillarGaugeBarsProps) {
  const clipBase = useId()
  const clipId = `gauge-clip-${clipBase.replace(/:/g, '')}`

  const isEmpty = values.length === 0 && currentValue == null
  if (isEmpty) {
    return <div className="h-[40px] rounded-md border border-dashed border-slate-200 bg-slate-50/70" aria-label={ariaLabel} />
  }

  const { low, mid } = zoneThresholds(scale)

  const visualCurrent = currentValue != null ? toVisualPct(currentValue, scale) : null
  const recentMean = values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : null
  const visualMean = recentMean != null ? toVisualPct(recentMean, scale) : null

  const SPARK_TOP = 20
  const SPARK_BOTTOM = 38
  const SPARK_HEIGHT = SPARK_BOTTOM - SPARK_TOP

  const sparkPoints =
    values.length > 1
      ? values
          .map((v, i) => {
            const x = (i / (values.length - 1)) * 100
            const yNorm = toVisualPct(v, scale) / 100
            const y = SPARK_BOTTOM - yNorm * SPARK_HEIGHT
            return `${x.toFixed(2)},${y.toFixed(2)}`
          })
          .join(' ')
      : null

  const thumbFill = isForecast ? CHART_TOKENS.series.chronobiology : accentColor
  const thumbStrokeDash = isInterpolated ? '1.4 1.4' : undefined

  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="block h-[40px] w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="100" height="9" rx="2.5" />
        </clipPath>
      </defs>

      {/* gauge tricolor */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width={low} height="9" fill={ZONE_CRITICAL_FILL} opacity="0.18" />
        <rect x={low} y="0" width={mid - low} height="9" fill={ZONE_ATTENTION_FILL} opacity="0.18" />
        <rect x={mid} y="0" width={100 - mid} height="9" fill={accentColor} opacity="0.18" />
      </g>
      <rect
        x="0"
        y="0"
        width="100"
        height="9"
        rx="2.5"
        fill="none"
        stroke="rgba(17,35,30,0.10)"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />

      {/* tick da média da janela */}
      {visualMean != null && (
        <line
          x1={visualMean}
          x2={visualMean}
          y1="0"
          y2="10"
          stroke="rgba(17,35,30,0.42)"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* thumb marker do valor atual */}
      {visualCurrent != null && (
        <polygon
          points={`${visualCurrent - 2.6},13 ${visualCurrent + 2.6},13 ${visualCurrent},9`}
          fill={thumbFill}
          stroke="white"
          strokeWidth="0.6"
          strokeDasharray={thumbStrokeDash}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* mini-spark em escala FIXA (sem normalização local) */}
      {sparkPoints && (
        <polyline
          points={sparkPoints}
          fill="none"
          stroke={accentColor}
          strokeOpacity="0.85"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
