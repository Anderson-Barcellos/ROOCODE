import { useMemo } from 'react'

import type { DailySnapshot, MedicationRow } from '@/types/apple-health'
import { buildDailyConcentrations, buildMedGroups } from '@/utils/medication-bridge'
import { PK_PRESETS } from '@/utils/pharmacokinetics'
import { pearson, type CorrelationResult } from '@/utils/statistics'

const COLORS: Record<string, string> = {
  escitalopram: '#0f766e',
  lisdexamfetamine: '#7c3aed',
  lamotrigine: '#2563eb',
  clonazepam: '#d97706',
  bacopa: '#16a34a',
  magnesium: '#0891b2',
  omega3: '#ea580c',
  vitamind3: '#ca8a04',
}

const STRENGTH_BADGE: Record<string, string> = {
  strong: 'bg-emerald-100 text-emerald-800',
  moderate: 'bg-amber-100 text-amber-800',
  weak: 'bg-slate-100 text-slate-600',
  negligible: 'bg-slate-50 text-slate-400',
}

const STRENGTH_LABEL: Record<string, string> = {
  strong: 'Forte',
  moderate: 'Moderada',
  weak: 'Fraca',
  negligible: 'Negligível',
}

interface MedCorrelation {
  presetKey: string
  name: string
  doses: number
  category: string
  result: CorrelationResult | null
}

interface PKConcentrationChartProps {
  medicationRows: MedicationRow[]
  dates: string[]
  snapshots?: DailySnapshot[]
}

export function PKConcentrationChart({ medicationRows, dates, snapshots }: PKConcentrationChartProps) {
  const correlations = useMemo<MedCorrelation[]>(() => {
    const groups = buildMedGroups(medicationRows)
    if (!groups.length || !dates.length) return []

    const dailyConc = buildDailyConcentrations(groups, dates)
    const moodValues = (snapshots ?? []).map((s) => s.mood?.valence ?? null)

    return groups.map((g) => {
      const concValues = dailyConc[g.presetKey] ?? []
      const result = (concValues.length >= 10 && moodValues.length >= 10)
        ? pearson(concValues, moodValues)
        : null
      const preset = PK_PRESETS[g.presetKey]
      return {
        presetKey: g.presetKey,
        name: preset?.name ?? g.presetKey,
        doses: g.doses.length,
        category: preset?.category ?? 'Other',
        result,
      }
    }).sort((a, b) => {
      if (a.result && b.result) return Math.abs(b.result.r) - Math.abs(a.result.r)
      if (a.result) return -1
      if (b.result) return 1
      return 0
    })
  }, [medicationRows, dates, snapshots])

  if (!correlations.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Medicamentos
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Impacto no humor
        </h3>
        <p className="mt-4 text-sm text-slate-400">
          Dados de medicação e humor insuficientes para calcular correlações.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Medicamentos
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Impacto no humor
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Pearson R entre concentração PK estimada (trend diário) e valência do humor. Requer sobreposição de datas entre meds e mood.
      </p>

      <div className="mt-5 space-y-2">
        {correlations.map((c) => (
          <div
            key={c.presetKey}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-900/10 bg-slate-50 px-4 py-3"
          >
            <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[c.presetKey] ?? '#94a3b8' }} />
            <div className="min-w-[120px]">
              <span className="text-sm font-semibold text-slate-800">{c.name}</span>
              <span className="ml-2 text-xs text-slate-400">{c.category}</span>
            </div>
            <span className="text-xs text-slate-400">{c.doses} doses</span>

            {c.result ? (
              <>
                <span className="font-mono text-sm font-bold text-slate-800">
                  R = {c.result.r.toFixed(3)}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STRENGTH_BADGE[c.result.strength]}`}>
                  {STRENGTH_LABEL[c.result.strength]}
                </span>
                <span className="text-xs text-slate-400">
                  p = {c.result.pValue < 0.001 ? '<0.001' : c.result.pValue.toFixed(3)}
                  {c.result.significant ? ' *' : ''}
                </span>
                <span className="text-xs text-slate-300">N={c.result.n}</span>
              </>
            ) : (
              <span className="text-xs text-slate-400">Dados insuficientes (mín. 10 pares)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
