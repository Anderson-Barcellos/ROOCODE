import { useMemo } from 'react'
import { format, startOfDay } from 'date-fns'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import { dayLabel } from '@/utils/aggregation'
import {
  SLEEP_QUALITY_WEIGHTS,
  computeSleepQualityScoreSeries,
  type SleepQualityClass,
  type SleepQualityComponentKey,
  type SleepQualityPoint,
} from '@/utils/sleep-quality-score'

interface NightQualityCardProps {
  snapshots: DailySnapshot[]
  variant?: 'full' | 'summary'
  windowLabel?: string
}

interface ClassMeta {
  headline: string
  badge: string
  badgeBg: string
  badgeText: string
  scoreBg: string
}

const CLASS_META: Record<SleepQualityClass, ClassMeta> = {
  reparadora: {
    headline: 'Noite reparadora — boa recuperação',
    badge: 'Reparadora',
    badgeBg: 'bg-emerald-50 border-emerald-200',
    badgeText: 'text-emerald-700',
    scoreBg: 'text-emerald-700',
  },
  regular: {
    headline: 'Noite mediana — nem reparou, nem prejudicou',
    badge: 'Regular',
    badgeBg: 'bg-slate-50 border-slate-200',
    badgeText: 'text-slate-700',
    scoreBg: 'text-slate-700',
  },
  fragmentada: {
    headline: 'Sono fragmentado pesou hoje',
    badge: 'Fragmentada',
    badgeBg: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-700',
    scoreBg: 'text-amber-700',
  },
  respiratoria: {
    headline: 'Qualidade respiratória ruim',
    badge: 'Respiratória',
    badgeBg: 'bg-rose-50 border-rose-200',
    badgeText: 'text-rose-700',
    scoreBg: 'text-rose-700',
  },
  autonomica: {
    headline: 'Sinal autonômico em alerta',
    badge: 'Autonômica',
    badgeBg: 'bg-fuchsia-50 border-fuchsia-200',
    badgeText: 'text-fuchsia-700',
    scoreBg: 'text-fuchsia-700',
  },
}

const COMPONENT_LABEL: Record<SleepQualityComponentKey, string> = {
  sleepEff: 'Eficiência do sono',
  deep: 'Sono profundo',
  rem: 'Sono REM',
  awake: 'Tempo acordado',
  respiratory: 'Disturbances respiratórios',
  spo2: 'SpO₂',
}

const RAW_FIELDS_LABEL_PT: Record<SleepQualityComponentKey, string> = {
  sleepEff: 'eficiência (%)',
  deep: 'horas de deep',
  rem: 'horas de REM',
  awake: 'horas acordado',
  respiratory: 'distúrbios respiratórios',
  spo2: 'SpO₂',
}

interface RawValues {
  sleepEff: number | null
  deep: number | null
  rem: number | null
  awake: number | null
  respiratory: number | null
  spo2: number | null
}

function buildRawValues(snap: DailySnapshot): RawValues {
  const h = snap.health
  return {
    sleepEff: h?.sleepEfficiencyPct ?? null,
    deep: h?.sleepDeepHours ?? null,
    rem: h?.sleepRemHours ?? null,
    awake: h?.sleepAwakeHours ?? null,
    respiratory: h?.respiratoryDisturbances ?? null,
    spo2: h?.spo2 ?? null,
  }
}

function formatRaw(key: SleepQualityComponentKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (key === 'sleepEff') return `${value.toFixed(0)}%`
  if (key === 'spo2') return `${value.toFixed(1)}%`
  if (key === 'respiratory') return `${value.toFixed(0)}`
  return `${value.toFixed(1)}h`
}

function findLatest(
  snapshots: DailySnapshot[],
  series: SleepQualityPoint[],
): {
  point: SleepQualityPoint | null
  snapshot: DailySnapshot | null
  raw: RawValues
  missingKeys: SleepQualityComponentKey[]
} {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].score != null) {
      return {
        point: series[i],
        snapshot: snapshots[i],
        raw: buildRawValues(snapshots[i]),
        missingKeys: [],
      }
    }
  }
  if (snapshots.length === 0) {
    return { point: null, snapshot: null, raw: buildRawValues({} as DailySnapshot), missingKeys: [] }
  }
  const lastIdx = snapshots.length - 1
  const raw = buildRawValues(snapshots[lastIdx])
  const missingKeys = (Object.keys(raw) as SleepQualityComponentKey[]).filter((k) => raw[k] == null)
  return { point: series[lastIdx], snapshot: snapshots[lastIdx], raw, missingKeys }
}

