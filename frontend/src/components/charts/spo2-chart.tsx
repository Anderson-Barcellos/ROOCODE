import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
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

interface Spo2ChartProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function Spo2Chart({ snapshots, forecastStartDate }: Spo2ChartProps) {
  const { data, hasAlert } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.spo2 != null)
    const data = filtered.map((s, i) => {
      const v = s.health?.spo2 ?? null
      const isForecast = s.forecasted === true
      const isInterp = !isForecast && s.interpolated === true
      const prevInterp = !isForecast && filtered[i - 1]?.interpolated === true
      const nextInterp = !isForecast && filtered[i + 1]?.interpolated === true
      const prevForecast = filtered[i - 1]?.forecasted === true
      const nextForecast = filtered[i + 1]?.forecasted === true
      return {
        label: dayLabel(s.date),
        spo2: v,
        spo2_real: isForecast || isInterp ? null : v,
        spo2_interp: isInterp ? v : (prevInterp || nextInterp) ? v : null,
        spo2_forecast: isForecast ? v : (!isForecast && !isInterp && (prevForecast || nextForecast)) ? v : null,
        interpolated: isInterp,
        forecasted: isForecast,
        forecastConfidence: s.forecastConfidence ?? null,
      }
    })
    const hasAlert = data.some((d) => d.spo2 != null && d.spo2 < 94)
    return { data, hasAlert }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.spo2Chart, 'SpO₂'),
    [snapshots],
  )

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Cardiovascular</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">SpO2</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de SpO2 no período selecionado.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Cardiovascular
      </span>
      <div className="mt-3 flex items-center gap-3">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">SpO2</h3>
        {hasAlert && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
            ⚠ Dias abaixo de 94%
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">&gt;95% normal · &lt;93% noturno sugere apneia/UARS</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Contexto clínico</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">SpO2 noturna &lt;93% em múltiplos dias é indicativo de apneia/UARS e justifica avaliação com polissonografia. Valores episódicos podem refletir posição ou hipoventilação.</p>
      </details>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <ReferenceArea y1={88} y2={94} fill="#fee2e2" fillOpacity={0.4} />
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={[88, 100]}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                if (name === 'spo2_real' || name === 'spo2_interp' || name === 'spo2_forecast') return [null, null]
                const suffix = getDataSuffix(item)
                const text = typeof v === 'number' ? `${v.toFixed(1)}%${suffix}` : '—'
                return [text, 'SpO2']
              }}
            />
            <ReferenceLine y={95} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: '95%', position: 'right', fill: '#f97316', fontSize: 11 }} />
            <ReferenceLine y={94} stroke="#dc2626" strokeWidth={1.5} label={{ value: '94% ⚠', position: 'right', fill: '#dc2626', fontSize: 11 }} />
            <Line type="monotone" dataKey="spo2_real" stroke="#7c3aed" strokeWidth={2} dot={false} connectNulls={false} name="SpO2" legendType="none" />
            <Line type="monotone" dataKey="spo2_interp" stroke="#7c3aed" strokeWidth={1.8} strokeDasharray="5 4" strokeOpacity={0.7} dot={{ r: 3, fill: '#7c3aed', stroke: '#fff', strokeWidth: 1 }} connectNulls legendType="none" name="SpO2 (estim.)" />
            <Line type="monotone" dataKey="spo2_forecast" stroke="#7c3aed" strokeWidth={1.6} strokeDasharray="2 3" strokeOpacity={0.55} dot={{ r: 3, fill: '#7c3aed', stroke: '#fff', strokeWidth: 1, opacity: 0.55 }} connectNulls legendType="none" name="SpO2 (projeção)" />
            {forecastStartDate && <ReferenceLine x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
