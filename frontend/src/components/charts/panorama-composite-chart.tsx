import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import { dayLabel } from '@/utils/aggregation'
import type { PanoramaHistoryPoint } from '@/utils/panorama-model'

import { CHART_PATTERNS, CHART_TOKENS, forecastPatternMarkup } from './shared/chart-tokens'
import { ChartBrushOverlay, type BrushIndexSelection } from './shared/useChartBrush'
import { ChartTooltip } from '@/components/charts/shared/ChartTooltip'

/**
 * Substitui PanoramaHistoryChart. Estado geral do Panorama com:
 *  - Área teal do composite (EMA já aplicada upstream)
 *  - Linha fina pontilhada do composite raw (volatilidade real)
 *  - Forecast (5d futuros) como Area com pattern diagonal + linha tracejada
 *  - Reference lines com label textual (zona ótima ≥70, atenção ≤45, média 30d)
 *  - Toggle mood overlay (valence em eixo Y secundário, escala -1..+1)
 *  - Brush D3 sincronizado via panoramaBrushRange (props controladas)
 */

export interface PanoramaBrushRange {
  startDate: string
  endDate: string
}

interface PanoramaCompositeChartProps {
  history: PanoramaHistoryPoint[]
  title: string
  brushRange: PanoramaBrushRange | null
  onBrushChange: (range: PanoramaBrushRange | null) => void
}

interface ChartRow {
  date: string
  label: string
  composite: number | null
  compositeRaw: number | null
  compositeForecast: number | null
  valence: number | null
  isInterpolated: boolean
  isForecast: boolean
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
  background: 'white',
  boxShadow: '0 18px 42px rgba(17,35,30,0.12)',
}

const CHART_HEIGHT = 280
const BRUSH_HEIGHT = 30
const PLOT_MARGIN_LEFT = 44
const PLOT_MARGIN_RIGHT = 18

function buildRows(history: PanoramaHistoryPoint[]): ChartRow[] {
  const lastRealIdx = (() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (!history[i].isForecast) return i
    }
    return -1
  })()

  return history.map((point, idx) => {
    const isForecast = point.isForecast === true
    const composite = isForecast ? null : point.composite
    // Para que a área de forecast "encoste" no último ponto real, repetimos esse valor
    // no índice de transição (lastRealIdx) na série de forecast.
    const compositeForecast = isForecast
      ? point.composite
      : idx === lastRealIdx
        ? point.composite
        : null
    return {
      date: point.date,
      label: dayLabel(point.date),
      composite,
      compositeRaw: isForecast ? null : (point.compositeRaw ?? null),
      compositeForecast,
      valence: point.valence ?? null,
      isInterpolated: point.isInterpolated === true,
      isForecast,
    }
  })
}

function computeMean30d(history: PanoramaHistoryPoint[]): number | null {
  const realScores = history
    .filter((p) => !p.isForecast && p.composite != null && Number.isFinite(p.composite))
    .slice(-30)
    .map((p) => p.composite as number)
  if (!realScores.length) return null
  return realScores.reduce((sum, v) => sum + v, 0) / realScores.length
}

function ForecastPatternDefs() {
  return (
    <defs dangerouslySetInnerHTML={{ __html: forecastPatternMarkup() }} />
  )
}

interface CompositeTooltipPayload {
  payload: ChartRow
  value: number
  name: string
  dataKey: string
}

interface CompositeTooltipProps {
  active?: boolean
  payload?: CompositeTooltipPayload[]
  showMood: boolean
}

