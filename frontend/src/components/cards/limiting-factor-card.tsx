import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { dayLabel } from '@/utils/aggregation'
import { computeRecoveryScoreSeries, type RecoveryScorePoint } from '@/utils/recovery-score'
import { computeSleepDebt } from '@/utils/sleep-debt'
import {
  rankLimitingFactors,
  type RecoveryComponentKey,
} from '@/utils/recovery-score-ranking'

interface LimitingFactorCardProps {
  snapshots: DailySnapshot[]
}

interface FactorMeta {
  coachingHeadline: string
  shortLabel: string
  medicalLabel: string
  unit?: string
}

const FACTOR_META: Record<RecoveryComponentKey, FactorMeta> = {
  hrv: {
    coachingHeadline: 'Autonômico em alerta hoje',
    shortLabel: 'Autonômico',
    medicalLabel: 'HRV (SDNN)',
    unit: 'ms',
  },
  sleepEff: {
    coachingHeadline: 'Sono fragmentado pesou',
    shortLabel: 'Sono',
    medicalLabel: 'Eficiência do sono',
    unit: '%',
  },
  rhr: {
    coachingHeadline: 'FC repouso elevada hoje',
    shortLabel: 'FC repouso',
    medicalLabel: 'FC de repouso',
    unit: 'bpm',
  },
  sleepDebt: {
    coachingHeadline: 'Débito de sono pesando',
    shortLabel: 'Débito sono',
    medicalLabel: 'Débito de sono acumulado 7d',
    unit: 'h',
  },
  mood: {
    coachingHeadline: 'Humor baixou o tom',
    shortLabel: 'Humor',
    medicalLabel: 'Valência de humor',
  },
}

const COMPONENT_LABEL_PT: Record<RecoveryComponentKey, string> = {
  hrv: 'HRV',
  sleepEff: 'eficiência do sono',
  rhr: 'FC de repouso',
  sleepDebt: 'débito de sono 7d',
  mood: 'humor',
}

const CHIP_COLORS = [
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
]

interface LatestState {
  point: RecoveryScorePoint
  snapshot: DailySnapshot
  rawValues: Record<RecoveryComponentKey, number | null>
}

interface LatestResult {
  state: LatestState | null
  // Quando state=null mas há snapshot recente, descrever o motivo do score ausente.
  fallback: {
    snapshot: DailySnapshot
    point: RecoveryScorePoint
    rawValues: Record<RecoveryComponentKey, number | null>
  } | null
}

function findLatest(
  snapshots: DailySnapshot[],
  series: RecoveryScorePoint[],
  debtByDate: Map<string, number | null>,
): LatestResult {
  // Procura mais recente com score válido. Se nenhum, registra o último snapshot
  // observado pra montar o lembrete de motivo.
  const buildRaw = (snap: DailySnapshot): Record<RecoveryComponentKey, number | null> => ({
    hrv: snap.health?.hrvSdnn ?? null,
    rhr: snap.health?.restingHeartRate ?? null,
    sleepEff: snap.health?.sleepEfficiencyPct ?? null,
    sleepDebt: debtByDate.get(snap.date) ?? null,
    mood: snap.mood?.valence ?? null,
  })

  for (let i = series.length - 1; i >= 0; i -= 1) {
    const point = series[i]
    const snapshot = snapshots[i]
    if (point.score != null && point.components != null) {
      return {
        state: { point, snapshot, rawValues: buildRaw(snapshot) },
        fallback: null,
      }
    }
  }

  if (snapshots.length === 0) return { state: null, fallback: null }
  const lastIdx = snapshots.length - 1
  return {
    state: null,
    fallback: {
      snapshot: snapshots[lastIdx],
      point: series[lastIdx],
      rawValues: buildRaw(snapshots[lastIdx]),
    },
  }
}

function formatRawValue(key: RecoveryComponentKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const meta = FACTOR_META[key]
  const unit = meta.unit ? ` ${meta.unit}` : ''
  if (key === 'hrv' || key === 'rhr') return `${Math.round(value)}${unit}`
  if (key === 'sleepEff') return `${value.toFixed(0)}${unit}`
  if (key === 'sleepDebt') return `${value.toFixed(1)}${unit}`
  if (key === 'mood') return value.toFixed(2)
  return `${value}`
}

