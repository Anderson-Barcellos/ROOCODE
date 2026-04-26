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
import { CARDIO_RECOVERY_BANDS, getCardioRecoveryCategory } from '@/utils/health-policies'
import { sma } from '@/utils/statistics'

interface CardioRecoveryChartProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function CardioRecoveryChart({ snapshots, forecastStartDate }: CardioRecoveryChartProps) {
  const { data, latest, latestCategory } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.cardioRecoveryBpm != null)
    const values = filtered.map((s) => s.health?.cardioRecoveryBpm ?? null)
    // SMA-14d: janela mais longa porque o dado é esporádico (só após exercício)
    const smaValues = sma(values, 14)

    const data = filtered.map((s, i) => {
      const v = s.health?.cardioRecoveryBpm ?? null
      const isForecast = s.forecasted === true
      return {
        label: dayLabel(s.date),
        hrr: v,
        hrr_real: isForecast ? null : v,
        hrr_forecast: isForecast ? v : null,
        sma14: smaValues[i],
        forecasted: isForecast,
        forecastConfidence: s.forecastConfidence ?? null,
      }
    })

    const latest = filtered.at(-1)?.health?.cardioRecoveryBpm ?? null
    const latestCategory = getCardioRecoveryCategory(latest)
    return { data, latest, latestCategory }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.cardioRecoveryChart, 'Recuperação cardíaca'),
    [snapshots],
  )

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Cardiovascular
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Recuperação Cardíaca
        </h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de recuperação cardíaca no período.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Cardiovascular
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Recuperação Cardíaca
        </h3>
        {latest != null && latestCategory && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{
              borderColor: latestCategory.color,
              backgroundColor: `${latestCategory.color}40`,
              color: '#065f46',
            }}
          >
            {latest.toFixed(0)} bpm · {latestCategory.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Queda da FC no 1º min pós-exercício (HRR-1) · maior = melhor · SMA 14d em linha sólida
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          HRR-1 (Heart Rate Recovery) reflete reativação parassimpática pós-esforço. Valores &lt;12 bpm associam-se
          a maior mortalidade cardiovascular. Melhora com treino aeróbico regular. Em neuropsiquiatria: ISRS e
          lisdexanfetamina têm efeitos opostos na autonomia cardíaca — escitalopram tende a melhorar HRR, lisdex
          pode reduzi-la via dominância simpática. Dado é esporádico — requer sessão de exercício registrada.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              {CARDIO_RECOVERY_BANDS.map((band) => (
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
              <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={20}
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                domain={[0, 30]}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name, item) => {
                  if (name === 'hrr_real' || name === 'hrr_forecast') return [null, null]
                  const suffix = getDataSuffix(item)
                  if (name === 'hrr') {
                    const cat =
                      typeof v === 'number' ? getCardioRecoveryCategory(v)?.label ?? '' : ''
                    const text =
                      typeof v === 'number' ? `${v.toFixed(0)} bpm${suffix} · ${cat}` : '—'
                    return [text, 'HRR-1']
                  }
                  if (name === 'sma14')
                    return [typeof v === 'number' ? `${v.toFixed(1)} bpm` : '—', 'SMA 14d']
                  return [typeof v === 'number' ? `${v.toFixed(1)}` : '—', name]
                }}
                itemSorter={() => 0}
              />
              <Line
                type="monotone"
                dataKey="hrr_real"
                stroke="#0f766e"
                strokeWidth={1.8}
                dot={{ r: 3, fill: '#0f766e', stroke: '#fff', strokeWidth: 1 }}
                connectNulls={false}
                name="hrr"
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="hrr_forecast"
                stroke="#0f766e"
                strokeWidth={1.4}
                strokeDasharray="2 3"
                strokeOpacity={0.55}
                dot={false}
                connectNulls
                name="hrr (projeção)"
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="sma14"
                stroke="#064e3b"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                name="sma14"
              />
              {forecastStartDate && (
                <ReferenceLine
                  x={dayLabel(forecastStartDate)}
                  stroke="#7c3aed"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>
    </div>
  )
}
