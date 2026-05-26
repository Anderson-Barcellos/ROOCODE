import { useEffect, useRef } from 'react'
import { brushX, scaleLinear, select, type D3BrushEvent } from 'd3'

/**
 * Brush horizontal D3 montado sobre Recharts.
 *
 * Estratégia: overlay SVG absolutamente posicionado sobre o ResponsiveContainer
 * do Recharts. O D3 captura drag, mas o chart Recharts continua respondendo
 * a hover (zIndex maior). O consumidor mantém o estado de seleção e filtra
 * `data` antes de passar ao chart.
 */

export type BrushIndexSelection = [number, number] | null

interface ChartBrushOverlayProps {
  /** Largura total do container (do ResponsiveContainer render-prop). */
  width: number
  /** Altura do overlay; default 28px. */
  height?: number
  /** Margem esquerda do plot area do chart (alinha com o eixo). */
  marginLeft?: number
  /** Margem direita do plot area. */
  marginRight?: number
  /** Quantidade de pontos no dataset (define o domínio do scale). */
  dataLength: number
  /** Seleção atual em índices [start, end]. `null` = sem seleção. */
  selection: BrushIndexSelection
  /** Callback disparado ao soltar o brush. */
  onChange: (selection: BrushIndexSelection) => void
  /** Posição vertical em relação ao container pai. Default: 'bottom'. */
  position?: 'top' | 'bottom'
  /** Estilo extra opcional. */
  className?: string
}

const DEFAULT_HEIGHT = 28
const DEFAULT_MARGIN_LEFT = 0
const DEFAULT_MARGIN_RIGHT = 0
const TRACK_FILL = 'rgba(15, 118, 110, 0.05)'
const SELECTION_FILL = 'rgba(15, 118, 110, 0.18)'
const HANDLE_FILL = '#0f766e'

export function ChartBrushOverlay({
  width,
  height = DEFAULT_HEIGHT,
  marginLeft = DEFAULT_MARGIN_LEFT,
  marginRight = DEFAULT_MARGIN_RIGHT,
  dataLength,
  selection,
  onChange,
  position = 'bottom',
  className,
}: ChartBrushOverlayProps) {
  const gRef = useRef<SVGGElement | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const innerWidth = Math.max(0, width - marginLeft - marginRight)
  const hasUsableArea = innerWidth > 0 && height > 0 && dataLength > 1

  useEffect(() => {
    if (!hasUsableArea || !gRef.current) return

    const xScale = scaleLinear().domain([0, dataLength - 1]).range([0, innerWidth])

    const brush = brushX<unknown>()
      .extent([[0, 0], [innerWidth, height]])
      .on('end', (event: D3BrushEvent<unknown>) => {
        if (!event.sourceEvent) return
        if (!event.selection) {
          onChangeRef.current(null)
          return
        }
        const [x0, x1] = event.selection as [number, number]
        const i0 = Math.max(0, Math.round(xScale.invert(x0)))
        const i1 = Math.min(dataLength - 1, Math.round(xScale.invert(x1)))
        if (i1 - i0 < 1) {
          onChangeRef.current(null)
          return
        }
        onChangeRef.current([i0, i1])
      })

    const g = select(gRef.current)
    g.call(brush)

    if (selection) {
      const [i0, i1] = selection
      g.call(brush.move, [xScale(i0), xScale(i1)])
    } else {
      g.call(brush.move, null)
    }

    g.selectAll('.selection')
      .attr('fill', SELECTION_FILL)
      .attr('stroke', 'none')
    g.selectAll('.handle')
      .attr('fill', HANDLE_FILL)
      .attr('opacity', 0.7)
    g.selectAll('.overlay').attr('fill', TRACK_FILL).attr('cursor', 'crosshair')

    return () => {
      g.on('.brush', null)
      g.selectAll('*').remove()
    }
  }, [hasUsableArea, innerWidth, height, dataLength, selection])

  if (!hasUsableArea) return null

  const top = position === 'bottom' ? 'auto' : 0
  const bottom = position === 'bottom' ? 0 : 'auto'

  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ position: 'absolute', left: 0, top, bottom, pointerEvents: 'auto' }}
      aria-hidden="true"
    >
      <g ref={gRef} transform={`translate(${marginLeft}, 0)`} />
    </svg>
  )
}

