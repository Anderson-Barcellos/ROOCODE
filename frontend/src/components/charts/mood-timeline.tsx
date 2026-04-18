import { useMemo, useState } from 'react'
import { interpolateRgbBasis } from 'd3'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { sma } from '@/utils/statistics'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'

interface MoodTimelineProps {
  snapshots: DailySnapshot[]
}

const interpolateMood = interpolateRgbBasis(['#b91c1c', '#fbbf24', '#15803d'])

function moodColor(valence: number): string {
  return interpolateMood(Math.max(0, Math.min(1, (valence + 1) / 2)))
}

interface MoodDataPoint {
  date: string
  label: string
  valence: number | null
  trend: number | null
  valenceClass: string | null
  color: string
  interpolated: boolean
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

const SMA_OPTIONS = [
  { value: 5, label: '5d' },
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
]

function ValenceDot(props: {
  cx?: number
  cy?: number
  payload?: MoodDataPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload || payload.valence == null) return null
  if (payload.interpolated) {
    // Hollow circle com stroke tracejada pra indicar valor estimado
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="white"
        stroke={payload.color}
        strokeWidth={1.5}
        strokeDasharray="2 1.5"
      />
    )
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.color}
      stroke="white"
      strokeWidth={1.5}
    />
  )
}

export function MoodTimeline({ snapshots }: MoodTimelineProps) {
  const [smaWindow, setSmaWindow] = useState(7)

  const { data, hasData, totalDays, daysWithMood, coveragePct } = useMemo(() => {
    const rawValues = snapshots.map((s) => s.mood?.valence ?? null)
    const smoothed = sma(rawValues, smaWindow)

    const data: MoodDataPoint[] = snapshots.map((s, i) => ({
      date: s.date,
      label: dayLabel(s.date),
      valence: s.mood?.valence ?? null,
      trend: smoothed[i],
      valenceClass: s.mood?.valenceClass ?? null,
      color: s.mood?.valence != null ? moodColor(s.mood.valence) : '#94a3b8',
      interpolated: s.interpolated === true || s.mood?.interpolated === true,
    }))

    const totalDays = data.length
    const daysWithMood = data.filter((d) => d.valence != null).length
    const coveragePct = totalDays > 0 ? Math.round((daysWithMood / totalDays) * 100) : 0

    return {
      data,
      hasData: data.some((d) => d.valence != null),
      totalDays,
      daysWithMood,
      coveragePct,
    }
  }, [snapshots, smaWindow])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.moodTimeline, 'Humor'),
    [snapshots],
  )

  const formatXTick = (val: string): string => {
    if (!val) return ''
    const d = parseISO(val)
    if (totalDays > 90) return format(d, 'MMM/yy', { locale: ptBR })
    return format(d, 'd MMM', { locale: ptBR })
  }

  const xMinTickGap = totalDays > 180 ? 60 : totalDays > 60 ? 48 : 32

  if (!hasData) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Timeline de Valência
        </h3>
        <p className="mt-4 text-sm text-slate-400">Sem registros de humor disponíveis.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Humor
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Valência ao longo do tempo
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {daysWithMood} dias com registro em {totalDays} — {coveragePct}% de cobertura
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-slate-400">Tendência</span>
          {SMA_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSmaWindow(opt.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                smaWindow === opt.value
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-900/10 bg-white text-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-rose-700" /> Desagradável
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-400" /> Neutro
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-green-700" /> Agradável
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-6 rounded-full bg-slate-800" /> Média {smaWindow}d
        </span>
      </div>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-3 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatXTick}
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={xMinTickGap}
            />
            <YAxis
              domain={[-1, 1]}
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              ticks={[-1, -0.5, 0, 0.5, 1]}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as MoodDataPoint | undefined
                if (!p || p.valence == null) return null
                return (
                  <div style={TOOLTIP_STYLE} className="px-3 py-2">
                    <p className="font-semibold text-slate-800">{p.label}</p>
                    <p className="text-slate-600">{p.valenceClass ?? '—'}</p>
                    <p className="font-mono text-slate-500">V = {p.valence.toFixed(3)}</p>
                    {p.interpolated && (
                      <p className="mt-1 border-t border-slate-100 pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-amber-700">⚠ estimado</p>
                    )}
                  </div>
                )
              }}
            />
            <ReferenceLine y={0} stroke="rgba(100,116,139,0.4)" strokeDasharray="4 3" />
            <Line
              dataKey="trend"
              type="monotone"
              stroke="#0f172a"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              activeDot={false}
            />
            <Line
              dataKey="valence"
              type="monotone"
              stroke="transparent"
              strokeWidth={0}
              dot={(dotProps) => <ValenceDot {...dotProps} payload={dotProps.payload as MoodDataPoint} />}
              activeDot={false}
              connectNulls={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
