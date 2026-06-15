import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import { dayLabel } from '@/utils/aggregation'
import { computeSleepQualityScoreSeries } from '@/utils/sleep-quality-score'
import { computeSleepRegularitySeries } from '@/utils/sleep-regularity'
import type { DailySnapshot } from '@/types/apple-health'
import type { PanoramaHistoryPoint } from '@/utils/panorama-model'

import { CHART_TOKENS } from './shared/chart-tokens'
import { ChartTooltip } from '@/components/charts/shared/ChartTooltip'
import type { PanoramaBrushRange } from './panorama-composite-chart'

/**
 * Accordion de 3 mini-charts dos pilares do Panorama. Consome
 * panoramaBrushRange (não emite — leitura sincronizada). Cada mini-chart
 * mostra a série do pilar (recovery/capacity/chronobiology) com overlay
 * de um índice de sub-componente quando aplicável.
 */

type PillarNavTarget = 'recuperacao' | 'capacidade'

interface PillarMiniChartsProps {
  history: PanoramaHistoryPoint[]
  snapshots: DailySnapshot[]
  brushRange: PanoramaBrushRange | null
  onNavigate: (target: PillarNavTarget) => void
}

interface PillarRow {
  date: string
  label: string
  value: number | null
  overlay: number | null
  isInterpolated: boolean
  isForecast: boolean
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 11,
  background: 'white',
  boxShadow: '0 12px 28px rgba(17,35,30,0.10)',
  padding: '6px 10px',
}

const MINI_CHART_HEIGHT = 150
const PILLAR_LABEL: Record<'recovery' | 'capacity' | 'chronobiology', string> = {
  recovery: 'Recuperação',
  capacity: 'Capacidade',
  chronobiology: 'Cronobiologia',
}
const PILLAR_COLOR: Record<'recovery' | 'capacity' | 'chronobiology', string> = {
  recovery: CHART_TOKENS.series.recovery,
  capacity: CHART_TOKENS.series.capacity,
  chronobiology: CHART_TOKENS.series.chronobiology,
}
const PILLAR_TARGET: Record<'recovery' | 'capacity' | 'chronobiology', PillarNavTarget> = {
  recovery: 'recuperacao',
  capacity: 'capacidade',
  chronobiology: 'capacidade',
}
const OVERLAY_LABEL: Record<'recovery' | 'capacity' | 'chronobiology', string | null> = {
  recovery: 'Sleep Quality',
  capacity: null, // FCI é por-janela, não por-dia — fica fora desta rodada
  chronobiology: 'Sleep Regularity',
}

function filterByBrush<T extends { date: string }>(
  rows: T[],
  brushRange: PanoramaBrushRange | null,
): T[] {
  if (!brushRange) return rows
  return rows.filter((r) => r.date >= brushRange.startDate && r.date <= brushRange.endDate)
}

interface MiniChartProps {
  pillarKey: 'recovery' | 'capacity' | 'chronobiology'
  rows: PillarRow[]
  onNavigate: (target: PillarNavTarget) => void
}

function MiniChart({ pillarKey, rows, onNavigate }: MiniChartProps) {
  const color = PILLAR_COLOR[pillarKey]
  const label = PILLAR_LABEL[pillarKey]
  const overlayLabel = OVERLAY_LABEL[pillarKey]

  const latest = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const r = rows[i]
      if (!r.isForecast && r.value != null) return r.value
    }
    return null
  }, [rows])

  return (
    <div className="rounded-2xl border border-slate-900/10 bg-white/85 p-3 shadow-[0_8px_22px_rgba(17,35,30,0.06)]">
      <button
        type="button"
        onClick={() => onNavigate(PILLAR_TARGET[pillarKey])}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </span>
        <span className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          {latest != null ? latest.toFixed(0) : '--'}
          <span className="ml-1 text-xs text-slate-400">/100</span>
        </span>
      </button>
      <div className="mt-1" style={{ height: MINI_CHART_HEIGHT }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
          initialDimension={{ width: 1, height: 1 }}
        >
          <ComposedChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_TOKENS.ui.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis
              tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={28}
              domain={[0, 100]}
            />
            <ChartTooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => {
                if (typeof value !== 'number') return ['—', name]
                if (name === 'value') return [`${value.toFixed(0)}/100`, label]
                if (name === 'overlay') return [`${value.toFixed(0)}/100`, overlayLabel ?? '—']
                return [value, name]
              }}
              labelFormatter={(l) => l}
            />
            <ReferenceLine
              y={CHART_TOKENS.zones.optimalThreshold}
              stroke={CHART_TOKENS.reference.optimalText}
              strokeDasharray="3 3"
              strokeWidth={0.9}
              label={{ value: '≥70', position: 'insideTopRight', fontSize: 9, fill: CHART_TOKENS.reference.optimalText }}
            />
            <ReferenceLine
              y={CHART_TOKENS.zones.attentionThreshold}
              stroke={CHART_TOKENS.reference.attentionText}
              strokeDasharray="3 3"
              strokeWidth={0.9}
              label={{ value: '≤45', position: 'insideBottomRight', fontSize: 9, fill: CHART_TOKENS.reference.attentionText }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.8}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            {overlayLabel && (
              <Line
                type="monotone"
                dataKey="overlay"
                stroke={color}
                strokeOpacity={0.5}
                strokeWidth={1.2}
                strokeDasharray="3 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {overlayLabel && (
        <p className="mt-1 text-[0.65rem] text-slate-500">
          Linha pontilhada: <span style={{ color }}>{overlayLabel}</span>
        </p>
      )}
    </div>
  )
}

export function PillarMiniCharts({ history, snapshots, brushRange, onNavigate }: PillarMiniChartsProps) {
  // Overlays como Map<date, score>
  const sleepQualityMap = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const p of computeSleepQualityScoreSeries(snapshots)) map.set(p.date, p.score)
    return map
  }, [snapshots])

  const sleepRegularityMap = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const p of computeSleepRegularitySeries(snapshots)) map.set(p.date, p.score)
    return map
  }, [snapshots])

  const buildRows = (pillarKey: 'recovery' | 'capacity' | 'chronobiology'): PillarRow[] => {
    const overlayMap =
      pillarKey === 'recovery'
        ? sleepQualityMap
        : pillarKey === 'chronobiology'
          ? sleepRegularityMap
          : null
    return history.map((point) => ({
      date: point.date,
      label: dayLabel(point.date),
      value: point[pillarKey],
      overlay: overlayMap?.get(point.date) ?? null,
      isInterpolated: point.isInterpolated === true,
      isForecast: point.isForecast === true,
    }))
  }

  const recoveryRows = useMemo(
    () => filterByBrush(buildRows('recovery'), brushRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, sleepQualityMap, brushRange],
  )
  const capacityRows = useMemo(
    () => filterByBrush(buildRows('capacity'), brushRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, brushRange],
  )
  const chronoRows = useMemo(
    () => filterByBrush(buildRows('chronobiology'), brushRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, sleepRegularityMap, brushRange],
  )

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MiniChart pillarKey="recovery" rows={recoveryRows} onNavigate={onNavigate} />
      <MiniChart pillarKey="capacity" rows={capacityRows} onNavigate={onNavigate} />
      <MiniChart pillarKey="chronobiology" rows={chronoRows} onNavigate={onNavigate} />
    </div>
  )
}
