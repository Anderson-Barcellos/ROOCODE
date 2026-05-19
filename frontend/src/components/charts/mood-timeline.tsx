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
  forecastStartDate?: string
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
  forecasted: boolean
  forecastConfidence: number | null
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
  if (payload.forecasted) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="white"
        stroke={payload.color}
        strokeWidth={1.5}
        strokeDasharray="1.5 1"
        opacity={0.55}
      />
    )
  }
  if (payload.interpolated) {
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

export function MoodTimeline({ snapshots, forecastStartDate }: MoodTimelineProps) {
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
      interpolated: !s.forecasted && (s.interpolated === true || s.mood?.interpolated === true),
      forecasted: s.forecasted === true,
      forecastConfidence: s.forecastConfidence ?? null,
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

  const moodVerdict = useMemo(() => {
    const valid = data.filter((point) => point.valence != null).map((point) => point.valence as number)
    if (valid.length < 8) return null

    const last7 = valid.slice(-7)
    const prev7 = valid.slice(-14, -7)
    if (!last7.length || !prev7.length) return null

    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const lastAvg = mean(last7)
    const prevAvg = mean(prev7)
    const delta = lastAvg - prevAvg

    const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(2).replace('.', ',')}`
    if (delta <= -0.2) {
      return {
        text: `Humor médio em queda na última semana (Δ ${deltaText} vs semana anterior). Vale revisar sono, estresse e cobertura medicamentosa recente.`,
        tone: 'watch' as const,
      }
    }
    if (delta >= 0.2) {
      return {
        text: `Humor médio melhorando na última semana (Δ ${deltaText} vs semana anterior). Tendência favorável.`,
        tone: 'good' as const,
      }
    }
    return {
      text: `Humor médio estável na última semana (Δ ${deltaText} vs semana anterior).`,
      tone: 'neutral' as const,
    }
  }, [data])

  const verdictClass =
    moodVerdict?.tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : moodVerdict?.tone === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-50 text-slate-800'

  if (!hasData) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Humor dia a dia</h3>
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
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Humor dia a dia</h3>
          <p className="mt-1 text-xs text-slate-500">
            {daysWithMood} dias com registro em {totalDays} — {coveragePct}% de cobertura
          </p>
          <p className="mt-1 text-xs text-slate-500">Escala do eixo: −1 desagradável · 0 neutro · +1 agradável.</p>
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

      {moodVerdict && (
        <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
          <span className="font-semibold">Veredito:</span> {moodVerdict.text}
        </p>
      )}

      <DataReadinessGate readiness={readiness}>
      <div className="mt-3 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
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
              tickFormatter={(value: number) =>
                value === -1 ? '-1' : value === 0 ? '0' : value === 1 ? '+1' : value.toFixed(1)
              }
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
                    <p className="font-mono text-slate-500">Humor: {p.valence.toFixed(2)}</p>
                    {p.forecasted && (
                      <p className="mt-1 border-t border-slate-100 pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-violet-700">🔮 projetado{p.forecastConfidence != null ? ` · conf ${p.forecastConfidence.toFixed(2)}` : ''}</p>
                    )}
                    {p.interpolated && !p.forecasted && (
                      <p className="mt-1 border-t border-slate-100 pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-amber-700">⚠ estimado</p>
                    )}
                  </div>
                )
              }}
            />
            <ReferenceLine y={0} stroke="rgba(100,116,139,0.4)" strokeDasharray="4 3" />
            {forecastStartDate && (
              <ReferenceLine x={forecastStartDate} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />
            )}
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
