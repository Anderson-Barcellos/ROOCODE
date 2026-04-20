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
import { VO2_BANDS_MALE_35_44, getVo2Category } from '@/utils/health-policies'
import { sma } from '@/utils/statistics'

interface Vo2MaxChartProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function Vo2MaxChart({ snapshots, forecastStartDate }: Vo2MaxChartProps) {
  const { data, latest, latestCategory } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.vo2Max != null)
    const values = filtered.map((s) => s.health?.vo2Max ?? null)
    const smaValues = sma(values, 7)

    const data = filtered.map((s, i) => {
      const v = s.health?.vo2Max ?? null
      const isForecast = s.forecasted === true
      const isInterp = !isForecast && s.interpolated === true
      return {
        label: dayLabel(s.date),
        vo2: v,
        vo2_real: isForecast || isInterp ? null : v,
        vo2_interp: isInterp ? v : null,
        vo2_forecast: isForecast ? v : null,
        sma7: smaValues[i],
        interpolated: isInterp,
        forecasted: isForecast,
        forecastConfidence: s.forecastConfidence ?? null,
      }
    })

    const latest = filtered.at(-1)?.health?.vo2Max ?? null
    const latestCategory = getVo2Category(latest)
    return { data, latest, latestCategory }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.vo2MaxChart, 'VO2 Máx'),
    [snapshots],
  )

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Cardiorrespiratório</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">VO2 Máx</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de VO2 Máx no período.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Cardiorrespiratório
      </span>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">VO2 Máx</h3>
        {latest != null && latestCategory && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{ borderColor: latestCategory.color, backgroundColor: `${latestCategory.color}40`, color: '#065f46' }}
          >
            {latest.toFixed(1)} ml/(kg·min) · {latestCategory.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">Baseline cardiorrespiratório (homem 35-44a) · faixas de referência como bands coloridas · SMA 7d em linha sólida</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Contexto clínico</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          VO2 Máx responde a exercício aeróbico crônico. Cai com sedentarismo, ganho de peso, e pode ser
          modulado por antidepressivos (via sedação ou ganho de peso). Movimentação de <strong>3-5 ml/(kg·min)</strong> em
          poucas semanas é clinicamente relevante. Para referência: sedentário ≈ 28, atleta treinado ≥ 50.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={[25, 55]}
              tickFormatter={(v: number) => `${v}`}
            />
            {VO2_BANDS_MALE_35_44.map((band) => (
              <ReferenceArea
                key={band.label}
                y1={band.min}
                y2={band.max}
                fill={band.color}
                fillOpacity={0.25}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                if (name === 'vo2_real' || name === 'vo2_interp' || name === 'vo2_forecast') return [null, null]
                const suffix = getDataSuffix(item)
                if (name === 'vo2') {
                  const category = typeof v === 'number' ? getVo2Category(v)?.label ?? '' : ''
                  const text = typeof v === 'number' ? `${v.toFixed(1)} ml/(kg·min)${suffix} · ${category}` : '—'
                  return [text, 'VO2 Máx']
                }
                if (name === 'sma7') return [typeof v === 'number' ? `${v.toFixed(1)}` : '—', 'SMA 7d']
                return [typeof v === 'number' ? `${v.toFixed(1)}` : '—', name]
              }}
              itemSorter={() => 0}
            />
            <Line type="monotone" dataKey="vo2_real" stroke="#0f766e" strokeWidth={1.8} dot={{ r: 3, fill: '#0f766e', stroke: '#fff', strokeWidth: 1 }} connectNulls={false} name="vo2" legendType="none" />
            <Line type="monotone" dataKey="vo2_interp" stroke="#0f766e" strokeWidth={1.6} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} connectNulls name="vo2 (estim.)" legendType="none" />
            <Line type="monotone" dataKey="vo2_forecast" stroke="#0f766e" strokeWidth={1.4} strokeDasharray="2 3" strokeOpacity={0.55} dot={false} connectNulls name="vo2 (projeção)" legendType="none" />
            <Line type="monotone" dataKey="sma7" stroke="#064e3b" strokeWidth={2.5} dot={false} connectNulls={false} name="sma7" />
            {forecastStartDate && <ReferenceLine x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
