import { useMemo } from 'react'
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

interface RecoveryIndexChartProps {
  snapshots: DailySnapshot[]
  title?: string
}

interface ChartRow {
  date: string
  label: string
  scoreReal: number | null
  scoreEstimated: number | null
  completeness: number
  confidence: number
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

function buildRows(points: RecoveryIndexPoint[]): ChartRow[] {
  const rows = points.map((point) => ({
    date: point.date,
    label: dayLabel(point.date),
    scoreReal: point.derivedFromInterpolated ? null : point.score,
    scoreEstimated: point.derivedFromInterpolated ? point.score : null,
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
}: RecoveryIndexChartProps) {
  const series = useMemo(() => computeRecoveryIndexSeries(snapshots), [snapshots])
  const data = useMemo(() => buildRows(series), [series])
  const latest = useMemo(() => latestPoint(series), [series])

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
            Leitura semanal do índice composto, com linha cheia para dias reais e tracejada para estimativas.
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

      <div className="mt-4 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} width={36} domain={[0, 100]} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => {
                if (typeof value !== 'number') return ['—', name]
                if (name === 'scoreReal') return [`${value.toFixed(0)}/100`, 'Recovery Index']
                if (name === 'scoreEstimated') return [`${value.toFixed(0)}/100`, 'Recovery Index (estim.)']
                return [value, name]
              }}
            />
            <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.2} />
            <ReferenceLine y={70} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.2} />
            <Area type="monotone" dataKey="scoreReal" stroke="none" fill="#0f766e" fillOpacity={0.08} />
            <Line type="monotone" dataKey="scoreReal" stroke="#0f766e" strokeWidth={2.2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="scoreEstimated" stroke="#0f766e" strokeWidth={1.8} strokeDasharray="4 4" strokeOpacity={0.65} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