function CompositeTooltip({ active, payload, showMood }: CompositeTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null

  const flagLabel = row.isForecast
    ? 'projeção'
    : row.isInterpolated
      ? 'interpolado'
      : 'real'

  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {row.label} · <span className="text-slate-400">{flagLabel}</span>
      </p>
      <div className="mt-1 space-y-0.5">
        {row.composite != null && (
          <p className="text-sm text-slate-800">
            Estado <span className="font-semibold">{row.composite.toFixed(0)}</span>/100
          </p>
        )}
        {row.compositeRaw != null && row.composite != null && Math.abs(row.compositeRaw - row.composite) > 0.5 && (
          <p className="text-xs text-slate-500">
            Bruto (sem EMA): {row.compositeRaw.toFixed(0)}
          </p>
        )}
        {row.compositeForecast != null && row.isForecast && (
          <p className="text-sm text-slate-800">
            Projeção <span className="font-semibold">{row.compositeForecast.toFixed(0)}</span>/100
          </p>
        )}
        {showMood && row.valence != null && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Humor: {row.valence > 0 ? '+' : ''}{row.valence.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  )
}

export function PanoramaCompositeChart({
  history,
  title,
  brushRange,
  onBrushChange,
}: PanoramaCompositeChartProps) {
  const [showMood, setShowMood] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const gradientBase = useId().replace(/:/g, '')
  const gradientId = `composite-gradient-${gradientBase}`

  const allRows = useMemo(() => buildRows(history), [history])
  const mean30d = useMemo(() => computeMean30d(history), [history])

  // Converte range de datas (compartilhado) → índices locais (brush)
  const indexSelection = useMemo<BrushIndexSelection>(() => {
    if (!brushRange) return null
    const startIdx = allRows.findIndex((r) => r.date >= brushRange.startDate)
    let endIdx = -1
    for (let i = allRows.length - 1; i >= 0; i -= 1) {
      if (allRows[i].date <= brushRange.endDate) {
        endIdx = i
        break
      }
    }
    if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return null
    return [startIdx, endIdx]
  }, [brushRange, allRows])

  const handleBrushChange = useCallback(
    (sel: BrushIndexSelection) => {
      if (!sel) {
        onBrushChange(null)
        return
      }
      const [i0, i1] = sel
      const startDate = allRows[i0]?.date
      const endDate = allRows[i1]?.date
      if (!startDate || !endDate) return
      onBrushChange({ startDate, endDate })
    },
    [allRows, onBrushChange],
  )

  // Dados visíveis (filtrados pelo brush)
  const visibleRows = useMemo(() => {
    if (!indexSelection) return allRows
    const [i0, i1] = indexSelection
    return allRows.slice(i0, i1 + 1)
  }, [allRows, indexSelection])

  const latestReal = useMemo(() => {
    for (let i = allRows.length - 1; i >= 0; i -= 1) {
      const r = allRows[i]
      if (!r.isForecast && r.composite != null) return r.composite
    }
    return null
  }, [allRows])

  // Cleanup do containerWidth quando desmonta evita stale state
  useEffect(() => {
    return () => setContainerWidth(0)
  }, [])

  const hasForecast = visibleRows.some((r) => r.isForecast)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Tendência longitudinal
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Composto com EMA e bruto sobrepostos. Use o brush abaixo para focar uma janela; outros gráficos do Panorama sincronizam automaticamente.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Último real</p>
          <p className="font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900">
            {latestReal != null ? latestReal.toFixed(0) : '--'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setShowMood((prev) => !prev)}
          className={`rounded-full border px-2.5 py-1 font-semibold ${showMood ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-600'}`}
        >
          {showMood ? 'Ocultar humor' : 'Sobrepor humor'}
        </button>
        {brushRange && (
          <button
            type="button"
            onClick={() => onBrushChange(null)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:border-slate-300"
          >
            Limpar seleção ({allRows.length > 0 && indexSelection ? `${indexSelection[1] - indexSelection[0] + 1} dias` : ''})
          </button>
        )}
      </div>

      <div className="relative mt-4" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
          initialDimension={{ width: 1, height: 1 }}
          onResize={(width) => setContainerWidth(width)}
        >
          <ComposedChart
            data={visibleRows}
            margin={{ top: 8, right: PLOT_MARGIN_RIGHT, bottom: 4, left: 0 }}
          >
            <Customized component={ForecastPatternDefs} />
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={CHART_TOKENS.series.composite} stopOpacity={0.32} />
                <stop offset="100%" stopColor={CHART_TOKENS.series.composite} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={CHART_TOKENS.ui.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              yAxisId="score"
              tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={[0, 100]}
            />
            {showMood && (
              <YAxis
                yAxisId="mood"
                orientation="right"
                tick={{ fill: CHART_TOKENS.series.mood, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
                domain={[-1, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
            )}

            <ChartTooltip content={<CompositeTooltip showMood={showMood} />} />

            <ReferenceLine
              yAxisId="score"
              y={CHART_TOKENS.zones.optimalThreshold}
              stroke={CHART_TOKENS.reference.optimalText}
              strokeDasharray="4 3"
              strokeWidth={1.1}
              label={{
                value: `zona ótima ≥${CHART_TOKENS.zones.optimalThreshold}`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: CHART_TOKENS.reference.optimalText,
              }}
            />
            <ReferenceLine
              yAxisId="score"
              y={CHART_TOKENS.zones.attentionThreshold}
              stroke={CHART_TOKENS.reference.attentionText}
              strokeDasharray="4 3"
              strokeWidth={1.1}
              label={{
                value: `atenção ≤${CHART_TOKENS.zones.attentionThreshold}`,
                position: 'insideBottomRight',
                fontSize: 10,
                fill: CHART_TOKENS.reference.attentionText,
              }}
            />
            {mean30d != null && (
              <ReferenceLine
                yAxisId="score"
                y={mean30d}
                stroke={CHART_TOKENS.reference.meanText}
                strokeDasharray="2 4"
                strokeWidth={1}
                label={{
                  value: `média 30d ${mean30d.toFixed(0)}`,
                  position: 'insideLeft',
                  fontSize: 10,
                  fill: CHART_TOKENS.reference.meanText,
                }}
              />
            )}

            {/* Forecast: área com pattern diagonal + linha tracejada */}
            {hasForecast && (
              <Area
                yAxisId="score"
                type="monotone"
                dataKey="compositeForecast"
                stroke={CHART_TOKENS.series.forecast}
                strokeWidth={1.4}
                strokeDasharray="4 4"
                fill={`url(#${CHART_PATTERNS.forecastDiagonalId})`}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}

            {/* Composto EMA: área principal */}
            <Area
              yAxisId="score"
              type="monotone"
              dataKey="composite"
              stroke={CHART_TOKENS.series.composite}
              strokeWidth={2.4}
              fill={`url(#${gradientId})`}
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* Composto raw: linha fina pontilhada (volatilidade) */}
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="compositeRaw"
              stroke={CHART_TOKENS.series.composite}
              strokeOpacity={0.35}
              strokeDasharray="2 3"
              strokeWidth={1}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* Mood overlay */}
            {showMood && (
              <Line
                yAxisId="mood"
                type="monotone"
                dataKey="valence"
                stroke={CHART_TOKENS.series.mood}
                strokeOpacity={0.85}
                strokeWidth={1.6}
                strokeDasharray="3 3"
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="relative mt-1" style={{ height: BRUSH_HEIGHT }}>
        <ChartBrushOverlay
          width={containerWidth}
          height={BRUSH_HEIGHT}
          marginLeft={PLOT_MARGIN_LEFT}
          marginRight={PLOT_MARGIN_RIGHT}
          dataLength={allRows.length}
          selection={indexSelection}
          onChange={handleBrushChange}
          position="top"
        />
      </div>
    </div>
  )
}
