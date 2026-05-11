import { useMemo } from 'react'

import { useDoses, useRegimen } from '@/lib/api'
import {
  computeCoverageStatus,
  type CoverageClass,
  type CoverageStatus,
} from '@/utils/pk-coverage'

interface PKCoverageCardProps {
  variant?: 'full' | 'summary'
}

interface ClassMeta {
  headline: string
  short: string
  badgeBg: string
  badgeText: string
  bar: string
}

const CLASS_META: Record<CoverageClass, ClassMeta> = {
  adequada: {
    headline: 'Cobertura adequada',
    short: 'Adequada',
    badgeBg: 'bg-emerald-50 border-emerald-200',
    badgeText: 'text-emerald-700',
    bar: 'bg-emerald-500',
  },
  queda: {
    headline: 'Queda de cobertura — atenção',
    short: 'Em queda',
    badgeBg: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-700',
    bar: 'bg-amber-500',
  },
  vulnerabilidade: {
    headline: 'Janela de vulnerabilidade',
    short: 'Vulnerável',
    badgeBg: 'bg-rose-50 border-rose-200',
    badgeText: 'text-rose-700',
    bar: 'bg-rose-500',
  },
  nao_registrada: {
    headline: 'Dose esperada não registrada',
    short: 'Não registrada',
    badgeBg: 'bg-fuchsia-50 border-fuchsia-200',
    badgeText: 'text-fuchsia-700',
    bar: 'bg-fuchsia-500',
  },
}

const CLASS_PRIORITY: CoverageClass[] = ['vulnerabilidade', 'nao_registrada', 'queda', 'adequada']

function worstClass(statuses: CoverageStatus[]): CoverageClass | null {
  if (statuses.length === 0) return null
  for (const cls of CLASS_PRIORITY) {
    if (statuses.some((s) => s.klass === cls)) return cls
  }
  return 'adequada'
}

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export function PKCoverageCard({ variant = 'full' }: PKCoverageCardProps) {
  const dosesQuery = useDoses(72)
  const regimenQuery = useRegimen(true)

  const statuses = useMemo(() => {
    const doses = dosesQuery.data ?? []
    const regimen = regimenQuery.data ?? []
    return computeCoverageStatus(doses, regimen)
  }, [dosesQuery.data, regimenQuery.data])

  const overall = worstClass(statuses)

  if (dosesQuery.isLoading || regimenQuery.isLoading) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <p className="text-xs text-slate-500">Carregando cobertura farmacocinética…</p>
      </div>
    )
  }

  if (statuses.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Cobertura PK
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-900">
          Sem medicações elegíveis no catálogo
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Coverage só roda em medicações com range terapêutico definido nos presets.
        </p>
      </div>
    )
  }

  const overallMeta = overall ? CLASS_META[overall] : CLASS_META.adequada
  const isSummary = variant === 'summary'

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Cobertura PK · últimas 48h
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            {overallMeta.headline}
          </h3>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {statuses.map((s) => {
          const meta = CLASS_META[s.klass]
          const min = s.therapeuticMin
          const max = s.therapeuticMax
          const range = Math.max(1, max - min)
          const pctOfRange = Math.min(100, Math.max(0, ((s.concentrationNow - min) / range) * 100))
          return (
            <div
              key={s.presetKey}
              className="rounded-[1rem] border border-slate-900/5 bg-white p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{s.displayName}</span>
                  {s.brandName && (
                    <span className="text-[0.7rem] text-slate-400">{s.brandName}</span>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${meta.badgeBg} ${meta.badgeText}`}
                >
                  {meta.short}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
                <span className="font-mono text-slate-800">
                  {fmt(s.concentrationNow)} {s.unit}
                </span>
                <span className="text-slate-400">
                  faixa {fmt(min)}–{fmt(max)} {s.unit}
                </span>
                {s.trendPctPerDay != null && (
                  <span
                    className={
                      s.trendPctPerDay < -5
                        ? 'text-amber-600'
                        : s.trendPctPerDay > 5
                          ? 'text-emerald-600'
                          : 'text-slate-500'
                    }
                  >
                    {s.trendPctPerDay >= 0 ? '+' : ''}
                    {s.trendPctPerDay.toFixed(0)}%/24h
                  </span>
                )}
              </div>

              {!isSummary && (
                <>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${meta.bar}`}
                      style={{ width: `${pctOfRange.toFixed(0)}%` }}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-slate-500">
                    <span>
                      Doses 48h: {s.loggedDosesLast48h}/{s.expectedDosesLast48h} esperadas
                    </span>
                    {s.missedDoses > 0 && (
                      <span className="text-fuchsia-700">
                        {s.missedDoses} dose{s.missedDoses > 1 ? 's' : ''} não registrada(s)
                      </span>
                    )}
                    {s.hoursUntilBelowMin != null && s.klass !== 'vulnerabilidade' && (
                      <span className="text-amber-700">
                        cruza min em ~{s.hoursUntilBelowMin}h
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {!isSummary && (
        <p className="mt-3 text-[0.7rem] leading-4 text-slate-400">
          Classificação prioritária: vulnerabilidade &gt; não-registrada &gt; queda &gt; adequada.
          Concentrações são estimadas pelo motor PK (preset por substância), comparadas ao range
          terapêutico publicado. Doses esperadas vêm do regime ativo no `/farma/regimen`.
        </p>
      )}
    </div>
  )
}
