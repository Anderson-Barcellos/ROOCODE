import { useMemo } from 'react'

import {
  FULL_HISTORY_DOSE_HOURS,
  useDoses,
  useRegimen,
  useSubstances,
  type Substance,
} from '@/lib/api'
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
    short: 'Em faixa',
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
    short: 'Subterapêutico',
    badgeBg: 'bg-rose-50 border-rose-200',
    badgeText: 'text-rose-700',
    bar: 'bg-rose-500',
  },
  acima_faixa: {
    headline: 'Concentração acima da faixa',
    short: 'Supraterapêutico',
    badgeBg: 'bg-red-50 border-red-200',
    badgeText: 'text-red-700',
    bar: 'bg-red-500',
  },
  cobertura_incompleta: {
    headline: 'Cobertura incompleta no histórico',
    short: 'Cobertura incompleta',
    badgeBg: 'bg-fuchsia-50 border-fuchsia-200',
    badgeText: 'text-fuchsia-700',
    bar: 'bg-fuchsia-500',
  },
}

const CLASS_PRIORITY: CoverageClass[] = [
  'vulnerabilidade',
  'acima_faixa',
  'cobertura_incompleta',
  'queda',
  'adequada',
]

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

/**
 * Mapeia presetKey do frontend (escitalopram, lisdexamfetamine, lamotrigine,
 * clonazepam) pra Substance do backend usando aliases. Backend usa brand names
 * como id (lexapro, venvanse, lamictal); aliases incluem os nomes genéricos.
 */
function buildSubstanceMap(substances: Substance[] | undefined): Map<string, Substance> {
  const map = new Map<string, Substance>()
  if (!substances) return map
  for (const sub of substances) {
    map.set(sub.id.toLowerCase(), sub)
    for (const alias of sub.aliases) {
      map.set(alias.toLowerCase(), sub)
    }
  }
  return map
}

const CONFIDENCE_LABEL_PT: Record<NonNullable<Substance['confidence']>, string> = {
  high: 'alta',
  medium: 'média',
  low: 'baixa',
  unknown: 'não informada',
}

function buildRangeTooltip(sub: Substance | undefined, fallbackUnit: string): string {
  if (!sub) return ''
  const lines: string[] = []
  if (
    sub.therapeutic_range_min != null &&
    sub.therapeutic_range_max != null
  ) {
    const unit = sub.therapeutic_range_unit ?? fallbackUnit
    lines.push(
      `Faixa terapêutica: ${sub.therapeutic_range_min}–${sub.therapeutic_range_max} ${unit}`,
    )
  }
  if (sub.confidence) {
    lines.push(`Confiança da referência: ${CONFIDENCE_LABEL_PT[sub.confidence]}`)
  }
  if (sub.notes && sub.notes.length > 0) {
    lines.push('') // separador visual
    lines.push('Notas:')
    for (const note of sub.notes) lines.push(`· ${note}`)
  }
  if (sub.sources && sub.sources.length > 0) {
    lines.push('') // separador
    lines.push('Fontes:')
    for (const src of sub.sources) lines.push(`· ${src}`)
  }
  return lines.join('\n')
}

export function PKCoverageCard({ variant = 'full' }: PKCoverageCardProps) {
  // O classificador é das últimas 48h, mas concentração atual/queda precisa
  // integrar o histórico de doses, não só a janela visual/operacional.
  const dosesQuery = useDoses(FULL_HISTORY_DOSE_HOURS)
  const regimenQuery = useRegimen(true)
  const substancesQuery = useSubstances()

  const statuses = useMemo(() => {
    const doses = dosesQuery.data ?? []
    const regimen = regimenQuery.data ?? []
    return computeCoverageStatus(doses, regimen)
  }, [dosesQuery.data, regimenQuery.data])

  const substanceMap = useMemo(
    () => buildSubstanceMap(substancesQuery.data),
    [substancesQuery.data],
  )

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
          // BACKLOG #33: tooltip rico com notes + sources + confidence vindo do
          // /farma/substances?full=true. Match via aliases (frontend usa
          // 'escitalopram'/'lamotrigine', backend usa 'lexapro'/'lamictal').
          const sub =
            substanceMap.get(s.presetKey.toLowerCase()) ??
            (s.brandName ? substanceMap.get(s.brandName.toLowerCase()) : undefined)
          const rangeTooltip = buildRangeTooltip(sub, s.unit)
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
                <span
                  className={`text-slate-400 ${rangeTooltip ? 'cursor-help underline decoration-dotted underline-offset-2' : ''}`}
                  title={rangeTooltip || undefined}
                >
                  faixa {fmt(min)}–{fmt(max)} {s.unit}
                </span>
                {s.trendPctPerDay != null && (
                  <span
                    className={
                      s.klass === 'acima_faixa'
                        ? 'text-red-600'
                        : s.trendPctPerDay < -5
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
                      {s.expectedDosesLast48h > 0
                        ? `Doses 48h: ${s.loggedDosesLast48h}/${s.expectedDosesLast48h} esperadas`
                        : s.loggedDosesLast48h > 0
                          ? `Doses 48h: ${s.loggedDosesLast48h} registradas (uso sob demanda)`
                          : 'Doses 48h: sem dose registrada'}
                    </span>
                    {s.missedDoses > 0 && (
                      <span className="text-fuchsia-700">
                        {s.missedDoses} dose{s.missedDoses > 1 ? 's' : ''} não registrada(s)
                      </span>
                    )}
                    {s.hoursUntilBelowMin != null && s.klass !== 'vulnerabilidade' && (
                      <span className="text-amber-700">
                        cobre até ~{s.hoursUntilBelowMin}h
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
          Classificação prioritária: subterapêutico &gt; supraterapêutico &gt; cobertura incompleta &gt; em
          queda &gt; em faixa. Concentrações são estimadas pelo motor PK (preset por substância),
          comparadas ao range terapêutico publicado. Doses esperadas vêm do regime ativo no
          `/farma/regimen`. Em psiquiatria, faixas terapêuticas são referenciais e a resposta clínica
          individual segue sendo soberana.
        </p>
      )}
    </div>
  )
}
