import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import type { OvertrainingStatus } from '@/hooks/useCardioAnalysis'
import { dayLabel } from '@/utils/aggregation'
import { sma, trendDirection, METRIC_POLARITY } from '@/utils/statistics'
import { getInterpolationSuffix } from '@/components/charts/shared/tooltip-helpers'

interface HeartRateBandsProps {
  snapshots: DailySnapshot[]
  overtraining?: OvertrainingStatus
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

const TREND_ICON = {
  improving: { Icon: TrendingDown, color: 'text-emerald-600', label: 'Melhorando' },
  stable: { Icon: Minus, color: 'text-slate-500', label: 'Estável' },
  worsening: { Icon: TrendingUp, color: 'text-rose-600', label: 'Piorando' },
}

export function HeartRateBands({ snapshots, overtraining }: HeartRateBandsProps) {
  const { data, trend } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.restingHeartRate != null)
    const rhrValues = filtered.map((s) => s.health?.restingHeartRate ?? null)
    const smaValues = sma(rhrValues, 7)
    const trend = trendDirection(rhrValues, METRIC_POLARITY.restingHeartRate)

    const data = filtered.map((s, i) => {
      const v = s.health?.restingHeartRate ?? null
      const isInterp = s.interpolated === true
      const prevInterp = filtered[i - 1]?.interpolated === true
      const nextInterp = filtered[i + 1]?.interpolated === true
      return {
        label: dayLabel(s.date),
        rhr: v,
        rhr_real: isInterp ? null : v,
        rhr_interp: isInterp ? v : prevInterp || nextInterp ? v : null,
        interpolated: isInterp,
        sma7: smaValues[i],
      }
    })

    return { data, trend }
  }, [snapshots])

  const { Icon, color, label } = TREND_ICON[trend]

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Cardiovascular</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">FC Repouso</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de FC repouso no período selecionado.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Cardiovascular
      </span>
      <div className="mt-3 flex items-center gap-3">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">FC Repouso</h3>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        {overtraining?.isOvertrained && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
            ⚠ FC elevada ({overtraining.daysElevated}d acima do baseline)
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Linha grossa = SMA 7 dias · &lt;60 atlético, 60-80 normal, &gt;80 elevado
        {overtraining?.baselineMean ? ` · Baseline pessoal: ${overtraining.baselineMean} bpm` : ''}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Contexto clínico</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">&lt;60 bpm é normal com histórico atlético. Aumento sustentado da FC repouso (mesmo dentro de 60-80) pode indicar estresse, desconicionamento ou infecção. Correlaciona inversamente com HRV.</p>
      </details>

      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <ReferenceArea y1={0} y2={60} fill="#dcfce7" fillOpacity={0.5} ifOverflow="hidden" />
            <ReferenceArea y1={60} y2={80} fill="#fef9c3" fillOpacity={0.5} ifOverflow="hidden" />
            <ReferenceArea y1={80} y2={200} fill="#fee2e2" fillOpacity={0.5} ifOverflow="hidden" />
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} tickFormatter={(v: number) => `${v}`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                if (name === 'rhr_real' || name === 'rhr_interp') return [null, null]
                const suffix = getInterpolationSuffix(item)
                if (typeof v !== 'number') return ['—', name]
                if (name === 'rhr') return [`${v.toFixed(0)} bpm${suffix}`, 'FC repouso']
                if (name === 'sma7') return [`${v.toFixed(0)} bpm`, 'SMA 7d']
                return [`${v.toFixed(0)} bpm`, name]
              }}
            />
            <Legend formatter={(value) => <span style={{ fontSize: 12, color: '#475569' }}>{value === 'rhr' ? 'FC repouso' : 'SMA 7d'}</span>} />
            {overtraining?.baselineMean ? (
              <ReferenceLine y={overtraining.baselineMean} stroke="#6366f1" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Baseline ${overtraining.baselineMean}`, position: 'right', fill: '#6366f1', fontSize: 10 }} />
            ) : null}
            <Line type="monotone" dataKey="rhr_real" stroke="#be123c" strokeWidth={1.5} dot={false} opacity={0.5} connectNulls={false} name="rhr" legendType="none" />
            <Line type="monotone" dataKey="rhr_interp" stroke="#be123c" strokeWidth={1.5} strokeDasharray="5 4" strokeOpacity={0.55} dot={{ r: 3, fill: '#be123c', stroke: '#fff', strokeWidth: 1 }} connectNulls legendType="none" name="rhr (estim.)" />
            <Line type="monotone" dataKey="sma7" stroke="#be123c" strokeWidth={2.8} dot={false} connectNulls={false} name="sma7" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
