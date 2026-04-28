import { useMemo } from 'react'
import {
  Area,
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
import { mean } from '@/utils/date'
import { sma } from '@/utils/statistics'

interface HRRangeChartProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function HRRangeChart({ snapshots, forecastStartDate }: HRRangeChartProps) {
  const { data, avgMean, avgMin, avgMax } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.heartRateMean != null)
    const meanValues = filtered.map((s) => s.health?.heartRateMean ?? null)
    const smaValues = sma(meanValues, 7)
    const data = filtered.map((s, i) => {
      const hrMin = s.health?.heartRateMin ?? null
      const hrMax = s.health?.heartRateMax ?? null
      const hrMean = s.health?.heartRateMean ?? null
      const isForecast = s.forecasted === true
      const isInterp = !isForecast && s.interpolated === true
      return {
        label: dayLabel(s.date),
        hrMin,
        hrMax,
        hrMean: isForecast || isInterp ? null : hrMean,
        hrMean_interp: isInterp ? hrMean : null,
        hrMean_forecast: isForecast ? hrMean : null,
        meanSma7: smaValues[i],
        interpolated: isInterp,
        forecasted: isForecast,
        forecastConfidence: s.forecastConfidence ?? null,
        bandRange: hrMin != null && hrMax != null ? [hrMin, hrMax] as [number, number] : null,
      }
    })
    const avgMean = mean(meanValues)
    const avgMin = mean(filtered.map((s) => s.health?.heartRateMin ?? null))
    const avgMax = mean(filtered.map((s) => s.health?.heartRateMax ?? null))
    return { data, avgMean, avgMin, avgMax }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.hrRangeChart, 'FC Range'),
    [snapshots],
  )

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Cardiovascular · Frequência diária</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Frequência cardíaca · Range diário</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de frequência cardíaca no período selecionado.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Cardiovascular · Frequência diária
      </span>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Frequência cardíaca · Range diário</h3>
        {avgMean != null && (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            média {Math.round(avgMean)} bpm
          </span>
        )}
        {avgMin != null && avgMax != null && (
          <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            range {Math.round(avgMin)}–{Math.round(avgMax)} bpm
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">Min–Max diário com média · SMA 7d em tracejado · zonas: bradicardia &lt;60, normal 60–100, taquicardia &gt;100</p>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <ReferenceArea y1={40} y2={60} fill="#bae6fd" fillOpacity={0.06} />
            <ReferenceArea y1={60} y2={100} fill="#86efac" fillOpacity={0.08} />
            <ReferenceArea y1={100} y2={150} fill="#fca5a5" fillOpacity={0.06} />
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={[40, 'auto']}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                if (name === 'hrMean_interp' || name === 'hrMean_forecast') return [null, null]
                if (typeof v !== 'number') return ['—', name]
                const suffix = getDataSuffix(item)
                if (name === 'hrMin') return [`${Math.round(v)} bpm${suffix}`, 'Min']
                if (name === 'hrMax') return [`${Math.round(v)} bpm${suffix}`, 'Max']
                if (name === 'hrMean') return [`${Math.round(v)} bpm${suffix}`, 'Média']
                if (name === 'meanSma7') return [`${Math.round(v)} bpm`, 'SMA 7d']
                return [`${v}`, name]
              }}
            />
            <ReferenceLine y={60} stroke="#0284c7" strokeDasharray="4 3" strokeWidth={1} />
            <ReferenceLine y={100} stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1} />
            {forecastStartDate && (
              <ReferenceLine x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />
            )}
            <Area
              type="monotone"
              dataKey="hrMin"
              stroke="none"
              fill="transparent"
              legendType="none"
              name="hrMin"
            />
            <Area
              type="monotone"
              dataKey="hrMax"
              stroke="none"
              fill="#fda4af"
              fillOpacity={0.2}
              legendType="none"
              name="hrMax"
              baseValue="dataMin"
            />
            <Line type="monotone" dataKey="hrMean" stroke="#dc2626" strokeWidth={2} dot={false} connectNulls={false} name="hrMean" legendType="none" />
            <Line type="monotone" dataKey="hrMean_interp" stroke="#dc2626" strokeWidth={1.8} strokeDasharray="5 4" strokeOpacity={0.7} dot={{ r: 3, fill: '#dc2626', stroke: '#fff', strokeWidth: 1 }} connectNulls legendType="none" name="FC média (estim.)" />
            <Line type="monotone" dataKey="hrMean_forecast" stroke="#dc2626" strokeWidth={1.6} strokeDasharray="2 3" strokeOpacity={0.55} dot={{ r: 3, fill: '#dc2626', stroke: '#fff', strokeWidth: 1, opacity: 0.55 }} connectNulls legendType="none" name="FC média (projeção)" />
            <Line type="monotone" dataKey="meanSma7" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.6} dot={false} connectNulls={false} name="meanSma7" legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
