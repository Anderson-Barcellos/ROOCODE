import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import { dayLabel } from '@/utils/aggregation'
import {
  computeActivityReadiness,
  type ActivityReadinessFactor,
  type ActivityReadinessTone,
} from '@/utils/activity-readiness'
import { computeRecoveryScoreSeries } from '@/utils/recovery-score'

interface ActivityReadinessCardProps {
  snapshots: DailySnapshot[]
}

const TONE_COLORS: Record<ActivityReadinessTone, string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  watch: 'border-amber-200 bg-amber-50 text-amber-700',
  negative: 'border-rose-200 bg-rose-50 text-rose-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
}

function formatValue(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (unit === 'passos') return `${Math.round(value).toLocaleString('pt-BR')} passos`
  if (unit === 'km/h') return `${value.toFixed(2)} km/h`
  if (unit === 'cm') return `${value.toFixed(1)} cm`
  if (unit === '%') return `${value.toFixed(1)}%`
  if (unit === 'kcal') return `${value.toFixed(0)} kcal`
  return `${value.toFixed(2)} ${unit}`
}

function FactorChip({ factor }: { factor: ActivityReadinessFactor }) {
  return (
    <div className={`rounded-full border px-3 py-1.5 text-xs ${TONE_COLORS[factor.tone]}`}>
      <span className="font-semibold">{factor.label}</span>{' '}
      <span className="opacity-80">{factor.score != null ? `${Math.round(factor.score)}/100` : 'sem baseline'}</span>
    </div>
  )
}

export function ActivityReadinessCard({ snapshots }: ActivityReadinessCardProps) {
  const result = useMemo(() => computeActivityReadiness(snapshots), [snapshots])
  const rankedFactors = result.factors
    .filter((factor) => factor.score != null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
  const topFactors = rankedFactors.slice(0, 3)

  // Cross-check com Recovery Score do mesmo dia (data desse card).
  // Antes da auditoria 2026-05-15, era possível exibir "Recovery ruim" +
  // "Readiness: usar energia" lado a lado sem aviso. Mostramos uma flag de
  // contradição quando readiness sugere alta atividade mas recovery está baixo.
  const recoveryAtSameDate = useMemo(() => {
    if (!result.date) return null
    const series = computeRecoveryScoreSeries(snapshots)
    const point = series.find((p) => p.date === result.date)
    return point?.score ?? null
  }, [snapshots, result.date])

  const showContradiction =
    result.score != null && result.score >= 75 &&
    recoveryAtSameDate != null && recoveryAtSameDate < 50

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Prontidão de movimento{result.date ? ` · ${dayLabel(result.date)}` : ''}
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            {result.headline}
          </h3>
          <p className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
            <span className="font-semibold">Veredito:</span> {result.summary}
          </p>
        </div>
        <CardScoreBadge
          label="Score"
          value={result.score != null ? result.score.toFixed(0) : '—'}
        />
      </div>

      {showContradiction && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          <span className="font-semibold">Atenção contradição:</span> readiness sugere usar energia (
          {result.score!.toFixed(0)}/100), mas Recovery Score do mesmo dia está em{' '}
          {recoveryAtSameDate!.toFixed(0)}/100. Sono/HRV/débito podem estar pesando contra —
          considere reavaliar antes de carga alta.
        </div>
      )}

      {topFactors.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {topFactors.map((factor) => (
            <FactorChip key={factor.key} factor={factor} />
          ))}
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Como o card decidiu
        </summary>
        <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
          {result.factors.map((factor) => (
            <div key={factor.key} className="grid gap-2 sm:grid-cols-[1fr_130px_130px_1.3fr]">
              <span className="font-medium text-slate-700">{factor.label}</span>
              <span>Hoje: {formatValue(factor.value, factor.unit)}</span>
              <span>Base: {formatValue(factor.baseline, factor.unit)}</span>
              <span className={factor.tone === 'negative' ? 'text-rose-700' : factor.tone === 'watch' ? 'text-amber-700' : 'text-slate-500'}>
                {factor.message}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
