import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import {
  computeRecoveryIndexSeries,
  rankRecoveryIndexComponents,
  RECOVERY_INDEX_WEIGHTS,
  type RecoveryIndexComponentKey,
  type RecoveryIndexPoint,
} from '@/utils/recovery-index'

interface RecoveryIndexCardProps {
  snapshots: DailySnapshot[]
  windowLabel?: string
  variant?: 'full' | 'summary'
}

const COMPONENT_LABEL: Record<RecoveryIndexComponentKey, string> = {
  sleep: 'Arquitetura do sono',
  sleepDebt: 'Débito de sono',
  hrv: 'HRV',
  rhr: 'FC de repouso',
  pulseTemp: 'Temp. do pulso',
}

function confidenceMeta(point: RecoveryIndexPoint | null) {
  if (!point || point.score == null) {
    return {
      label: 'Coletando',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    }
  }
  if (point.exploratory) {
    return {
      label: 'Exploratório',
      className: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }
  if (point.completeness < 1 || point.confidence < 0.9) {
    return {
      label: 'Parcial',
      className: 'border-indigo-200 dark:border-indigo-400/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    }
  }
  return {
    label: 'Robusto',
    className: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  }
}

function latestCompletePoint(points: RecoveryIndexPoint[]): RecoveryIndexPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].score != null) return points[index]
  }
  return null
}

export function RecoveryIndexCard({
  snapshots,
  windowLabel,
  variant = 'full',
}: RecoveryIndexCardProps) {
  const point = useMemo(() => {
    const series = computeRecoveryIndexSeries(snapshots)
    return latestCompletePoint(series)
  }, [snapshots])

  if (!snapshots.length) return null

  const badge = confidenceMeta(point)
  const ranked = point?.components ? rankRecoveryIndexComponents(point.components, point.inputsUsed) : []
  const dateLabel = point ? format(parseISO(point.date), "d 'de' MMM", { locale: ptBR }) : '—'

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Recovery Index
            {windowLabel ? (
              <span className="ml-1.5 text-[0.6rem] font-normal opacity-70">· janela {windowLabel}</span>
            ) : null}
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Quanto meu corpo recuperou?
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Síntese basal de sono, débito acumulado, HRV, FC de repouso e temperatura noturna.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
            {point?.derivedFromInterpolated && (
              <span className="inline-flex items-center rounded-full border border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 text-[0.72rem] font-semibold text-amber-700 dark:text-amber-300">
                Dia estimado
              </span>
            )}
          </div>
        </div>

        <CardScoreBadge
          label="Último índice"
          value={point?.score != null ? point.score.toFixed(0) : '--'}
          band={point?.score != null ? '/100' : 'sem índice'}
          hint={dateLabel}
          valueColorClass={point?.score != null && point.score >= 70 ? 'text-emerald-700 dark:text-emerald-300' : point?.score != null && point.score < 40 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900'}
        />
      </div>

      {point?.score == null || !point.components ? (
        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          Faltam inputs suficientes para compor o índice com segurança.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {ranked.map(({ component, score }) => (
            <div key={component}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{COMPONENT_LABEL[component]}</span>
                <span className="text-xs font-semibold text-slate-500">
                  {Math.round(RECOVERY_INDEX_WEIGHTS[component] * 100)}% · {score.toFixed(0)}/100
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.max(6, score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === 'full' && point?.components ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
            Contexto clínico
          </summary>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Índice composto com baseline pessoal. Baselines abaixo de 30 dias válidos ficam marcadas como exploratórias,
            e inputs ausentes rebaixam a confiança em vez de inflar o score artificialmente.
          </p>
        </details>
      ) : null}
    </div>
  )
}
