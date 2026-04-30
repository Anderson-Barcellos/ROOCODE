import { useMemo } from 'react'
import { Activity, HeartPulse, Moon, Pill, SunMedium } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'

type DriverTone = 'positive' | 'watch' | 'neutral'

interface DriverDefinition {
  id: string
  title: string
  label: string
  unit: string
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
  icon: typeof Moon
  current: number | null
  baseline: number | null
  delta: number | null
  pairCount: number
  tone: DriverTone
  message: string
  precision: number
}

const MIN_MOOD_PAIRS = 3
const RECENT_WINDOW = 7

const DRIVERS: DriverDefinition[] = [
  {
    id: 'sleep',
    title: 'Sono',
    label: 'sono total',
    unit: 'h',
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

function buildDriverCard(snapshots: DailySnapshot[], driver: DriverDefinition): DriverCard {
  const usable = snapshots.filter((snapshot) => !snapshot.forecasted && !snapshot.interpolated)
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
  const base = {
    id: driver.id,
    title: driver.title,
    label: driver.label,
    unit: driver.unit,
    icon: driver.icon,
    current,
    baseline,
    delta,
    pairCount,
    tone: toneForDelta(delta, baseline, driver.polarity),
    precision: driver.precision ?? 1,
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

export function MoodDriverBoard({ snapshots }: { snapshots: DailySnapshot[] }) {
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
            só interpreta quando há overlap mínimo com humor.
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
            </article>
          )
        })}
      </div>
    </section>
  )
}
