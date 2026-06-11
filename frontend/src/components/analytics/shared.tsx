/* eslint-disable react-refresh/only-export-components */

import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Minus,
  Sparkles,
} from 'lucide-react'

import type {
  AnalyticsCorrelation,
  AnalyticsCoverageRow,
  AnalyticsExperiment,
  AnalyticsHeadline,
  AnalyticsMetric,
  AnalyticsNarrative,
  AnalyticsPattern,
  AnalyticsScoreBand,
  AnalyticsTone,
  AnalyticsWindow,
} from '@/components/analytics/types'

const SURFACE_CLASS =
  'panel rounded-[1.7rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]'
const CARD_CLASS =
  'rounded-[1.35rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4 shadow-[0_16px_34px_rgba(17,35,30,0.06)] backdrop-blur'
const LABEL_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]'

const toneBadge: Record<AnalyticsTone, string> = {
  positive: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  neutral: 'border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300',
  watch: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  negative: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

function toneIcon(tone: AnalyticsTone) {
  if (tone === 'positive') return <CheckCircle2 className="h-4 w-4" />
  if (tone === 'negative') return <AlertTriangle className="h-4 w-4" />
  if (tone === 'watch') return <Sparkles className="h-4 w-4" />
  return <Minus className="h-4 w-4" />
}

export function formatValue(value: number | string | null | undefined, unit?: string | null) {
  if (value == null || value === '') return 'Sem dados'
  if (typeof value === 'number') {
    const display = Number.isInteger(value) ? value.toString() : value.toFixed(Math.abs(value) >= 10 ? 1 : 2)
    return unit ? `${display}${unit}` : display
  }
  return unit ? `${value}${unit}` : value
}

export function formatConfidence(confidence: number | null | undefined) {
  if (confidence == null) return 'confiança n/d'
  const pct = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(pct)}% confiança`
}

export function toneFromCoefficient(value: number | null | undefined): AnalyticsTone {
  if (value == null) return 'neutral'
  const abs = Math.abs(value)
  if (abs >= 0.45) return value > 0 ? 'positive' : 'negative'
  if (abs >= 0.22) return 'watch'
  return 'neutral'
}

export function SurfaceFrame({
  icon,
  kicker,
  title,
  description,
  window,
  status,
  metaPanel,
  children,
}: {
  icon: ReactNode
  kicker: string
  title: string
  description: string
  window?: AnalyticsWindow | null
  status?: string | null
  metaPanel?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={SURFACE_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <span className={LABEL_CLASS}>
            {icon}
            {kicker}
          </span>
          <h2 className="mt-3 font-['Fraunces'] text-[2rem] leading-tight tracking-[-0.05em] text-slate-950">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
        </div>

        {metaPanel ?? (
          <div className="grid min-w-[220px] gap-2">
            <div className={`${CARD_CLASS} bg-white/65 dark:bg-slate-900/65`}>
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Janela analítica
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {window?.label ?? ([window?.from, window?.to].filter(Boolean).join(' → ') || 'Sem recorte informado')}
              </div>
              {window?.coveredDays != null && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{window.coveredDays} dias cobertos</div>
              )}
            </div>

            <div className={`${CARD_CLASS} bg-white/65 dark:bg-slate-900/65`}>
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Status
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{status ?? 'Payload parcial ou em validação'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5">{children}</div>
    </section>
  )
}

export function EmptyAnalyticsState({ message }: { message: string }) {
  return (
    <div className={`${CARD_CLASS} border-dashed bg-white/55 dark:bg-slate-900/55 text-sm leading-6 text-slate-500 dark:text-slate-400`}>
      {message}
    </div>
  )
}

export function MetricGrid({ metrics }: { metrics?: AnalyticsMetric[] }) {
  if (!metrics?.length) {
    return <EmptyAnalyticsState message="Sem métricas executivas suficientes para montar este painel." />
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const tone = metric.tone ?? 'neutral'
        return (
          <article key={`${metric.label}-${metric.changeLabel ?? ''}`} className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {metric.label}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${toneBadge[tone]}`}>
                {toneIcon(tone)}
              </span>
            </div>
            <div className="mt-4 text-3xl font-bold tracking-[-0.06em] text-slate-950">
              {formatValue(metric.value, metric.unit)}
            </div>
            {(metric.changeLabel || metric.benchmark || metric.detail) && (
              <div className="mt-3 space-y-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
                {metric.changeLabel && <div>{metric.changeLabel}</div>}
                {metric.benchmark && <div>{metric.benchmark}</div>}
                {metric.detail && <div>{metric.detail}</div>}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

export function HeadlineStack({ items, emptyMessage }: { items?: AnalyticsHeadline[]; emptyMessage: string }) {
  if (!items?.length) {
    return <EmptyAnalyticsState message={emptyMessage} />
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {items.map((item) => {
        const tone = item.tone ?? 'neutral'
        return (
          <article key={item.title} className={`${CARD_CLASS} h-full`}>
            <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${toneBadge[tone]}`}>
              {toneIcon(tone)}
              {formatConfidence(item.confidence)}
            </div>
            <h3 className="mt-3 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.summary}</p>
            {item.evidence?.length ? (
              <ul className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                {item.evidence.slice(0, 3).map((evidence) => (
                  <li key={evidence} className="flex gap-2">
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                    <span>{evidence}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

export function NarrativeColumn({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items?: AnalyticsNarrative[]
  emptyMessage: string
}) {
  return (
    <div className="space-y-3">
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</div>
      {items?.length ? (
        items.map((item) => {
          const tone = item.tone ?? 'neutral'
          return (
            <article key={item.title} className={CARD_CLASS}>
              <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${toneBadge[tone]}`}>
                {toneIcon(tone)}
                leitura
              </div>
              <h3 className="mt-3 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.body}</p>
              {item.bullets?.length ? (
                <ul className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                  {item.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          )
        })
      ) : (
        <EmptyAnalyticsState message={emptyMessage} />
      )}
    </div>
  )
}

export function CoverageList({
  title,
  rows,
  emptyMessage,
}: {
  title: string
  rows?: AnalyticsCoverageRow[]
  emptyMessage: string
}) {
  return (
    <div className={CARD_CLASS}>
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</div>
      {rows?.length ? (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const pct =
              row.total && row.total > 0 && row.value != null ? Math.max(0, Math.min((row.value / row.total) * 100, 100)) : 0
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{row.label}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {row.value ?? '—'}
                    {row.total ? ` / ${row.total}` : ''}
                  </span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800/50">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-teal-600 to-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                {row.note && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.note}</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyAnalyticsState message={emptyMessage} />
        </div>
      )}
    </div>
  )
}

export function ExperimentList({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items?: AnalyticsExperiment[]
  emptyMessage: string
}) {
  return (
    <div className={CARD_CLASS}>
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</div>
      {items?.length ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <article key={item.title} className="rounded-[1rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/70 dark:bg-slate-900/70 p-3">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.hypothesis}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {item.duration && (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 font-medium text-slate-600 dark:text-slate-400">{item.duration}</span>
                )}
                {item.successSignal && (
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-300">{item.successSignal}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyAnalyticsState message={emptyMessage} />
        </div>
      )}
    </div>
  )
}

export function CorrelationGrid({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items?: AnalyticsCorrelation[]
  emptyMessage: string
}) {
  return (
    <div className={CARD_CLASS}>
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</div>
      {items?.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const tone = toneFromCoefficient(item.coefficient)
            const width = item.coefficient == null ? 0 : Math.min(Math.abs(item.coefficient) * 100, 100)
            const positive = (item.coefficient ?? 0) >= 0
            return (
              <article key={`${item.leftLabel}-${item.rightLabel}-${item.lagDays ?? '0'}`} className="rounded-[1rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/70 dark:bg-slate-900/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.leftLabel} × {item.rightLabel}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.lagDays ? `lag ${item.lagDays}d` : 'mesmo dia'}
                      {item.pairCount != null ? ` · n=${item.pairCount}` : ''}
                    </div>
                    {item.qualityLabel && (
                      <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{item.qualityLabel}</div>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${toneBadge[tone]}`}>
                    {positive ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    {item.coefficient == null ? 'n/d' : item.coefficient.toFixed(2)}
                  </span>
                </div>
                <div className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800/50">
                  <div
                    className={`h-2.5 rounded-full ${positive ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-rose-500 to-orange-500'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                {item.interpretation && <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.interpretation}</p>}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyAnalyticsState message={emptyMessage} />
        </div>
      )}
    </div>
  )
}

export function ScoreBandGrid({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items?: AnalyticsScoreBand[]
  emptyMessage: string
}) {
  return (
    <div className={CARD_CLASS}>
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</div>
      {items?.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => {
            const max = item.max ?? 100
            const width = item.value == null ? 0 : Math.max(0, Math.min((item.value / max) * 100, 100))
            const tone = item.tone ?? 'neutral'
            return (
              <article key={item.label} className="rounded-[1rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/70 dark:bg-slate-900/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${toneBadge[tone]}`}>
                    {toneIcon(tone)}
                    {item.value == null ? 'n/d' : `${Math.round(item.value)}/${max}`}
                  </span>
                </div>
                <div className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800/50">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500" style={{ width: `${width}%` }} />
                </div>
                {item.note && <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.note}</div>}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyAnalyticsState message={emptyMessage} />
        </div>
      )}
    </div>
  )
}

export function PatternCards({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items?: AnalyticsPattern[]
  emptyMessage: string
}) {
  return (
    <div className={CARD_CLASS}>
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</div>
      {items?.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const tone = item.tone ?? 'neutral'
            const strength = item.strength == null ? 0 : Math.min(Math.max(item.strength, 0), 1) * 100
            return (
              <article key={item.title} className="rounded-[1rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/70 dark:bg-slate-900/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${toneBadge[tone]}`}>
                    {toneIcon(tone)}
                    {item.frequencyLabel ?? 'padrão'}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.description}</p>
                {item.strength != null && (
                  <div className="mt-3">
                    <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800/50">
                      <div className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${strength}%` }} />
                    </div>
                  </div>
                )}
                {item.evidence?.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                    {item.evidence.map((evidence) => (
                      <li key={evidence} className="flex gap-2">
                        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                        <span>{evidence}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyAnalyticsState message={emptyMessage} />
        </div>
      )}
    </div>
  )
}
