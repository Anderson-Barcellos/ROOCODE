import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'

interface MoodDonutProps {
  snapshots: DailySnapshot[]
}

const CLASS_COLORS: Record<string, string> = {
  'Muito Agradável': '#15803d',
  'Agradável': '#4ade80',
  'Levemente Agradável': '#bbf7d0',
  'Neutro': '#fbbf24',
  'Levemente Desagradável': '#fdba74',
  'Desagradável': '#f97316',
  'Muito Desagradável': '#dc2626',
}

const CLASS_ORDER = [
  'Muito Agradável',
  'Agradável',
  'Levemente Agradável',
  'Neutro',
  'Levemente Desagradável',
  'Desagradável',
  'Muito Desagradável',
]

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function MoodDonut({ snapshots }: MoodDonutProps) {
  const { segments, totalEntries, avgValence, totalDays, daysWithMood } = useMemo(() => {
    const counts: Record<string, number> = {}
    let totalValence = 0
    let totalWithValence = 0
    let totalEntries = 0

    for (const s of snapshots) {
      if (!s.mood) continue
      totalEntries += s.mood.entryCount

      if (s.mood.valence != null) {
        totalValence += s.mood.valence
        totalWithValence++
      }

      const cls = s.mood.valenceClass
      if (cls) {
        counts[cls] = (counts[cls] ?? 0) + 1
      }
    }

    const segments = CLASS_ORDER
      .filter((cls) => (counts[cls] ?? 0) > 0)
      .map((cls) => ({
        name: cls,
        value: counts[cls] ?? 0,
        color: CLASS_COLORS[cls] ?? '#94a3b8',
      }))

    const avgValence = totalWithValence > 0 ? totalValence / totalWithValence : null

    return {
      segments,
      totalEntries,
      avgValence,
      totalDays: snapshots.length,
      daysWithMood: totalWithValence,
    }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.moodDonut, 'Humor'),
    [snapshots],
  )

  if (!segments.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">Humor</span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Distribuição</h3>
        <p className="mt-4 text-sm text-slate-400">Sem registros de humor disponíveis.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Humor
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Distribuição
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {daysWithMood} dos {totalDays} dias do período
      </p>

      <DataReadinessGate readiness={readiness}>
      <div className="relative mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {segments.map((seg) => (
                <Cell key={seg.name} fill={seg.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : 0
                const total = segments.reduce((a, s) => a + s.value, 0)
                const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0'
                return [`${n} dias (${pct}%)`]
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold tracking-[-0.04em] text-slate-900">{totalEntries}</span>
          <span className="text-xs text-slate-500">registros</span>
          {avgValence != null && (
            <span className="mt-1 text-sm font-semibold text-slate-600">
              R̄ = {avgValence.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {segments.map((seg) => {
          const total = segments.reduce((a, s) => a + s.value, 0)
          const pct = total > 0 ? ((seg.value / total) * 100).toFixed(0) : '0'
          return (
            <div key={seg.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="flex-1 truncate text-xs text-slate-600">{seg.name}</span>
              <span className="text-xs font-semibold text-slate-500">{pct}%</span>
            </div>
          )
        })}
      </div>
      </DataReadinessGate>
    </div>
  )
}
