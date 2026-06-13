import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeBloodPressureSummary,
  type BpClass,
} from '@/utils/blood-pressure'

interface BloodPressureCardProps {
  snapshots: DailySnapshot[]
  collectingMin?: number
}

const CLASS_STYLE: Record<BpClass, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  elevada: { label: 'Elevada', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  has1: { label: 'HAS estágio 1', cls: 'border-orange-200 dark:border-orange-400/30 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  has2: { label: 'HAS estágio 2', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

const DORMANT_TARGET = 10 // espelha collectingMin de bloodPressureIndex

export function BloodPressureCard({ snapshots, collectingMin = DORMANT_TARGET }: BloodPressureCardProps) {
  const summary = useMemo(() => computeBloodPressureSummary(snapshots), [snapshots])
  if (!snapshots.length) return null

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Pressão arterial
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Como está minha pressão?</h3>

      {summary.dormant ? (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Card dormente — acende quando houver medições suficientes no manguito.
          </p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-['Fraunces'] text-5xl tracking-[-0.06em] text-slate-400 dark:text-slate-500">
                {summary.measurementsUsed}<span className="text-2xl text-slate-400 dark:text-slate-600">/{collectingMin}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">medições coletadas</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 dark:text-slate-300">
              Coletando
            </span>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            O Apple Watch não mede pressão — registra só quando tu usas o manguito. Meça com regularidade pra ativar a classificação ACC/AHA aqui.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Média recente vs classificação ACC/AHA 2017.
          </p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-['Fraunces'] text-5xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
                {summary.meanSystolic != null ? summary.meanSystolic.toFixed(0) : '--'}
                <span className="text-2xl text-slate-400 dark:text-slate-500">/{summary.meanDiastolic != null ? summary.meanDiastolic.toFixed(0) : '--'}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">mmHg · média de {summary.measurementsUsed} medições</p>
            </div>
            {summary.classification && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${CLASS_STYLE[summary.classification].cls}`}>
                {CLASS_STYLE[summary.classification].label}
              </span>
            )}
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
              Contexto clínico
            </summary>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              ACC/AHA 2017: normal &lt;120/80 · elevada 120–129 e &lt;80 · HAS estágio 1: 130–139 ou 80–89 · HAS estágio 2: ≥140 ou ≥90. Medições de manguito, não diagnóstico — confirme com aferição clínica.
            </p>
          </details>
        </>
      )}
    </div>
  )
}
