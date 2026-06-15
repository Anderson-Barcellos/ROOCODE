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
import { TOOLTIP_DEFAULTS, getInterpolationSuffix } from '@/components/charts/shared/tooltip-helpers'

interface SleepStagesPoint {
  date: string
  label: string
  deep: number | null
  rem: number | null
  core: number | null
  awake: number | null
  total: number | null
  efficiency: number | null
  interpolated: boolean
}

function buildSleepStagesData(snapshots: DailySnapshot[]): { points: SleepStagesPoint[]; hasStages: boolean } {
  const points = snapshots
    .filter((s) => s.health?.sleepTotalHours != null && (s.health.sleepTotalHours ?? 0) > 0)
    .map((s) => ({
      date: s.date,
      label: dayLabel(s.date),
      deep: s.health?.sleepDeepHours ?? null,
      rem: s.health?.sleepRemHours ?? null,
      core: s.health?.sleepCoreHours ?? null,
      awake: s.health?.sleepAwakeHours ?? null,
      total: s.health?.sleepTotalHours ?? null,
      efficiency: s.health?.sleepEfficiencyPct ?? null,
      interpolated: s.interpolated === true,
    }))

  const hasStages = points.some((p) => p.deep != null || p.core != null || p.awake != null)
  return { points, hasStages }
}

interface SleepStagesChartProps {
  snapshots: DailySnapshot[]
}

const TOOLTIP_STYLE = {
  borderRadius: 16,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  boxShadow: '0 18px 42px rgba(17,35,30,0.12)',
  fontSize: 12,
}

export function SleepStagesChart({ snapshots }: SleepStagesChartProps) {
  const { points: data, hasStages } = buildSleepStagesData(snapshots)
  const readiness = evaluateReadiness(snapshots, CHART_REQUIREMENTS.sleepStagesChart, 'Estágios de sono')
  const summary = (() => {
    const validTotal = data.map((point) => point.total).filter((v): v is number => typeof v === 'number')
    const validEff = data.map((point) => point.efficiency).filter((v): v is number => typeof v === 'number')
    const remPct = data
      .map((point) =>
        point.rem != null && point.total != null && point.total > 0
          ? (point.rem / point.total) * 100
          : null,
      )
      .filter((v): v is number => typeof v === 'number')

    const mean = (values: number[]): number | null =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

    return {
      avgHours: mean(validTotal),
      avgEfficiency: mean(validEff),
      avgRemPct: mean(remPct),
    }
  })()

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5">
        <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
          Sono
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">
          Eficiência e arquitetura
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            Média: {summary.avgHours != null ? `${summary.avgHours.toFixed(1).replace('.', ',')}h` : '—'}
          </span>
          <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-800">
            Eficiência: {summary.avgEfficiency != null ? `${Math.round(summary.avgEfficiency)}%` : '—'}
          </span>
          <span className="inline-flex items-center rounded-full border border-violet-200 dark:border-violet-400/30 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-800 dark:text-violet-200">
            REM: {summary.avgRemPct != null ? `${Math.round(summary.avgRemPct)}%` : '—'}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {hasStages
            ? 'Profundo + Núcleo + REM + Acordado (eixo esquerdo, h). Linha de eficiência (eixo direito, %) com alvo de 85%.'
            : 'Total de sono e REM disponíveis. Estágios detalhados aparecem quando o Apple Watch registra.'}
        </p>
      </div>

      <DataReadinessGate readiness={readiness}>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barSize={data.length > 60 ? 4 : data.length > 30 ? 6 : 10}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v: number) => `${v}h`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: '#0ea5e9', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              {...TOOLTIP_DEFAULTS}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name, item) => {
                if (name === 'Eficiência') {
                  const text = typeof value === 'number' ? `${value.toFixed(0)}%` : '—'
                  return [text, name]
                }
                const suffix = getInterpolationSuffix(item)
                const text = typeof value === 'number' ? `${value.toFixed(1)}h${suffix}` : '—'
                return [text, name]
              }}
            />
            <Legend
              formatter={(value) => (
                <span style={{ fontSize: 12, color: '#475569' }}>{value}</span>
              )}
            />
            <ReferenceLine yAxisId="left" y={7} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: '7h', position: 'right', fill: '#10b981', fontSize: 11 }} />
            <ReferenceLine yAxisId="right" y={85} stroke="#0ea5e9" strokeDasharray="2 2" strokeWidth={1.2} label={{ value: '85%', position: 'right', fill: '#0ea5e9', fontSize: 11 }} />
            {hasStages ? (
              <>
                <Bar yAxisId="left" dataKey="deep" stackId="sleep" fill="#1e3a5f" name="Profundo" radius={[0, 0, 0, 0]}>
                  {data.map((entry, i) => <Cell key={`d-${i}`} fillOpacity={entry.interpolated ? 0.4 : 1} />)}
                </Bar>
                <Bar yAxisId="left" dataKey="rem" stackId="sleep" fill="#7c3aed" name="REM">
                  {data.map((entry, i) => <Cell key={`r-${i}`} fillOpacity={entry.interpolated ? 0.4 : 1} />)}
                </Bar>
                <Bar yAxisId="left" dataKey="core" stackId="sleep" fill="#3b82f6" name="Núcleo">
                  {data.map((entry, i) => <Cell key={`c-${i}`} fillOpacity={entry.interpolated ? 0.4 : 1} />)}
                </Bar>
                <Bar yAxisId="left" dataKey="awake" stackId="sleep" fill="#94a3b8" name="Acordado" radius={[3, 3, 0, 0]}>
                  {data.map((entry, i) => <Cell key={`a-${i}`} fillOpacity={entry.interpolated ? 0.4 : 1} />)}
                </Bar>
              </>
            ) : (
              <>
                <Bar yAxisId="left" dataKey="total" fill="#0f766e" name="Total" radius={[3, 3, 0, 0]}>
                  {data.map((entry, i) => <Cell key={`t-${i}`} fillOpacity={entry.interpolated ? 0.4 : 1} />)}
                </Bar>
                <Bar yAxisId="left" dataKey="rem" fill="#7c3aed" name="REM" radius={[3, 3, 0, 0]}>
                  {data.map((entry, i) => <Cell key={`r2-${i}`} fillOpacity={entry.interpolated ? 0.4 : 1} />)}
                </Bar>
              </>
            )}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="efficiency"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              name="Eficiência"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
