import { useMemo } from 'react'
import {
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

import type { DailySnapshot } from '@/types/apple-health'
import { dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'
import {
  getWalkingAsymmetryLabel,
  getWalkingAsymmetryTone,
  getWalkingSpeedTone,
} from '@/utils/health-policies'
import { mean } from '@/utils/date'

interface WalkingVitalityChartProps {
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

export function WalkingVitalityChart({ snapshots, forecastStartDate }: WalkingVitalityChartProps) {
  const { data, avgAsymmetry, avgSpeed } = useMemo(() => {
    const filtered = snapshots.filter(
      (s) => s.health?.walkingSpeedKmh != null || s.health?.walkingHeartRateAvg != null,
    )
    const data = filtered.map((s) => ({
      label: dayLabel(s.date),
      speed: s.health?.walkingSpeedKmh ?? null,
      hr: s.health?.walkingHeartRateAvg ?? null,
      asym: s.health?.walkingAsymmetryPct ?? null,
      interpolated: s.interpolated === true,
      forecasted: s.forecasted === true,
      forecastConfidence: s.forecastConfidence ?? null,
    }))
    const avgAsymmetry = mean(filtered.map((s) => s.health?.walkingAsymmetryPct ?? null))
    const avgSpeed = mean(filtered.map((s) => s.health?.walkingSpeedKmh ?? null))
    return { data, avgAsymmetry, avgSpeed }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.walkingVitalityChart, 'Vitalidade de marcha'),
    [snapshots],
  )

  const asymTone = getWalkingAsymmetryTone(avgAsymmetry)
  const asymLabel = getWalkingAsymmetryLabel(avgAsymmetry)
  const speedTone = getWalkingSpeedTone(avgSpeed)

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Marcha</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Vitalidade de marcha</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de marcha no período.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Marcha
      </span>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Vitalidade de marcha</h3>
        {avgSpeed != null && (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_COLORS[speedTone]}`}>
            {avgSpeed.toFixed(2)} km/h médio
          </span>
        )}
        {avgAsymmetry != null && (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_COLORS[asymTone]}`}>
            {avgAsymmetry.toFixed(1)}% · {asymLabel}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">Velocidade de marcha (km/h) · FC média ao caminhar (bpm) · assimetria como watchdog</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Contexto clínico</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Velocidade de marcha é biomarcador robusto de vitalidade (correlaciona com mortalidade em idosos, mas também reflete
          fadiga/sedação em adultos). Queda de {'>'}0.5 km/h sustentada = investigar. Assimetria {'>'}3% é atípica em adulto jovem —
          pode refletir clonazepam (sedação), neuropatia, ou claudicação.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis
              yAxisId="speed"
              tick={{ fill: '#0f766e', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}km/h`}
            />
            <YAxis
              yAxisId="hr"
              orientation="right"
              tick={{ fill: '#dc2626', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}bpm`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                const suffix = getDataSuffix(item)
                if (typeof v !== 'number') return ['—', name]
                if (name === 'speed') return [`${v.toFixed(2)} km/h${suffix}`, 'Velocidade']
                if (name === 'hr') return [`${v.toFixed(0)} bpm${suffix}`, 'FC caminhada']
                return [`${v}${suffix}`, name]
              }}
            />
            <Legend formatter={(value) => {
              const labels: Record<string, string> = { speed: 'Velocidade (km/h)', hr: 'FC caminhada (bpm)' }
              return <span style={{ fontSize: 12, color: '#475569' }}>{labels[value] ?? value}</span>
            }} />
            {forecastStartDate && <ReferenceLine yAxisId="speed" x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />}
            <Line yAxisId="speed" type="monotone" dataKey="speed" stroke="#0f766e" strokeWidth={2} dot={{ r: 3, fill: '#0f766e', stroke: '#fff', strokeWidth: 1 }} connectNulls={false} name="speed" />
            <Line yAxisId="hr" type="monotone" dataKey="hr" stroke="#dc2626" strokeWidth={2} dot={false} connectNulls={false} name="hr" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
