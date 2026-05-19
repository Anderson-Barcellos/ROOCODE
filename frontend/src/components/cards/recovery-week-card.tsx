import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { computeRecoveryIndexSeries, rankRecoveryIndexComponents } from '@/utils/recovery-index'

const COMPONENT_LABEL = {
  sleep: 'arquitetura do sono',
  sleepDebt: 'débito de sono',
  hrv: 'HRV',
  rhr: 'FC de repouso',
  pulseTemp: 'temperatura noturna',
} as const

interface RecoveryWeekCardProps {
  snapshots: DailySnapshot[]
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function RecoveryWeekCard({ snapshots }: RecoveryWeekCardProps) {
  const summary = useMemo(() => {
    const series = computeRecoveryIndexSeries(snapshots).filter((point) => point.score != null && point.components != null)
    if (!series.length) return null
    const recent = series.slice(-7)
    const recentScores = recent.map((point) => point.score as number)
    const recentMean = mean(recentScores)
    const previousMean = mean(series.slice(-14, -7).map((point) => point.score as number))
    const delta = previousMean != null && recentMean != null ? recentMean - previousMean : null
    const best = [...recent].sort((left, right) => (right.score ?? 0) - (left.score ?? 0))[0]
    const worst = [...recent].sort((left, right) => (left.score ?? 0) - (right.score ?? 0))[0]
    const limiter = worst?.components ? rankRecoveryIndexComponents(worst.components, worst.inputsUsed)[0] : null
    return { recentMean, previousMean, delta, best, worst, limiter }
  }, [snapshots])

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Fechamento semanal
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Quanto a semana me reparou?</h3>

      {summary ? (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {summary.delta == null
              ? 'Ainda não há semana anterior suficiente para tendência.'
              : summary.delta >= 4
                ? 'Semana melhor que a anterior, com recuperação basal subindo.'
                : summary.delta <= -4
                  ? 'Semana mais pesada que a anterior, com queda perceptível na reparação.'
                  : 'Semana relativamente estável, sem grande mudança no índice basal.'}
            {summary.limiter ? ` O principal foco agora é ${COMPONENT_LABEL[summary.limiter.component]}.` : ''}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Média 7d</p>
              <p className="mt-2 font-['Fraunces'] text-4xl tracking-[-0.06em] text-slate-900">
                {summary.recentMean != null ? summary.recentMean.toFixed(0) : '--'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Melhor noite</p>
              <p className="mt-2 font-['Fraunces'] text-4xl tracking-[-0.06em] text-emerald-700">
                {summary.best?.score != null ? summary.best.score.toFixed(0) : '--'}
              </p>
              <p className="text-xs text-slate-500">{summary.best?.date ?? '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Pior noite</p>
              <p className="mt-2 font-['Fraunces'] text-4xl tracking-[-0.06em] text-rose-700">
                {summary.worst?.score != null ? summary.worst.score.toFixed(0) : '--'}
              </p>
              <p className="text-xs text-slate-500">{summary.worst?.date ?? '—'}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">Ainda sem série suficiente para fechar a semana.</p>
      )}
    </div>
  )
}