function missingInputs(rawValues: Record<RecoveryComponentKey, number | null>): RecoveryComponentKey[] {
  return (Object.keys(rawValues) as RecoveryComponentKey[]).filter((k) => rawValues[k] == null)
}

export function LimitingFactorCard({ snapshots }: LimitingFactorCardProps) {
  const { state, fallback } = useMemo(() => {
    const series = computeRecoveryScoreSeries(snapshots)
    const debt = computeSleepDebt(snapshots)
    const debtByDate = new Map<string, number | null>(
      debt.map((p) => [p.date, p.debt_cumulative_7d]),
    )
    return findLatest(snapshots, series, debtByDate)
  }, [snapshots])

  if (snapshots.length === 0) return null

  // ─── Lembrete (Q3 A + lembrete: score=null) ─────────────────────────────────
  if (!state) {
    if (!fallback) return null
    const { point, snapshot, rawValues } = fallback
    const missing = missingInputs(rawValues)
    const reasonText =
      point.reason === 'baseline_missing'
        ? 'Baselines HRV/FC ainda em formação. Precisa de ≥14 dias reais pra calcular o score com confiança.'
        : missing.length > 0
          ? `Faltam dados hoje: ${missing.map((k) => COMPONENT_LABEL_PT[k]).join(', ')}.`
          : 'Inputs insuficientes pra montar o score completo.'

    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Limitante · {dayLabel(snapshot.date)}
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-900">
          Score parcial em construção
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{reasonText}</p>
      </div>
    )
  }

  // ─── Estado pleno (score disponível) ────────────────────────────────────────
  const ranked = rankLimitingFactors(state.point.components!)
  const top = ranked.slice(0, 2)
  const headline = FACTOR_META[top[0].component].coachingHeadline
  const dateLabel = dayLabel(state.snapshot.date)
  const interpBadge = state.point.derivedFromInterpolated

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Limitante · {dateLabel}
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            {headline}
          </h3>
          {interpBadge && (
            <p className="mt-1 text-[0.7rem] font-medium text-amber-600">
              ⚠ baseado em dia com interpolação — confiança reduzida
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-[0.65rem] uppercase tracking-wider text-slate-500">Score do dia</div>
          <div className="font-['Fraunces'] text-3xl tracking-[-0.04em] text-slate-900">
            {state.point.score!.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {top.map((factor, idx) => {
          const meta = FACTOR_META[factor.component]
          const tone = CHIP_COLORS[idx] ?? CHIP_COLORS[0]
          return (
            <div
              key={factor.component}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${tone.bg} ${tone.border} ${tone.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              <span className="font-semibold">{meta.shortLabel}</span>
              <span className="text-[0.7rem] opacity-70">
                {Math.round(factor.componentValue)}/100
              </span>
              <span className="text-[0.65rem] opacity-60">
                −{factor.weightedShortfall.toFixed(1)} pts
              </span>
            </div>
          )
        })}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Detalhe médico
        </summary>
        <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
          {ranked.map((factor) => {
            const meta = FACTOR_META[factor.component]
            const raw = state.rawValues[factor.component]
            return (
              <div key={factor.component} className="flex items-center gap-2">
                <span className="flex-1">{meta.medicalLabel}</span>
                <span className="text-[0.7rem] text-slate-400">
                  {Math.round(factor.weight * 100)}%
                </span>
                <span className="w-12 text-right text-slate-500">
                  {formatRawValue(factor.component, raw)}
                </span>
                <span className="w-12 text-right font-semibold text-slate-800">
                  {Math.round(factor.componentValue)}/100
                </span>
              </div>
            )
          })}
          <p className="mt-2 text-[0.7rem] leading-4 text-slate-400">
            Shortfall = (100 − componente) × peso. Maior shortfall ⇒ componente que mais puxou o
            score pra baixo no dia.
          </p>
        </div>
      </details>
    </div>
  )
}
