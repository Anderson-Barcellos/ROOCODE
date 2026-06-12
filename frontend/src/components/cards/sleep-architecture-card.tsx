import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeSleepArchitectureSummary,
  type StageBand,
} from '@/utils/sleep-architecture'

interface SleepArchitectureCardProps {
  snapshots: DailySnapshot[]
}

const BAND_STYLE: Record<StageBand, { label: string; cls: string }> = {
  ideal: {
    label: 'Ideal',
    cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  baixo: {
    label: 'Baixo',
    cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  alto: {
    label: 'Alto',
    cls: 'border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
}

function pct(value: number | null): string {
  return value != null ? `${value.toFixed(0)}%` : '--'
}

export function SleepArchitectureCard({ snapshots }: SleepArchitectureCardProps) {
  const summary = useMemo(() => computeSleepArchitectureSummary(snapshots), [snapshots])

  if (!snapshots.length) return null

  const latest = summary.latest
  const score = latest?.score ?? null
  const scoreBadge =
    score == null
      ? { label: 'Coletando', cls: 'border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300' }
      : score >= 80
        ? { label: 'Reparadora', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
        : score >= 60
          ? { label: 'Parcial', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' }
          : { label: 'Pobre', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Estrutura do sono
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Quão reparadora foi a estrutura?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Fração de Deep e REM sobre os estágios classificados, comparada a faixas de referência.
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-['Fraunces'] text-5xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
            {score != null ? score.toFixed(0) : '--'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {score != null ? 'score reparador · última noite' : 'estágios indisponíveis na noite'}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${scoreBadge.cls}`}>
          {scoreBadge.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Deep</p>
            {latest?.deepBand && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${BAND_STYLE[latest.deepBand].cls}`}>
                {BAND_STYLE[latest.deepBand].label}
              </span>
            )}
          </div>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{pct(latest?.pctDeep ?? null)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            média {pct(summary.meanPctDeep)} · ref. 13–23%
          </p>
        </article>

        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">REM</p>
            {latest?.remBand && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${BAND_STYLE[latest.remBand].cls}`}>
                {BAND_STYLE[latest.remBand].label}
              </span>
            )}
          </div>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{pct(latest?.pctRem ?? null)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            média {pct(summary.meanPctRem)} · ref. 20–25%
          </p>
        </article>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          O denominador é a soma de Deep + REM + Core (estágios classificados), não o total do Apple, que sobrepõe os estágios.
          As faixas são referências populacionais adultas — Deep abaixo do piso é o sinal mais relevante. Não é diagnóstico.
        </p>
      </details>
    </div>
  )
}
