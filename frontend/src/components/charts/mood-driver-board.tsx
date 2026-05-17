import { useMemo, useState } from 'react'
import { Activity, HeartPulse, Moon, Pill, SunMedium } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import { pearson, type CorrelationResult } from '@/utils/statistics'

type DriverTone = 'positive' | 'watch' | 'neutral'

interface DriverDefinition {
  id: string
  title: string
  label: string
  unit: string
  sourcePath: string
  chartHint: string
  icon: typeof Moon
  polarity: 'higher-is-better' | 'lower-is-better' | 'context'
  getter: (snapshot: DailySnapshot) => number | null
  precision?: number
}

interface DriverCard {
  id: string
  title: string
  label: string
  unit: string
  sourcePath: string
  chartHint: string
  icon: typeof Moon
  current: number | null
  baseline: number | null
  delta: number | null
  pairCount: number
  tone: DriverTone
  message: string
  precision: number
  recentEvidence: Array<{ date: string; value: number; mood: number | null }>
  lag0Correlation: CorrelationResult | null
  polarity: DriverDefinition['polarity']
}

const MIN_MOOD_PAIRS = 3
const RECENT_WINDOW = 7

const DRIVERS: DriverDefinition[] = [
  {
    id: 'sleep',
    title: 'Sono',
    label: 'sono total',
    unit: 'h',
    sourcePath: 'DailySnapshot.health.sleepTotalHours',
    chartHint: 'Sono · SleepStages/SleepDebt',
    icon: Moon,
    polarity: 'higher-is-better',
    getter: (snapshot) => snapshot.health?.sleepTotalHours ?? null,
    precision: 1,
  },
  {
    id: 'autonomic',
    title: 'Autonômico',
    label: 'HRV',
    unit: 'ms',
    sourcePath: 'DailySnapshot.health.hrvSdnn',
    chartHint: 'Coração · AutonomicBalance/HRV',
    icon: HeartPulse,
    polarity: 'higher-is-better',
    getter: (snapshot) => snapshot.health?.hrvSdnn ?? null,
    precision: 0,
  },
  {
    id: 'activity',
    title: 'Ativação',
    label: 'passos',
    unit: '',
    sourcePath: 'DailySnapshot.health.steps',
    chartHint: 'Atividade · Steps/ActivityBars',
    icon: Activity,
    polarity: 'higher-is-better',
    getter: (snapshot) => snapshot.health?.steps ?? null,
    precision: 0,
  },
  {
    id: 'circadian',
    title: 'Circadiano',
    label: 'luz do dia',
    unit: 'min',
    sourcePath: 'DailySnapshot.health.daylightMinutes',
    chartHint: 'Atividade/Insights · ciclo circadiano',
    icon: SunMedium,
    polarity: 'higher-is-better',
    getter: (snapshot) => snapshot.health?.daylightMinutes ?? null,
    precision: 0,
  },
  {
    id: 'medication',
    title: 'Medicação',
    label: 'doses logadas',
    unit: '',
    sourcePath: 'DailySnapshot.medications.count',
    chartHint: 'Farmaco · DoseLogger/PKCoverage',
    icon: Pill,
    polarity: 'context',
    getter: (snapshot) => snapshot.medications?.count ?? null,
    precision: 0,
  },
]

