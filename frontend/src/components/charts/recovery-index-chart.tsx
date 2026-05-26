import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import { calculateDayGapDays, dayLabel } from '@/utils/aggregation'
import { computeRecoveryIndexSeries, type RecoveryIndexPoint } from '@/utils/recovery-index'
import { computeSleepDebt } from '@/utils/sleep-debt'

import { CHART_TOKENS } from './shared/chart-tokens'
import { ChartBrushOverlay, type BrushIndexSelection } from './shared/useChartBrush'
import type { PanoramaBrushRange } from './panorama-composite-chart'

interface RecoveryIndexChartProps {
  snapshots: DailySnapshot[]
  title?: string
  /** Quando definido, filtra para a janela e renderiza brush sincronizado. */
  brushRange?: PanoramaBrushRange | null
  /** Callback chamado quando usuário arrasta o brush. */
  onBrushChange?: (range: PanoramaBrushRange | null) => void
  /** Sobrepõe linha de débito de sono 7d (horas) em eixo Y secundário. */
  showSleepDebt?: boolean
}

interface ChartRow {
  date: string
  label: string
  scoreReal: number | null
  scoreEstimated: number | null
  sleepDebt7d: number | null
  completeness: number
  confidence: number
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

function buildRows(
  points: RecoveryIndexPoint[],
  sleepDebtMap: Map<string, number | null>,
): ChartRow[] {
  const rows: ChartRow[] = points.map((point) => ({
    date: point.date,
    label: dayLabel(point.date),
    scoreReal: point.derivedFromInterpolated ? null : point.score,
    scoreEstimated: point.derivedFromInterpolated ? point.score : null,
    sleepDebt7d: sleepDebtMap.get(point.date) ?? null,
    completeness: point.completeness,
    confidence: point.confidence,
  }))

  if (rows.length < 2) return rows

  const withGaps: ChartRow[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index]
    withGaps.push(current)
    const next = rows[index + 1]
    if (!next) continue
    if (calculateDayGapDays(current.date, next.date) > 2) {
      withGaps.push({
        date: `${current.date}-gap`,
        label: '',
        scoreReal: null,
        scoreEstimated: null,
        sleepDebt7d: null,
        completeness: 0,
        confidence: 0,
      })
    }
  }

  return withGaps
}

function latestPoint(points: RecoveryIndexPoint[]): RecoveryIndexPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].score != null) return points[index]
  }
  return null
}

