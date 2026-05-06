import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { computeSleepDebt } from '@/utils/sleep-debt'
import { laggedPairs, pearson, type CorrelationResult } from '@/utils/statistics'

interface SleepDebtHrvCardProps {
  snapshots: DailySnapshot[]
}

interface LagResult {
  lag: number
  label: string
  result: CorrelationResult | null
}

export function SleepDebtHrvCard({ snapshots }: SleepDebtHrvCardProps) {
  const lagResults = useMemo<LagResult[]>(() => {
    const debt = computeSleepDebt(snapshots)
    const debtValues = debt.map((p) => p.debt_cumulative_7d)
    const hrvValues = snapshots.map((s) => s.health?.hrvSdnn ?? null)

    const lag1 = (() => {
      const pairs = laggedPairs(debtValues, hrvValues, 1)
      if (pairs.length < 10) return null
      return pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1]),
      )
    })()

    return [
      { lag: 0, label: 'mesmo dia', result: pearson(debtValues, hrvValues) },
      { lag: 1, label: 'HRV no dia seguinte', result: lag1 },
    ]
  }, [snapshots])

  const hasAny = lagResults.some((l) => l.result != null)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Cross-domain
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Débito de sono 7d × HRV
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Hipótese: dívida acumulada nos últimos 7 dias deprime HRV (tônus parassimpático).
          Esperado: r negativo — mais negativo = hipótese mais sustentada nos seus dados.
        </p>
      </div>

      {hasAny ? (
        <div className="grid gap-3 md:grid-cols-2">
          {lagResults.map((lr) => (
            <LagPanel key={lr.lag} lag={lr.lag} label={lr.label} result={lr.result} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Dados insuficientes (mínimo 10 dias com sleep + HRV pareados).
        </p>
      )}
    </div>
  )
}

function strengthLabel(strength: CorrelationResult['strength']): string {
  if (strength === 'strong') return 'forte'
  if (strength === 'moderate') return 'moderado'
  if (strength === 'weak') return 'fraco'
  return 'desprezível'
}

function toneClass(r: number): string {
  if (r <= -0.4) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (r <= -0.2) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function LagPanel({ lag, label, result }: { lag: number; label: string; result: CorrelationResult | null }) {
  if (!result) {
    return (
      <article className="rounded-[1.25rem] border border-slate-900/10 bg-white/70 p-4">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Lag +{lag} · {label}
        </div>
        <p className="mt-3 text-sm text-slate-400">Pares insuficientes</p>
      </article>
    )
  }

  return (
    <article className="rounded-[1.25rem] border border-slate-900/10 bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Lag +{lag} · {label}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${toneClass(result.r)}`}>
          {result.significant ? 'p < 0,05' : 'n.s.'}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950">
        r = {result.r.toFixed(2)}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        n = {result.n} · {strengthLabel(result.strength)}
      </p>
    </article>
  )
}
