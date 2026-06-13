import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeSleepContinuitySummary,
  type EfficiencyBand,
  type WasoBand,
} from '@/utils/sleep-continuity'

interface SleepContinuityCardProps {
  snapshots: DailySnapshot[]
}

const EFF_STYLE: Record<EfficiencyBand, { label: string; cls: string }> = {
  ideal: { label: 'Ideal', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  limitrofe: { label: 'Limítrofe', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  pobre: { label: 'Pobre', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

const WASO_STYLE: Record<WasoBand, { label: string; cls: string }> = {
  ideal: { label: 'Ideal', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  limitrofe: { label: 'Limítrofe', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  fragmentado: { label: 'Fragmentado', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

export function SleepContinuityCard({ snapshots }: SleepContinuityCardProps) {
  const summary = useMemo(() => computeSleepContinuitySummary(snapshots), [snapshots])
  if (!snapshots.length) return null

  const latest = summary.latest
  const effPct = latest?.efficiencyPct ?? null
  const wasoMin = latest?.wasoHours != null ? latest.wasoHours * 60 : null

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Continuidade
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Meu sono foi contínuo?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Eficiência (tempo dormindo sobre tempo na cama) e WASO (tempo acordado após adormecer), contra faixas AASM.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Eficiência</p>
            {latest?.efficiencyBand && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${EFF_STYLE[latest.efficiencyBand].cls}`}>
                {EFF_STYLE[latest.efficiencyBand].label}
              </span>
            )}
          </div>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{effPct != null ? `${effPct.toFixed(0)}%` : '--'}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            média {summary.meanEfficiencyPct != null ? `${summary.meanEfficiencyPct.toFixed(0)}%` : '--'} · ideal ≥85%
          </p>
        </article>

        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">WASO</p>
            {latest?.wasoBand && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${WASO_STYLE[latest.wasoBand].cls}`}>
                {WASO_STYLE[latest.wasoBand].label}
              </span>
            )}
          </div>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{wasoMin != null ? `${wasoMin.toFixed(0)} min` : '--'}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            média {summary.meanWasoHours != null ? `${(summary.meanWasoHours * 60).toFixed(0)} min` : '--'} · ideal &lt;30min
          </p>
        </article>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Eficiência ≥85% e WASO &lt;30min são thresholds AASM de sono consolidado. Sem latência de início (o export não separa o horário de deitar do adormecer). Leitura direta, não diagnóstico.
        </p>
      </details>
    </div>
  )
}
