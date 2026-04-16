import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { dayLabel } from '@/utils/aggregation'

interface SleepStagesPoint {
  date: string
  label: string
  deep: number | null
  rem: number | null
  core: number | null
  awake: number | null
  efficiency: number | null
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

  if (!data.length) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
        Nenhum dado de sono disponível para o período selecionado.
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Sono
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          {hasStages ? 'Estágios por noite' : 'Sono total e REM por noite'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {hasStages
            ? 'Profundo + Núcleo + REM + Acordado. Linha tracejada = 7h de referência.'
            : 'Total de sono e REM disponíveis. Estágios detalhados aparecem quando o Apple Watch registra.'}
        </p>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barSize={data.length > 60 ? 4 : data.length > 30 ? 6 : 10}>
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
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [
                typeof value === 'number' ? `${value.toFixed(1)}h` : '—',
              ]}
            />
            <Legend
              formatter={(value) => (
                <span style={{ fontSize: 12, color: '#475569' }}>{value}</span>
              )}
            />
            <ReferenceLine y={7} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: '7h', position: 'right', fill: '#10b981', fontSize: 11 }} />
            {hasStages ? (
              <>
                <Bar dataKey="deep" stackId="sleep" fill="#1e3a5f" name="Profundo" radius={[0, 0, 0, 0]} />
                <Bar dataKey="rem" stackId="sleep" fill="#7c3aed" name="REM" />
                <Bar dataKey="core" stackId="sleep" fill="#3b82f6" name="Núcleo" />
                <Bar dataKey="awake" stackId="sleep" fill="#94a3b8" name="Acordado" radius={[3, 3, 0, 0]} />
              </>
            ) : (
              <>
                <Bar dataKey="total" fill="#0f766e" name="Total" radius={[3, 3, 0, 0]} />
                <Bar dataKey="rem" fill="#7c3aed" name="REM" radius={[3, 3, 0, 0]} />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