const average = (values: number[]): number | null => {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const formatValue = (value: number | null, unit: string, precision: number): string => {
  if (value == null) return 'sem dado'
  const rounded = value.toLocaleString('pt-BR', {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
  })
  return unit ? `${rounded} ${unit}` : rounded
}

const formatDelta = (delta: number | null, unit: string, precision: number): string => {
  if (delta == null) return 'sem delta'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatValue(delta, unit, precision)}`
}

const toneForDelta = (
  delta: number | null,
  baseline: number | null,
  polarity: DriverDefinition['polarity'],
): DriverTone => {
  if (delta == null || baseline == null || baseline === 0 || polarity === 'context') return 'neutral'
  const relative = delta / Math.abs(baseline)
  if (Math.abs(relative) < 0.08) return 'neutral'
  const improving = polarity === 'higher-is-better' ? delta > 0 : delta < 0
  return improving ? 'positive' : 'watch'
}

const buildMessage = (card: Omit<DriverCard, 'message'>): string => {
  if (card.pairCount < MIN_MOOD_PAIRS) {
    return `dados insuficientes: precisa >=${MIN_MOOD_PAIRS} pares humor+${card.label}; agora ${card.pairCount}.`
  }
  if (card.delta == null || card.baseline == null) {
    return 'sem baseline suficiente para comparar a janela recente.'
  }
  const direction = card.delta > 0 ? 'acima' : card.delta < 0 ? 'abaixo' : 'estável'
  if (card.tone === 'positive') {
    return `${card.label} recente ${direction} do baseline; hipótese favorável, sem causalidade.`
  }
  if (card.tone === 'watch') {
    return `${card.label} recente ${direction} do baseline; vale observar junto do humor.`
  }
  return `${card.label} recente perto do baseline; sinal estável nesta janela.`
}

type CorrelationCueTone = 'neutral' | 'aligned' | 'weak' | 'opposite'

function describeCorrelationCue(card: DriverCard): { tone: CorrelationCueTone; text: string } {
  const corr = card.lag0Correlation
  if (!corr) {
    return { tone: 'neutral', text: 'Pearson lag0: n<10 (insuficiente).' }
  }

  const absR = Math.abs(corr.r)
  if (absR < 0.1) {
    return { tone: 'weak', text: `Pearson lag0 fraco (r=${corr.r.toFixed(2)}, n=${corr.n}).` }
  }

  const expectedDirection =
    card.polarity === 'higher-is-better'
      ? 'positive'
      : card.polarity === 'lower-is-better'
        ? 'negative'
        : null

  if (expectedDirection && corr.direction !== expectedDirection) {
    return {
      tone: 'opposite',
      text: `Direção oposta no Pearson lag0 (r=${corr.r.toFixed(2)}, n=${corr.n}).`,
    }
  }

  return {
    tone: expectedDirection == null ? 'neutral' : 'aligned',
    text: `Pearson lag0 ${corr.direction === 'positive' ? 'positivo' : 'negativo'} (r=${corr.r.toFixed(2)}, n=${corr.n}).`,
  }
}

function buildDriverCard(snapshots: DailySnapshot[], driver: DriverDefinition): DriverCard {
  const usable = snapshots.filter((snapshot) => !snapshot.forecasted && !snapshot.interpolated)
  const usableWithValues = usable
    .map((snapshot) => {
      const value = driver.getter(snapshot)
      return value != null && Number.isFinite(value)
        ? { date: snapshot.date, value, mood: snapshot.mood?.valence ?? null }
        : null
    })
    .filter((item): item is { date: string; value: number; mood: number | null } => item != null)
  const values = usable
    .map((snapshot) => driver.getter(snapshot))
    .filter((value): value is number => value != null && Number.isFinite(value))
  const recent = values.slice(-RECENT_WINDOW)
  const baselineValues = values.slice(0, Math.max(0, values.length - RECENT_WINDOW))
  const current = average(recent)
  const baseline = average(baselineValues.length >= MIN_MOOD_PAIRS ? baselineValues : values)
  const delta = current != null && baseline != null ? current - baseline : null
  const pairCount = usable.filter((snapshot) => {
    const value = driver.getter(snapshot)
    return value != null && Number.isFinite(value) && snapshot.mood?.valence != null
  }).length
  const lag0Correlation = pearson(
    usableWithValues.map((item) => item.value),
    usableWithValues.map((item) => item.mood),
  )
  const base = {
    id: driver.id,
    title: driver.title,
    label: driver.label,
    unit: driver.unit,
    sourcePath: driver.sourcePath,
    chartHint: driver.chartHint,
    icon: driver.icon,
    current,
    baseline,
    delta,
    pairCount,
    tone: toneForDelta(delta, baseline, driver.polarity),
    precision: driver.precision ?? 1,
    recentEvidence: usableWithValues.slice(-RECENT_WINDOW),
    lag0Correlation,
    polarity: driver.polarity,
  }
  return {
    ...base,
    message: buildMessage(base),
  }
}

const toneClass: Record<DriverTone, string> = {
  positive: 'border-teal-200 bg-teal-50/80 text-teal-900',
  watch: 'border-amber-200 bg-amber-50/80 text-amber-900',
  neutral: 'border-slate-200 bg-white/85 text-slate-800',
}

const correlationCueClass: Record<CorrelationCueTone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  aligned: 'border-teal-200 bg-teal-50 text-teal-800',
  weak: 'border-slate-200 bg-slate-50 text-slate-600',
  opposite: 'border-amber-200 bg-amber-50 text-amber-800',
}

export function MoodDriverBoard({ snapshots }: { snapshots: DailySnapshot[] }) {
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null)
  const cards = useMemo(
    () => DRIVERS.map((driver) => buildDriverCard(snapshots, driver)),
    [snapshots],
  )
  const moodDays = useMemo(
    () => snapshots.filter((snapshot) => !snapshot.forecasted && !snapshot.interpolated && snapshot.mood?.valence != null).length,
    [snapshots],
  )

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-teal-700">
            Mood Driver Board
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            O que pode estar pesando hoje
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Resumo operacional por janela recente. Cada card compara os últimos dias com o baseline disponível e
            só interpreta quando há overlap mínimo com humor. Este board não substitui o heatmap de correlação;
            o badge de Pearson lag0 abaixo serve apenas como cheque de coerência.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          humor pareado: {moodDays} dia{moodDays === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon
          const gated = card.pairCount < MIN_MOOD_PAIRS
          const correlationCue = describeCorrelationCue(card)
          return (
            <article
              key={card.id}
              className={`min-h-[168px] rounded-xl border p-4 ${toneClass[gated ? 'neutral' : card.tone]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 text-slate-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{card.title}</h4>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {card.label}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.68rem] font-bold text-slate-500">
                  n={card.pairCount}
                </span>
              </div>

              <div className="mt-4">
                <p className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-950">
                  {formatValue(card.current, card.unit, card.precision)}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  baseline {formatValue(card.baseline, card.unit, card.precision)}
                </p>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-600">{card.message}</p>
              <p className={`mt-2 rounded-md border px-2 py-1 text-[0.68rem] font-medium ${correlationCueClass[correlationCue.tone]}`}>
                {correlationCue.text}
              </p>

              <button
                type="button"
                onClick={() => setExpandedDriverId((current) => current === card.id ? null : card.id)}
                aria-expanded={expandedDriverId === card.id}
                className="mt-3 inline-flex items-center rounded-md border border-slate-900/10 bg-white/70 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
              >
                Evidência
              </button>

              {expandedDriverId === card.id && (
                <div className="mt-3 rounded-xl border border-slate-900/10 bg-white/75 px-3 py-2 text-xs leading-5 text-slate-600">
                  <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Evidência do driver</p>
                  <p className="mt-1">
                    Fonte: <span className="font-mono text-[0.72rem] text-slate-700">{card.sourcePath}</span>
                  </p>
                  <p>
                    Janela recente: {formatValue(card.current, card.unit, card.precision)} · baseline {formatValue(card.baseline, card.unit, card.precision)} · delta {formatDelta(card.delta, card.unit, card.precision)} · n pareado {card.pairCount}
                  </p>
                  <p>
                    Pearson lag0:{' '}
                    {card.lag0Correlation
                      ? `r=${card.lag0Correlation.r.toFixed(2)} · p=${card.lag0Correlation.pValue.toFixed(3)} · n=${card.lag0Correlation.n}`
                      : 'n<10 (não calculado)'}
                  </p>
                  <p>Destino natural: {card.chartHint}</p>
                  {card.recentEvidence.length > 0 && (
                    <div className="mt-2 grid gap-1">
                      {card.recentEvidence.map((item) => (
                        <div key={item.date} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50/80 px-2 py-1">
                          <span className="font-mono text-[0.72rem] text-slate-500">{item.date}</span>
                          <span className="font-semibold text-slate-700">{formatValue(item.value, card.unit, card.precision)}</span>
                          <span className="text-slate-500">humor {item.mood == null ? 'n/d' : item.mood.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
