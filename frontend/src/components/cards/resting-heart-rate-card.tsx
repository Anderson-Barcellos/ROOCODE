import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeRestingHeartRateSummary,
  type RestingHrBand,
  type RestingHrTrend,
} from '@/utils/resting-heart-rate'

interface RestingHeartRateCardProps {
  snapshots: DailySnapshot[]
}

const BAND_STYLE: Record<RestingHrBand, { label: string; cls: string }> = {
  otima: { label: 'Ótima', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  normal: { label: 'Normal', cls: 'border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  elevada: { label: 'Elevada', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  alta: { label: 'Alta', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

const TREND_LABEL: Record<RestingHrTrend, string> = {
  subindo: '↑ subindo',
  descendo: '↓ descendo',
  estavel: '→ estável',
}

export function RestingHeartRateCard({ snapshots }: RestingHeartRateCardProps) {
  const summary = useMemo(() => computeRestingHeartRateSummary(snapshots), [snapshots])
  if (!snapshots.length) return null

  const latest = summary.latest
  const band = latest?.band ?? null
  const badge = band
    ? BAND_STYLE[band]
    : { label: 'Coletando', cls: 'border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300' }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        FC de repouso
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Como está meu coração em repouso?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        FC de repouso vs faixas de risco cardiovascular. Estimulantes (Venvanse) elevam a frequência basal.
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-['Fraunces'] text-5xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
            {latest?.bpm != null ? latest.bpm.toFixed(0) : '--'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            bpm · última leitura{summary.trend ? ` · ${TREND_LABEL[summary.trend]}` : ''}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        média do período {summary.meanBpm != null ? `${summary.meanBpm.toFixed(0)} bpm` : '--'} · {summary.nightsUsed} dias
      </p>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Faixas de referência adulto: ótima &lt;65 · normal 65–75 · elevada 75–85 · alta ≥85 bpm. FC de repouso mais alta associa-se a maior risco cardiovascular (referência populacional, não diagnóstico). Anfetaminas são simpaticomiméticas e elevam a FC basal.
        </p>
      </details>
    </div>
  )
}
