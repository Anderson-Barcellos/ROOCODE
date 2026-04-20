import { useMemo } from 'react'
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
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import type { HrvBaselineBand } from '@/hooks/useCardioAnalysis'
import { dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { sma, trendDirection, METRIC_POLARITY } from '@/utils/statistics'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'

interface HrvAnalysisProps {
  snapshots: DailySnapshot[]
  baselineBands?: HrvBaselineBand[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

const TREND_ICON = {
  improving: { Icon: TrendingUp, color: 'text-emerald-600', label: 'Melhorando' },
  stable: { Icon: Minus, color: 'text-slate-500', label: 'Estável' },
  worsening: { Icon: TrendingDown, color: 'text-rose-600', label: 'Piorando' },
}

export function HrvAnalysis({ snapshots, baselineBands, forecastStartDate }: HrvAnalysisProps) {
  const { data, trend } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.hrvSdnn != null)
    const values = filtered.map((s) => s.health?.hrvSdnn ?? null)
    const smaValues = sma(values, 7)
    const trend = trendDirection(values, METRIC_POLARITY.hrvSdnn)

    const bandsByDate = new Map(baselineBands?.map((b) => [b.date, b]))

    const data = filtered.map((s, i) => {
      const band = bandsByDate.get(s.date)
      const v = s.health?.hrvSdnn ?? null
      const isForecast = s.forecasted === true
      const isInterp = !isForecast && s.interpolated === true
      const prevInterp = !isForecast && filtered[i - 1]?.interpolated === true
      const nextInterp = !isForecast && filtered[i + 1]?.interpolated === true
      const prevForecast = filtered[i - 1]?.forecasted === true
      const nextForecast = filtered[i + 1]?.forecasted === true
      return {
        label: dayLabel(s.date),
        hrv: v,
        hrv_real: isForecast || isInterp ? null : v,
        hrv_interp: isInterp ? v : (prevInterp || nextInterp) ? v : null,
        hrv_forecast: isForecast ? v : (!isForecast && !isInterp && (prevForecast || nextForecast)) ? v : null,
        interpolated: isInterp,
        forecasted: isForecast,
        forecastConfidence: s.forecastConfidence ?? null,
        sma7: smaValues[i],
        bandUpper: band?.upper ?? null,
        bandLower: band?.lower ?? null,
        bandMean: band?.mean ?? null,
      }
    })

    return { data, trend }
  }, [snapshots, baselineBands])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.hrvAnalysis, 'HRV'),
    [snapshots],
  )

  const { Icon, color, label } = TREND_ICON[trend]

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Cardiovascular</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">HRV</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de HRV no período selecionado.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Cardiovascular
      </span>
      <div className="mt-3 flex items-center gap-3">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">HRV (SDNN)</h3>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Mais alto = melhor tônus vagal · SMA 7d em linha sólida{baselineBands?.length ? ' · Faixa = ±1σ pessoal (30d)' : ''}</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Contexto clínico</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">Tendência importa mais que valor absoluto. Medicações (escitalopram, clonazepam) podem influenciar. HRV baixo cronicamente pode refletir sobrecarga autonômica.</p>
      </details>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="hrvBandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}ms`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                if (name === 'bandUpper' || name === 'bandLower' || name === 'bandMean') return [null, null]
                if (name === 'hrv_real' || name === 'hrv_interp' || name === 'hrv_forecast') return [null, null]
                const suffix = getDataSuffix(item)
                if (name === 'hrv') {
                  const text = typeof v === 'number' ? `${v.toFixed(1)} ms${suffix}` : '—'
                  return [text, 'HRV']
                }
                if (name === 'sma7') return [typeof v === 'number' ? `${v.toFixed(1)} ms` : '—', 'SMA 7d']
                return [typeof v === 'number' ? `${v.toFixed(1)} ms` : '—', name]
              }}
              itemSorter={() => 0}
            />
            <Legend
              formatter={(value) => {
                if (value === 'hrv') return <span style={{ fontSize: 12, color: '#475569' }}>HRV bruto</span>
                if (value === 'sma7') return <span style={{ fontSize: 12, color: '#475569' }}>SMA 7d</span>
                return null
              }}
              {...{ payload: [
                { value: 'hrv', type: 'line' as const, color: '#0f766e' },
                { value: 'sma7', type: 'line' as const, color: '#0f766e' },
              ] }}
            />
            {baselineBands?.length ? (
              <>
                <Area type="monotone" dataKey="bandUpper" stroke="none" fill="url(#hrvBandGradient)" dot={false} connectNulls activeDot={false} legendType="none" />
                <Area type="monotone" dataKey="bandLower" stroke="none" fill="#fff" dot={false} connectNulls activeDot={false} legendType="none" />
                <Line type="monotone" dataKey="bandMean" stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" dot={false} connectNulls activeDot={false} legendType="none" />
              </>
            ) : null}
            <Area type="monotone" dataKey="hrv_real" stroke="#0f766e" fill="#0f766e" fillOpacity={0.12} strokeWidth={1.5} dot={false} connectNulls={false} name="hrv" legendType="none" />
            <Line type="monotone" dataKey="hrv_interp" stroke="#0f766e" strokeWidth={1.8} strokeDasharray="5 4" strokeOpacity={0.7} dot={{ r: 3, fill: '#0f766e', stroke: '#fff', strokeWidth: 1 }} connectNulls name="hrv (estim.)" legendType="none" />
            <Line type="monotone" dataKey="hrv_forecast" stroke="#0f766e" strokeWidth={1.6} strokeDasharray="2 3" strokeOpacity={0.55} dot={{ r: 3, fill: '#0f766e', stroke: '#fff', strokeWidth: 1, opacity: 0.55 }} connectNulls name="hrv (projeção)" legendType="none" />
            <Line type="monotone" dataKey="sma7" stroke="#0f766e" strokeWidth={2.8} dot={false} connectNulls={false} name="sma7" />
            {forecastStartDate && <ReferenceLine x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
