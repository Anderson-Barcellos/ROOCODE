import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeRespiratoryLoadSummary,
  type AhiBand,
} from '@/utils/respiratory-load'

interface RespiratoryLoadCardProps {
  snapshots: DailySnapshot[]
}

const BAND_STYLE: Record<AhiBand, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  leve: { label: 'Leve', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  moderada: { label: 'Moderada', cls: 'border-orange-200 dark:border-orange-400/30 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  grave: { label: 'Grave', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

function fmt(value: number | null, digits = 1, suffix = ''): string {
  return value != null ? `${value.toFixed(digits)}${suffix}` : '--'
}

export function RespiratoryLoadCard({ snapshots }: RespiratoryLoadCardProps) {
  const summary = useMemo(() => computeRespiratoryLoadSummary(snapshots), [snapshots])
  if (!snapshots.length) return null

  const latest = summary.latest
  const band = summary.currentBand
  const bandStyle = band
    ? BAND_STYLE[band]
    : { label: 'Coletando', cls: 'border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300' }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Respiração noturna
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Como respirei dormindo?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Distúrbios respiratórios (proxy de AHI da Apple, agregado por noite) com SpO₂ e taxa respiratória como co-sinais.
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-['Fraunces'] text-5xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
            {fmt(summary.meanDisturbances, 2)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">eventos/h · média recente</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${bandStyle.cls}`}>
          {bandStyle.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Última noite</p>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{fmt(latest?.disturbances ?? null, 2)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{latest?.atypical ? 'atípica pra ti' : 'dentro do teu padrão'}</p>
        </article>
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">SpO₂</p>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{fmt(latest?.spo2 ?? null, 0, '%')}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{latest?.desaturationFlag ? 'abaixo do teu piso' : 'estável'}</p>
        </article>
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Taxa resp.</p>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{fmt(latest?.respiratoryRate ?? null, 0)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">resp/min</p>
        </article>
      </div>

      {summary.coOccurrenceNights > 0 && (
        <p className="mt-4 rounded-2xl border border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-700 dark:text-rose-300">
          <span className="font-semibold">Atenção:</span> {summary.coOccurrenceNights} noite(s) na janela com distúrbios atípicos E dessaturação juntos — vale observar.
        </p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Proxy de AHI: &lt;5 normal, 5–15 leve, 15–30 moderada, &gt;30 grave (AASM). O dado é uma taxa média por noite, não episódios individuais. "Atípica pra ti" usa o p90 da tua distribuição pessoal (30 dias). Vigilância de tendência, não diagnóstico.
        </p>
      </details>
    </div>
  )
}
