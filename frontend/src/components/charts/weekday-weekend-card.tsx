import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { useForecastSummary, type ForecastSummaryInputSnapshot } from '@/lib/api'

interface WeekdayWeekendCardProps {
  snapshots: DailySnapshot[]
}

// Campos comparados — escolhidos pelo valor clínico (humor + autonômico + sono + cardio).
// Ordem importa: a lista preserva hierarquia visual no card.
const COMPARISON_FIELDS = [
  { key: 'sleepTotalHours', label: 'Sono', unit: 'h', digits: 1 },
  { key: 'hrvSdnn', label: 'HRV', unit: 'ms', digits: 0 },
  { key: 'restingHeartRate', label: 'FC Repouso', unit: 'bpm', digits: 0, lowerIsBetter: true },
  { key: 'valence', label: 'Humor', unit: '', digits: 2 },
] as const

function formatDelta(delta: number | null, digits: number, unit: string): string {
  if (delta == null) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(digits)}${unit}`
}

function deltaTone(
  delta: number | null,
  lowerIsBetter: boolean,
): 'positive' | 'negative' | 'neutral' {
  if (delta == null || Math.abs(delta) < 1e-6) return 'neutral'
  const goodWhenPositive = !lowerIsBetter
  const isPositive = delta > 0
  return isPositive === goodWhenPositive ? 'positive' : 'negative'
}

export function WeekdayWeekendCard({ snapshots }: WeekdayWeekendCardProps) {
  const apiInput: ForecastSummaryInputSnapshot[] = useMemo(
    () =>
      snapshots.map((s) => ({
        date: s.date,
        values: {
          sleepTotalHours: s.health?.sleepTotalHours ?? null,
          hrvSdnn: s.health?.hrvSdnn ?? null,
          restingHeartRate: s.health?.restingHeartRate ?? null,
          activeEnergyKcal: s.health?.activeEnergyKcal ?? null,
          exerciseMinutes: s.health?.exerciseMinutes ?? null,
          valence: s.mood?.valence ?? null,
        },
      })),
    [snapshots],
  )

  const { data, isLoading, error } = useForecastSummary(apiInput)

  const clinicalCallout = useMemo(() => {
    if (!data) return null
    const hrv = data.weekday_effect.hrvSdnn
    const rhr = data.weekday_effect.restingHeartRate
    const hrvDelta = hrv?.weekend_minus_weekday ?? null
    const hrvWeek = hrv?.weekday_mean ?? null
    const rhrDelta = rhr?.weekend_minus_weekday ?? null
    const rhrWeek = rhr?.weekday_mean ?? null

    const hrvPct =
      hrvDelta != null && hrvWeek != null && hrvWeek > 0
        ? (hrvDelta / hrvWeek) * 100
        : null
    const rhrPct =
      rhrDelta != null && rhrWeek != null && rhrWeek > 0
        ? (rhrDelta / rhrWeek) * 100
        : null

    if (hrvDelta == null && rhrDelta == null) return null

    return {
      hrvDelta,
      hrvPct,
      rhrDelta,
      rhrPct,
      improvedOnWeekend: (hrvDelta ?? 0) > 0 && (rhrDelta ?? 0) < 0,
    }
  }, [data])

  if (snapshots.length < 7) {
    return null
  }

  return (
    <section className="rounded-2xl border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Ritmo semanal
          </p>
          <h3 className="text-base font-semibold text-slate-800">
            Semana × fim de semana
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Como cada métrica muda nos dias úteis vs. sábado/domingo. Útil pra detectar
            efeitos de regime farmacológico off-weekend (ex.: estimulantes pausados).
          </p>
        </div>
        {data && (
          <p className="text-xs text-slate-500">{data.context_days} dias</p>
        )}
      </header>

      {clinicalCallout && (
        <p className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-900 dark:text-emerald-200">
          <span className="font-semibold">
            {clinicalCallout.improvedOnWeekend
              ? 'Seu corpo descansa de verdade no fim de semana.'
              : 'Semana × FDS com diferença fisiológica relevante.'}
          </span>{' '}
          {clinicalCallout.hrvDelta != null && (
            <>
              Δ HRV {clinicalCallout.hrvDelta >= 0 ? '+' : ''}
              {clinicalCallout.hrvDelta.toFixed(0)}ms
              {clinicalCallout.hrvPct != null
                ? ` (${clinicalCallout.hrvPct >= 0 ? '+' : ''}${clinicalCallout.hrvPct.toFixed(0)}%)`
                : ''}
            </>
          )}
          {clinicalCallout.hrvDelta != null && clinicalCallout.rhrDelta != null ? ' · ' : ''}
          {clinicalCallout.rhrDelta != null && (
            <>
              Δ FC repouso {clinicalCallout.rhrDelta >= 0 ? '+' : ''}
              {clinicalCallout.rhrDelta.toFixed(0)}bpm
              {clinicalCallout.rhrPct != null
                ? ` (${clinicalCallout.rhrPct >= 0 ? '+' : ''}${clinicalCallout.rhrPct.toFixed(0)}%)`
                : ''}
            </>
          )}
        </p>
      )}

      {isLoading && (
        <p className="text-sm text-slate-500">Calculando agregados…</p>
      )}

      {error && (
        <p className="text-sm text-rose-700 dark:text-rose-300">
          Erro ao carregar resumo semanal.
        </p>
      )}

      {data && (
        <div className="space-y-3">
          {COMPARISON_FIELDS.map((field) => {
            const eff = data.weekday_effect[field.key]
            const wd = eff?.weekday_mean ?? null
            const we = eff?.weekend_mean ?? null
            const delta = eff?.weekend_minus_weekday ?? null
            const max = Math.max(Math.abs(wd ?? 0), Math.abs(we ?? 0)) * 1.1 || 1
            const wdPct = wd != null ? Math.min(100, (Math.abs(wd) / max) * 100) : 0
            const wePct = we != null ? Math.min(100, (Math.abs(we) / max) * 100) : 0
            const tone = deltaTone(delta, 'lowerIsBetter' in field ? field.lowerIsBetter : false)
            const deltaColor =
              tone === 'positive'
                ? 'text-emerald-700 dark:text-emerald-300'
                : tone === 'negative'
                ? 'text-rose-700 dark:text-rose-300'
                : 'text-slate-500'

            return (
              <div key={field.key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{field.label}</span>
                  <span className={`text-xs font-semibold ${deltaColor}`}>
                    Δ {formatDelta(delta, field.digits, field.unit)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-600">
                  <div>
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="uppercase tracking-wider">Sem.</span>
                      <span className="font-mono text-slate-700">
                        {wd != null ? `${wd.toFixed(field.digits)}${field.unit}` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-400"
                        style={{ width: `${wdPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="uppercase tracking-wider">FdS</span>
                      <span className="font-mono text-slate-700">
                        {we != null ? `${we.toFixed(field.digits)}${field.unit}` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${wePct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