export function RecoveryIndexChart({
  snapshots,
  title = 'Recovery Index · 30 dias',
  brushRange = null,
  onBrushChange,
  showSleepDebt = false,
}: RecoveryIndexChartProps) {
  const [containerWidth, setContainerWidth] = useState(0)

  const series = useMemo(() => computeRecoveryIndexSeries(snapshots), [snapshots])
  const sleepDebtSeries = useMemo(
    () => (showSleepDebt ? computeSleepDebt(snapshots) : []),
    [snapshots, showSleepDebt],
  )
  const sleepDebtMap = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const p of sleepDebtSeries) map.set(p.date, p.debt_cumulative_7d)
    return map
  }, [sleepDebtSeries])

  const allRows = useMemo(() => buildRows(series, sleepDebtMap), [series, sleepDebtMap])
  const latest = useMemo(() => latestPoint(series), [series])

  const indexSelection = useMemo<BrushIndexSelection>(() => {
    if (!brushRange) return null
    const startIdx = allRows.findIndex((r) => r.date >= brushRange.startDate && !r.date.endsWith('-gap'))
    let endIdx = -1
    for (let i = allRows.length - 1; i >= 0; i -= 1) {
      if (!allRows[i].date.endsWith('-gap') && allRows[i].date <= brushRange.endDate) {
        endIdx = i
        break
      }
    }
    if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return null
    return [startIdx, endIdx]
  }, [brushRange, allRows])

  const handleBrushChange = useCallback(
    (sel: BrushIndexSelection) => {
      if (!onBrushChange) return
      if (!sel) {
        onBrushChange(null)
        return
      }
      const [i0, i1] = sel
      const startDate = allRows[i0]?.date.replace(/-gap$/, '')
      const endDate = allRows[i1]?.date.replace(/-gap$/, '')
      if (!startDate || !endDate) return
      onBrushChange({ startDate, endDate })
    },
    [allRows, onBrushChange],
  )

  const visibleRows = useMemo(() => {
    if (!indexSelection) return allRows
    const [i0, i1] = indexSelection
    return allRows.slice(i0, i1 + 1)
  }, [allRows, indexSelection])

  useEffect(() => {
    return () => setContainerWidth(0)
  }, [])

  if (!snapshots.length) return null

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Tendência longitudinal
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Linha cheia para dias reais e tracejada para estimativas. {showSleepDebt ? 'Linha pontilhada secundária = débito de sono 7d (horas).' : ''}
          </p>
        </div>

        <CardScoreBadge
          label="Último"
          value={latest?.score != null ? latest.score.toFixed(0) : '--'}
          band={latest?.exploratory ? 'exploratório' : 'baseline madura'}
          hint={latest ? `${Math.round(latest.confidence * 100)}% confiança` : 'sem série'}
          valueColorClass={latest?.score != null && latest.score >= 70 ? 'text-emerald-700' : latest?.score != null && latest.score < 40 ? 'text-rose-700' : 'text-slate-900'}
        />
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
          <ComposedChart data={visibleRows} margin={{ top: 8, right: PLOT_MARGIN_RIGHT, bottom: 4, left: 0 }}>
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
            {showSleepDebt && (
              <YAxis
                yAxisId="debt"
                orientation="right"
                tick={{ fill: CHART_TOKENS.ui.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v: number) => `${v.toFixed(0)}h`}
              />
            )}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => {
                if (typeof value !== 'number') return ['—', name]
                if (name === 'scoreReal') return [`${value.toFixed(0)}/100`, 'Recovery Index']
                if (name === 'scoreEstimated') return [`${value.toFixed(0)}/100`, 'Recovery Index (estim.)']
                if (name === 'sleepDebt7d') return [`${value.toFixed(1)} h`, 'Débito 7d']
                return [value, name]
              }}
            />
            <ReferenceLine
              yAxisId="score"
              y={70}
              stroke={CHART_TOKENS.reference.optimalText}
              strokeDasharray="4 3"
              strokeWidth={1.1}
              label={{ value: 'zona ótima ≥70', position: 'insideTopRight', fontSize: 10, fill: CHART_TOKENS.reference.optimalText }}
            />
            <ReferenceLine
              yAxisId="score"
              y={40}
              stroke={CHART_TOKENS.reference.attentionText}
              strokeDasharray="4 3"
              strokeWidth={1.1}
              label={{ value: 'atenção ≤40', position: 'insideBottomRight', fontSize: 10, fill: CHART_TOKENS.reference.attentionText }}
            />
            <Area
              yAxisId="score"
              type="monotone"
              dataKey="scoreReal"
              stroke="none"
              fill={CHART_TOKENS.series.recovery}
              fillOpacity={0.15}
              isAnimationActive={false}
            />
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="scoreReal"
              stroke={CHART_TOKENS.series.recovery}
              strokeWidth={2.2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="scoreEstimated"
              stroke={CHART_TOKENS.series.recovery}
              strokeWidth={1.8}
              strokeDasharray="4 4"
              strokeOpacity={0.65}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {showSleepDebt && (
              <Line
                yAxisId="debt"
                type="monotone"
                dataKey="sleepDebt7d"
                stroke={CHART_TOKENS.series.chronobiology}
                strokeOpacity={0.85}
                strokeWidth={1.6}
                strokeDasharray="2 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {onBrushChange && (
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
      )}
    </div>
  )
}
