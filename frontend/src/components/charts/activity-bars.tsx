import { useMemo } from 'react'
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
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'

interface ActivityBarsProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function ActivityBars({ snapshots, forecastStartDate }: ActivityBarsProps) {
  const { data, avgEnergy, avgExercise, avgDaylight } = useMemo(() => {
    const rows = snapshots
      .filter((s) => s.health != null && (
        s.health.activeEnergyKcal != null ||
        s.health.exerciseMinutes != null ||
        s.health.daylightMinutes != null
      ))
      .map((s) => ({
        label: dayLabel(s.date),
        energia: s.health?.activeEnergyKcal ?? null,
        exercicio: s.health?.exerciseMinutes ?? null,
        luz: s.health?.daylightMinutes ?? null,
        interpolated: s.interpolated === true,
        forecasted: s.forecasted === true,
        forecastConfidence: s.forecastConfidence ?? null,
      }))
    const numeric = (values: Array<number | null>) => values.filter((value): value is number => value != null)
    const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null)
    return {
      data: rows,
      avgEnergy: mean(numeric(rows.map((row) => row.energia))),
      avgExercise: mean(numeric(rows.map((row) => row.exercicio))),
      avgDaylight: mean(numeric(rows.map((row) => row.luz))),
    }
  }, [snapshots])

  const verdict = useMemo(() => {
    if (avgEnergy == null && avgExercise == null) return null
    const energyText = avgEnergy != null ? `${Math.round(avgEnergy)} kcal/dia` : 'energia sem dado suficiente'
    const exerciseText = avgExercise != null ? `${Math.round(avgExercise)} min/dia` : 'exercício sem dado suficiente'
    const daylightText = avgDaylight != null ? `${Math.round(avgDaylight)} min/dia de luz` : 'luz sem dado suficiente'

    if ((avgExercise ?? 0) >= 30 && (avgEnergy ?? 0) >= 350) {
      return {
        text: `Movimento global em boa faixa (${energyText}, ${exerciseText}). Ritmo funcional sem sobrecarga aparente (${daylightText}).`,
        tone: 'good' as const,
      }
    }
    if ((avgExercise ?? 0) < 20 || (avgEnergy ?? 0) < 220) {
      return {
        text: `Movimento abaixo do ideal (${energyText}, ${exerciseText}). Vale buscar constância diária e exposição à luz (${daylightText}).`,
        tone: 'watch' as const,
      }
    }
    return {
      text: `Ritmo de movimento intermediário (${energyText}, ${exerciseText}). Dá para subir 10-15% sem forçar demais (${daylightText}).`,
      tone: 'neutral' as const,
    }
  }, [avgDaylight, avgEnergy, avgExercise])

  const verdictClass =
    verdict?.tone === 'good'
      ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
      : verdict?.tone === 'watch'
        ? 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-800'

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.activityBars, 'Atividade'),
    [snapshots],
  )

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Atividade</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Energia e Movimento</h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de atividade no período selecionado.</p>
      </div>
    )
  }

  const barSize = data.length > 60 ? 4 : data.length > 30 ? 6 : 10

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Atividade
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Energia e Movimento
      </h3>
      <p className="mt-1 text-sm text-slate-500">Energia ativa (kcal) · exercício e luz do dia (min)</p>
      {verdict && (
        <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
          <span className="font-semibold">Veredito:</span> {verdict.text}
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Sobre esta métrica</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Este painel usa dois eixos (kcal e minutos) para preservar unidade real de cada sinal. Compare
          tendências entre curvas e barras, não valores absolutos entre eixos.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barSize={barSize}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis
              yAxisId="kcal"
              tick={{ fill: '#ea580c', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}kcal`}
            />
            <YAxis
              yAxisId="min"
              orientation="right"
              tick={{ fill: '#475569', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v: number) => `${v}m`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name, item) => {
                const suffix = getDataSuffix(item)
                if (typeof v !== 'number') return ['—', name]
                if (name === 'energia') return [`${v.toFixed(0)} kcal${suffix}`, 'Energia ativa']
                if (name === 'exercicio') return [`${v.toFixed(0)} min${suffix}`, 'Exercício']
                return [`${v.toFixed(0)} min${suffix}`, 'Luz do dia']
              }}
            />
            <Legend formatter={(value) => {
              const labels: Record<string, string> = { energia: 'Energia (kcal)', exercicio: 'Exercício (min)', luz: 'Luz do dia (min)' }
              return <span style={{ fontSize: 12, color: '#475569' }}>{labels[value] ?? value}</span>
            }} />
            {forecastStartDate && <ReferenceLine x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />}
            <Bar yAxisId="kcal" dataKey="energia" fill="#ea580c" radius={[2, 2, 0, 0]} name="energia">
              {data.map((entry, i) => <Cell key={`e-${i}`} fillOpacity={entry.forecasted ? 0.35 : entry.interpolated ? 0.3 : 0.75} />)}
            </Bar>
            <Bar yAxisId="min" dataKey="exercicio" fill="#15803d" radius={[2, 2, 0, 0]} name="exercicio">
              {data.map((entry, i) => <Cell key={`x-${i}`} fillOpacity={entry.forecasted ? 0.35 : entry.interpolated ? 0.3 : 0.75} />)}
            </Bar>
            <Line yAxisId="min" type="monotone" dataKey="luz" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} name="luz" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </DataReadinessGate>
    </div>
  )
}
