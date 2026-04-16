import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WeeklyDayStats } from '@/hooks/useActivityAnalysis'

interface WeeklyPatternChartProps {
  pattern: WeeklyDayStats[]
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function WeeklyPatternChart({ pattern }: WeeklyPatternChartProps) {
  const data = pattern.map((d) => ({
    dia: d.dayName,
    exercicio: d.avgExercise != null ? Math.round(d.avgExercise) : null,
    energia: d.avgEnergy != null ? Math.round(d.avgEnergy) : null,
    luz: d.avgDaylight != null ? Math.round(d.avgDaylight) : null,
    n: d.count,
  }))

  const hasAnyData = data.some((d) => d.exercicio != null || d.energia != null)

  if (!hasAnyData) {
    return (
      <p className="mt-4 text-sm text-slate-400">
        Sem dados suficientes para o padrão semanal.
      </p>
    )
  }

  return (
    <div className="mt-4 h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barSize={18}>
          <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
          <XAxis
            dataKey="dia"
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="min"
            tick={{ fill: '#15803d', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => `${v}m`}
          />
          <YAxis
            yAxisId="kcal"
            orientation="right"
            tick={{ fill: '#ea580c', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(v: number) => `${v}kc`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => {
              if (typeof v !== 'number') return ['—', name]
              if (name === 'exercicio') return [`${v} min`, 'Exercício médio']
              if (name === 'energia') return [`${v} kcal`, 'Energia ativa média']
              return [`${v} min`, 'Luz do dia média']
            }}
          />
          <Legend
            formatter={(value) => {
              const labels: Record<string, string> = {
                exercicio: 'Exercício (min)',
                energia: 'Energia (kcal)',
                luz: 'Luz do dia (min)',
              }
              return (
                <span style={{ fontSize: 12, color: '#475569' }}>
                  {labels[value] ?? value}
                </span>
              )
            }}
          />
          <Bar
            yAxisId="min"
            dataKey="exercicio"
            fill="#15803d"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            name="exercicio"
          />
          <Bar
            yAxisId="kcal"
            dataKey="energia"
            fill="#ea580c"
            fillOpacity={0.55}
            radius={[3, 3, 0, 0]}
            name="energia"
          />
          <Line
            yAxisId="min"
            type="monotone"
            dataKey="luz"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 3, fill: '#f59e0b' }}
            connectNulls
            name="luz"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
