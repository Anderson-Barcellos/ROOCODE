import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeLatestSocialJetLag,
  computeSleepRegularitySeries,
} from '@/utils/sleep-regularity'

interface SleepRegularityCardProps {
  snapshots: DailySnapshot[]
}

function formatClock(minutes: number | null): string {
  if (minutes == null) return '—'
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const mins = normalized % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

export function SleepRegularityCard({ snapshots }: SleepRegularityCardProps) {
  const regularity = useMemo(() => {
    const series = computeSleepRegularitySeries(snapshots)
    for (let index = series.length - 1; index >= 0; index -= 1) {
      if (series[index].score != null) return series[index]
    }
    return series.at(-1) ?? null
  }, [snapshots])

  const socialJetLag = useMemo(() => computeLatestSocialJetLag(snapshots), [snapshots])

  if (!snapshots.length) return null

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Regularidade circadiana
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Como dormi ao longo da rotina?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Regularidade de horários e diferença entre dias úteis e fim de semana.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Sleep Regularity Index</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="font-['Fraunces'] text-4xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
                {regularity?.score != null ? regularity.score.toFixed(0) : '--'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {regularity?.score != null ? `${regularity.nightsUsed} noites válidas` : 'coletando horários'}
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
              regularity?.score == null
                ? 'border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                : regularity.score >= 75
                  ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : regularity.score >= 55
                    ? 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
            }`}>
              {regularity?.score == null ? 'Coletando' : regularity.score >= 75 ? 'Regular' : regularity.score >= 55 ? 'Oscilando' : 'Irregular'}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Desvio médio: início {regularity?.onsetDeviationMinutes != null ? `${Math.round(regularity.onsetDeviationMinutes)} min` : '—'} ·
            fim {regularity?.offsetDeviationMinutes != null ? ` ${Math.round(regularity.offsetDeviationMinutes)} min` : ' —'}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Social Jet Lag</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="font-['Fraunces'] text-4xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
                {socialJetLag.hours != null ? socialJetLag.hours.toFixed(1) : '--'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {socialJetLag.hours != null ? 'horas de diferença' : 'split útil × fim de semana insuficiente'}
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
              socialJetLag.hours == null
                ? 'border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                : socialJetLag.hours <= 1
                  ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : socialJetLag.hours <= 2
                    ? 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
            }`}>
              {socialJetLag.hours == null ? 'Coletando' : socialJetLag.hours <= 1 ? 'Baixo' : socialJetLag.hours <= 2 ? 'Moderado' : 'Alto'}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Midsono útil {formatClock(socialJetLag.weekdayMidpointMinutes)} · fim de semana {formatClock(socialJetLag.weekendMidpointMinutes)}
          </p>
        </article>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          O SRI aqui é uma proxy baseada em consistência de onset/offset, marcada como exploratória enquanto o histórico ainda amadurece.
          O social jet lag usa a diferença do midsono entre dias úteis e fins de semana.
        </p>
      </details>
    </div>
  )
}
