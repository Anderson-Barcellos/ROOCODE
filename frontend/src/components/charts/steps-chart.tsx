import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
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
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'
import { getStepsLabel, getStepsTone } from '@/utils/health-policies'
import { mean } from '@/utils/date'
import { sma } from '@/utils/statistics'

interface StepsChartProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

const TONE_COLORS: Record<string, string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  watch: 'border-amber-200 bg-amber-50 text-amber-700',
  negative: 'border-rose-200 bg-rose-50 text-rose-700',
}

// Meta usada como ReferenceLine: 10k passos/dia (Tudor-Locke "ativo")
const TARGET_STEPS = 10000

export function StepsChart({ snapshots, forecastStartDate }: StepsChartProps) {
  const { data, avgSteps, avgDistance } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.steps != null)
    const values = filtered.map((s) => s.health?.steps ?? null)
    const smaValues = sma(values, 7)
    const data = filtered.map((s, i) => ({
      label: dayLabel(s.date),
      steps: s.health?.steps ?? null,
      distanceKm: s.health?.distanceKm ?? null,
      sma7: smaValues[i],
      interpolated: s.interpolated === true,
      forecasted: s.forecasted === true,
      forecastConfidence: s.forecastConfidence ?? null,
    }))
    const avgSteps = mean(values)
    const avgDistance = mean(filtered.map((s) => s.health?.distanceKm ?? null))
    return { data, avgSteps, avgDistance }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.stepsTimelineChart, 'Passos'),
    [snapshots],
  )

  const stepsTone = getStepsTone(avgSteps)
  const stepsLabel = getStepsLabel(avgSteps)

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Atividade psicomotora</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Passos & Distância</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de passos no período.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Atividade psicomotora
      </span>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Passos & Distância</h3>
        {avgSteps != null && (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_COLORS[stepsTone]}`}>
            {Math.round(avgSteps).toLocaleString('pt-BR')} médio · {stepsLabel}
          </span>
        )}
        {avgDistance != null && (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {avgDistance.toFixed(2)} km/dia
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">Proxy de atividade psicomotora · linha sólida = SMA 7d · meta {TARGET_STEPS.toLocaleString('pt-BR')} passos/dia</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Contexto clínico</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Passos refletem ativação psicomotora. <strong>Slowing depressivo</strong> baixa passos em semanas antes da valence cair;
          <strong> ativação por estimulante</strong> (Vyvanse) aparece como aumento sustentado em dias úteis.
          Queda sustentada de {'>'}30% em 7 dias vs baseline é sinal pra investigar.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis
              tick={{ fill: '#475569', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                const suffix = getDataSuffix(item)
                if (typeof v !== 'number') return ['—', name]
                if (name === 'steps') return [`${Math.round(v).toLocaleString('pt-BR')} passos${suffix}`, 'Passos']
                if (name === 'sma7') return [`${Math.round(v).toLocaleString('pt-BR')}`, 'SMA 7d']
                return [`${v}`, name]
              }}
            />
            <Legend formatter={(value) => {
              const labels: Record<string, string> = { steps: 'Passos', sma7: 'SMA 7d' }
              return <span style={{ fontSize: 12, color: '#475569' }}>{labels[value] ?? value}</span>
            }} />
            <ReferenceLine y={TARGET_STEPS} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.2} />
            {forecastStartDate && <ReferenceLine x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />}
            <Bar dataKey="steps" fill="#0ea5e9" radius={[2, 2, 0, 0]} name="steps">
              {data.map((entry, i) => <Cell key={`s-${i}`} fillOpacity={entry.forecasted ? 0.35 : entry.interpolated ? 0.3 : 0.75} />)}
            </Bar>
            <Line type="monotone" dataKey="sma7" stroke="#0c4a6e" strokeWidth={2.5} dot={false} connectNulls={false} name="sma7" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
