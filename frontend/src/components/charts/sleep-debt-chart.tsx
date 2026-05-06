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

import type { DailySnapshot } from '@/types/apple-health'
import { dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { computeSleepDebt } from '@/utils/sleep-debt'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'

const TARGET_HOURS = 7.5
const DANGER_THRESHOLD = 5

const TOOLTIP_STYLE = {
  borderRadius: 16,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  boxShadow: '0 18px 42px rgba(17,35,30,0.12)',
  fontSize: 12,
}

interface SleepDebtChartProps {
  snapshots: DailySnapshot[]
  target?: number
}

export function SleepDebtChart({ snapshots, target = TARGET_HOURS }: SleepDebtChartProps) {
  const data = useMemo(() => {
    const series = computeSleepDebt(snapshots, target)
    return series.map((p) => ({
      date: p.date,
      label: dayLabel(p.date),
      debt7d: p.debt_cumulative_7d,
      debt30d: p.debt_cumulative_30d,
    }))
  }, [snapshots, target])

  const maxDebt = useMemo(() => {
    let max = 0
    for (const p of data) {
      if (p.debt7d != null && p.debt7d > max) max = p.debt7d
      if (p.debt30d != null && p.debt30d > max) max = p.debt30d
    }
    return max
  }, [data])

  const readiness = evaluateReadiness(snapshots, CHART_REQUIREMENTS.sleepStagesChart, 'Débito de sono')

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Sono
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Débito de sono cumulativo
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Quanto você deve em horas vs meta de {target.toFixed(1)}h. Janela móvel 7d (rose) e 30d (amber). Acima de zero = falta sono. Faixa rosada acima de {DANGER_THRESHOLD}h = zona crítica.
        </p>
      </div>

      <DataReadinessGate readiness={readiness}>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
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
                width={40}
                tickFormatter={(v: number) => `${v.toFixed(0)}h`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => {
                  const text =
                    typeof value === 'number'
                      ? `${value > 0 ? '+' : ''}${value.toFixed(1)}h`
                      : '—'
                  return [text, name]
                }}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ fontSize: 12, color: '#475569' }}>{value}</span>
                )}
              />
              {maxDebt > DANGER_THRESHOLD && (
                <ReferenceArea
                  y1={DANGER_THRESHOLD}
                  y2={Math.max(maxDebt + 2, DANGER_THRESHOLD * 2)}
                  fill="#e11d48"
                  fillOpacity={0.06}
                />
              )}
              <ReferenceLine
                y={0}
                stroke="#10b981"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: 'meta', position: 'right', fill: '#10b981', fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="debt7d"
                stroke="#e11d48"
                strokeWidth={2.5}
                dot={false}
                name="Débito 7d"
              />
              <Line
                type="monotone"
                dataKey="debt30d"
                stroke="#d97706"
                strokeWidth={2}
                dot={false}
                name="Débito 30d"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>
    </div>
  )
}
