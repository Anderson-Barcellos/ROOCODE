import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { dayLabel } from '@/utils/aggregation'
import type { PanoramaHistoryPoint } from '@/utils/panorama-model'

interface PanoramaHistoryChartProps {
  history: PanoramaHistoryPoint[]
  title: string
}

interface ChartRow {
  date: string
  label: string
  composite: number | null
  recovery: number | null
  capacity: number | null
  chronobiology: number | null
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

function latestComposite(history: PanoramaHistoryPoint[]): number | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const value = history[index].composite
    if (value != null && Number.isFinite(value)) return value
  }
  return null
}

function buildRows(history: PanoramaHistoryPoint[]): ChartRow[] {
  return history.map((point) => ({
    date: point.date,
    label: dayLabel(point.date),
    composite: point.composite,
    recovery: point.recovery,
    capacity: point.capacity,
    chronobiology: point.chronobiology,
  }))
}

export function PanoramaHistoryChart({ history, title }: PanoramaHistoryChartProps) {
  const [showRecovery, setShowRecovery] = useState(false)
  const [showCapacity, setShowCapacity] = useState(false)
  const [showChronobiology, setShowChronobiology] = useState(false)

  const data = useMemo(() => buildRows(history), [history])
  const latest = useMemo(() => latestComposite(history), [history])

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Tendência longitudinal
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Leitura principal no composto; as 3 séries da trinca podem ser sobrepostas sob demanda.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Último</p>
          <p className="font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900">
            {latest != null ? latest.toFixed(0) : '--'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setShowRecovery((prev) => !prev)} className={`rounded-full border px-2.5 py-1 font-semibold ${showRecovery ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          Recuperação
        </button>
        <button type="button" onClick={() => setShowCapacity((prev) => !prev)} className={`rounded-full border px-2.5 py-1 font-semibold ${showCapacity ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          Capacidade
        </button>
        <button type="button" onClick={() => setShowChronobiology((prev) => !prev)} className={`rounded-full border px-2.5 py-1 font-semibold ${showChronobiology ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          Cronobiologia
        </button>
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
                const labelMap: Record<string, string> = {
                  composite: 'Estado geral',
                  recovery: 'Recuperação',
                  capacity: 'Capacidade',
                  chronobiology: 'Cronobiologia',
                }
                const labelKey = typeof name === 'string' ? name : ''
                const fallbackLabel = typeof name === 'string' ? name : 'Métrica'
                return [`${value.toFixed(0)}/100`, labelMap[labelKey] ?? fallbackLabel]
              }}
            />
            <Legend formatter={(value) => {
              const labelMap: Record<string, string> = {
                composite: 'Estado geral',
                recovery: 'Recuperação',
                capacity: 'Capacidade',
                chronobiology: 'Cronobiologia',
              }
              const labelKey = typeof value === 'string' ? value : ''
              const fallbackLabel = typeof value === 'string' ? value : String(value)
              return <span style={{ fontSize: 12, color: '#475569' }}>{labelMap[labelKey] ?? fallbackLabel}</span>
            }} />
            <ReferenceLine y={45} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.2} />
            <ReferenceLine y={70} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.2} />
            <Area type="monotone" dataKey="composite" stroke="none" fill="#0f766e" fillOpacity={0.08} />
            <Line type="monotone" dataKey="composite" stroke="#0f766e" strokeWidth={2.4} dot={false} connectNulls={false} />
            {showRecovery && <Line type="monotone" dataKey="recovery" stroke="#0d9488" strokeWidth={1.5} dot={false} connectNulls={false} />}
            {showCapacity && <Line type="monotone" dataKey="capacity" stroke="#0369a1" strokeWidth={1.5} dot={false} connectNulls={false} />}
            {showChronobiology && <Line type="monotone" dataKey="chronobiology" stroke="#d97706" strokeWidth={1.5} dot={false} connectNulls={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