export function NightQualityCard({ snapshots, variant = 'full', windowLabel }: NightQualityCardProps) {
  const { point, snapshot, raw, missingKeys } = useMemo(() => {
    const series = computeSleepQualityScoreSeries(snapshots)
    return findLatest(snapshots, series)
  }, [snapshots])

  if (snapshots.length === 0 || !snapshot || !point) return null

  // ─── Lembrete (score=null) ──────────────────────────────────────────────────
  if (point.score == null || !point.components || !point.klass) {
    const missing = missingKeys.map((k) => RAW_FIELDS_LABEL_PT[k]).join(', ')
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Qualidade da noite · {dayLabel(snapshot.date)}
          {windowLabel ? ` · janela ${windowLabel}` : ''}
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-900">
          Score parcial em construção
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {missing.length > 0
            ? `Faltam dados pra montar o score completo: ${missing}.`
            : 'Inputs insuficientes nesta noite.'}
        </p>
      </div>
    )
  }

  // ─── Estado pleno ───────────────────────────────────────────────────────────
  const meta = CLASS_META[point.klass]
  const dateLabel = dayLabel(snapshot.date)
  const isSummary = variant === 'summary'
  // BACKLOG #30: idem ao LimitingFactorCard — sinaliza quando a noite mostrada
  // não é a mais recente (fallback `findLatest` desce até achar noite com score).
  const todayKey = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const isLatest = snapshot.date === todayKey

  const componentRows: Array<{ key: SleepQualityComponentKey; label: string; weight: number }> = [
    { key: 'sleepEff', label: COMPONENT_LABEL.sleepEff, weight: SLEEP_QUALITY_WEIGHTS.sleepEff },
    { key: 'deep', label: COMPONENT_LABEL.deep, weight: SLEEP_QUALITY_WEIGHTS.deep },
    { key: 'rem', label: COMPONENT_LABEL.rem, weight: SLEEP_QUALITY_WEIGHTS.rem },
    { key: 'awake', label: COMPONENT_LABEL.awake, weight: SLEEP_QUALITY_WEIGHTS.awake },
    { key: 'respiratory', label: COMPONENT_LABEL.respiratory, weight: SLEEP_QUALITY_WEIGHTS.respiratory },
    { key: 'spo2', label: COMPONENT_LABEL.spo2, weight: SLEEP_QUALITY_WEIGHTS.spo2 },
  ]

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Qualidade da noite · {dateLabel}
            {windowLabel ? (
              <span className="ml-1.5 text-[0.6rem] font-normal opacity-70">
                · janela {windowLabel}
              </span>
            ) : null}
            {!isLatest && (
              <span className="ml-1.5 text-[0.6rem] font-normal opacity-70">
                · última noite completa
              </span>
            )}
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            {meta.headline}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${meta.badgeBg} ${meta.badgeText}`}
            >
              {meta.badge}
            </span>
            {point.flags.respiratoria && point.klass !== 'respiratoria' && (
              <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[0.7rem] font-medium text-rose-700">
                ⚠ resp.
              </span>
            )}
            {point.flags.autonomica && point.klass !== 'autonomica' && (
              <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[0.7rem] font-medium text-fuchsia-700">
                ⚠ autonômico
              </span>
            )}
            {point.derivedFromInterpolated && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.7rem] font-medium text-amber-700">
                ⚠ interp
              </span>
            )}
          </div>
        </div>
        <CardScoreBadge
          label="Score"
          value={point.score.toFixed(0)}
          valueColorClass={meta.scoreBg}
        />
      </div>

      {!isSummary && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
            Detalhe médico
          </summary>
          <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
            {componentRows.map(({ key, label, weight }) => {
              const compValue = point.components![key]
              const rawValue = raw[key]
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex-1">{label}</span>
                  <span className="text-[0.7rem] text-slate-400">{Math.round(weight * 100)}%</span>
                  <span className="w-14 text-right text-slate-500">{formatRaw(key, rawValue)}</span>
                  <span className="w-12 text-right font-semibold text-slate-800">
                    {Math.round(compValue)}/100
                  </span>
                </div>
              )
            })}
            <p className="mt-2 text-[0.7rem] leading-4 text-slate-400">
              Classes: respiratória &gt; autonômica &gt; fragmentada &gt; reparadora ≥75 &gt;
              regular. Pesos preliminares.
            </p>
          </div>
        </details>
      )}
    </div>
  )
}
