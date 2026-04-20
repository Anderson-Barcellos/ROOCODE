import { useMemo, useState } from 'react'
import { Clock } from 'lucide-react'

import { useDoses, useSubstances } from '@/lib/api'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { buildAdherenceStats } from '@/utils/intraday-correlation'

const WINDOW_OPTIONS = [
  { key: 7, label: '7d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
]

function hhmm(hour: number | null, minute: number | null): string {
  if (hour == null || minute == null) return '—'
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function scoreColor(score: number | null): { border: string; bg: string; text: string } {
  if (score == null) return { border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-600' }
  if (score >= 0.8) return { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700' }
  if (score >= 0.5) return { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' }
  return { border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700' }
}

function scoreLabel(score: number | null): string {
  if (score == null) return 'Sem dados'
  if (score >= 0.8) return 'Muito regular'
  if (score >= 0.5) return 'Razoável'
  return 'Disperso'
}

export function MedicationAdherenceChart() {
  const { data: substances = [] } = useSubstances()
  const [windowDays, setWindowDays] = useState<number>(30)
  const { data: doses = [] } = useDoses(windowDays * 24)

  const stats = useMemo(
    () => buildAdherenceStats(doses, substances, windowDays),
    [doses, substances, windowDays],
  )

  const totalDoses = stats.reduce((a, s) => a + s.doseCount, 0)

  const readiness = useMemo(
    () =>
      evaluateReadiness([], CHART_REQUIREMENTS.medicationAdherence, 'Regularidade de doses', {
        pairCount: totalDoses,
      }),
    [totalDoses],
  )

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Descritivo · Aderência
      </span>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Regularidade de horários por substância
        </h3>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setWindowDays(opt.key)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                windowDays === opt.key
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Desvio padrão dos minutos-do-dia em que cada dose foi tomada. Score de 1 = tomadas no mesmo horário sempre; 0 = caótico.
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Por que isso importa clinicamente</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Para medicações com <strong>t½ curta</strong> (Venvanse, clonazepam) e steady-state sensível,
          variação de horário maior que a meia-vida já muda a curva plasmática do dia. Para{' '}
          <strong>t½ longa</strong> (lamotrigina, escitalopram), atrasos de até 4-6h costumam ter impacto clínico menor.
          O score aqui é descritivo — te mostra quais tu está sendo mais disciplinado.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
        {stats.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Nenhuma dose nas últimas {windowDays} dias.</p>
        ) : (
          <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {stats.map((s) => {
              const colors = scoreColor(s.regularityScore)
              return (
                <div
                  key={s.medicationId}
                  className="rounded-[1rem] border border-slate-900/10 bg-white/80 p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-['Fraunces'] text-lg tracking-[-0.03em] text-slate-900">
                      {s.medicationName}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors.border} ${colors.bg} ${colors.text}`}
                    >
                      {scoreLabel(s.regularityScore)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
                        <Clock className="inline h-3 w-3 mr-1" />Mediana
                      </div>
                      <div className="text-base font-semibold text-slate-900 mt-1">
                        {hhmm(s.medianHour, s.medianMinute)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
                        ±min
                      </div>
                      <div className="text-base font-semibold text-slate-900 mt-1">
                        {s.stdDevMinutes != null ? Math.round(s.stdDevMinutes) : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${
                        (s.regularityScore ?? 0) >= 0.8
                          ? 'bg-emerald-500'
                          : (s.regularityScore ?? 0) >= 0.5
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${((s.regularityScore ?? 0) * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {s.doseCount} {s.doseCount === 1 ? 'dose' : 'doses'} · score{' '}
                    {s.regularityScore != null ? s.regularityScore.toFixed(2) : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DataReadinessGate>
    </div>
  )
}
