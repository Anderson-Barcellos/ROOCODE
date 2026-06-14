import { useMemo } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { useConcentrationSeries } from '@/lib/api'
import { DEFAULT_PK_BODY_WEIGHT_KG } from '@/utils/pharmacokinetics'
import {
  computeStimulantCardiacLoad,
  type CardiacTarget,
} from '@/utils/stimulant-cardiac-load'
import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'

interface StimulantCardiacLoadCardProps {
  snapshots: DailySnapshot[]
}

const TARGET_LABEL: Record<CardiacTarget, string> = {
  restingHeartRate: 'FC de repouso',
  hrvSdnn: 'HRV (SDNN)',
}

const REASON_COPY: Record<string, { title: string; body: string }> = {
  insufficient_data: {
    title: 'Coletando dados',
    body: 'Faltam dias pareados (exposição + FC/HRV) para uma correlação confiável.',
  },
  insufficient_variance: {
    title: 'Variância insuficiente',
    body: 'A exposição ao estimulante varia pouco na janela — não dá pra isolar o efeito no coração sem variação real (fim de semana sem dose, doses puladas, mudança de regime).',
  },
}

export function StimulantCardiacLoadCard({ snapshots }: StimulantCardiacLoadCardProps) {
  const from = snapshots.length ? snapshots[0].date : ''
  const to = snapshots.length ? snapshots[snapshots.length - 1].date : ''
  const concentrationQuery = useConcentrationSeries('venvanse', from, to, DEFAULT_PK_BODY_WEIGHT_KG)

  const summary = useMemo(() => {
    const exposureByDate = new Map<string, number>()
    for (const point of concentrationQuery.data?.series ?? []) {
      exposureByDate.set(point.date, point.auc_est)
    }
    return computeStimulantCardiacLoad(snapshots, exposureByDate)
  }, [snapshots, concentrationQuery.data])

  if (!snapshots.length) return null

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Estimulante × coração
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Quanto o Venvanse custa ao meu coração?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Exposição diária ao estimulante × FC de repouso e HRV. Correlação, não causalidade.
      </p>

      {summary.reason !== 'ok' ? (
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-800/50 p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{REASON_COPY[summary.reason]?.title ?? 'Sem leitura'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{REASON_COPY[summary.reason]?.body}</p>
          {summary.exposureCv != null && (
            <p className="mt-2 text-[0.68rem] text-slate-400 dark:text-slate-500">variação da exposição (CV): {(summary.exposureCv * 100).toFixed(0)}%</p>
          )}
        </div>
      ) : (
        <>
          {summary.bestCell && summary.bestCell.r != null && (
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="font-['Fraunces'] text-4xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
                  r = {summary.bestCell.r.toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {TARGET_LABEL[summary.bestCell.target]} · lag {summary.bestCell.lag}d · n={summary.bestCell.n}
                  {summary.bestCell.qValue != null && ` · q=${summary.bestCell.qValue.toFixed(3)}`}
                </p>
              </div>
            </div>
          )}
          <div className="mt-4 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={CHART_TOKENS.ui.grid} strokeDasharray="3 3" />
                <XAxis type="number" dataKey="exposure" name="Exposição" tick={{ fontSize: 10, fill: CHART_TOKENS.ui.axis }} />
                <YAxis type="number" dataKey="value" name="FC repouso" tick={{ fontSize: 10, fill: CHART_TOKENS.ui.axis }} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={summary.scatter} fill={CHART_TOKENS.series.venvanse} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[0.68rem] text-slate-400 dark:text-slate-500">exposição diária ao Venvanse (×) vs FC de repouso (y)</p>
        </>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Lisdexanfetamina é simpaticomimética: tende a elevar a FC e reduzir a HRV de forma dose-dependente. Esta leitura é correlacional e exploratória — exige variação real na exposição para ter sinal, e nunca substitui avaliação clínica.
        </p>
      </details>
    </div>
  )
}
