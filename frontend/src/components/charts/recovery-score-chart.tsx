import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import { calculateDayGapDays, dayLabel } from '@/utils/aggregation'
import {
  RECOVERY_WEIGHTS,
  computeRecoveryScoreSeries,
  type RecoveryComponentKey,
  type RecoveryComponents,
  type RecoveryScorePoint,
} from '@/utils/recovery-score'
import {
  badgeColor,
  badgeLabel,
  computeRecoveryCoverage,
} from '@/utils/recovery-coverage'

interface RecoveryScoreChartProps {
  snapshots: DailySnapshot[]
  baselineSnapshots?: DailySnapshot[]
}

const BAND_LOW = 33
const BAND_HIGH = 66
const COLOR_LINE = '#0f766e'
const COLOR_RED = '#ef4444'
const COLOR_AMBER = '#f59e0b'
const COLOR_GREEN = '#10b981'

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

interface ChartRow {
  date: string
  label: string
  /** Score em dias completos (5/5 inputs reais, não interpolado). */
  scoreReal: number | null
  /** Score em dias parciais (3-4/5 inputs reais, não interpolado). */
  scorePartial: number | null
  /** Score em dias interpolados/forecast (qualquer completude). */
  scoreInterp: number | null
  components: RecoveryComponents | null
  inputsUsed: ReadonlyArray<RecoveryComponentKey>
  completeness: number
  derivedFromInterpolated: boolean
  reason?: 'baseline_missing' | 'inputs_missing'
}

function buildRows(
  series: ReadonlyArray<RecoveryScorePoint>,
  snapshots: DailySnapshot[],
): ChartRow[] {
  const byDate = new Map(series.map((point) => [point.date, point]))
  const rows: ChartRow[] = snapshots.map((snapshot, idx) => {
    const point = byDate.get(snapshot.date)
    const prevPoint = idx > 0 ? byDate.get(snapshots[idx - 1].date) : null
    const nextPoint = idx < snapshots.length - 1 ? byDate.get(snapshots[idx + 1].date) : null
    const isInterp = point?.derivedFromInterpolated ?? !!(snapshot.interpolated || snapshot.forecasted)
    const prevIsInterp = prevPoint?.derivedFromInterpolated ?? false
    const nextIsInterp = nextPoint?.derivedFromInterpolated ?? false
    const completeness = point?.completeness ?? 0
    const isComplete = !isInterp && completeness >= 1
    const isPartial = !isInterp && completeness > 0 && completeness < 1
    const score = point?.score ?? null

    return {
      date: snapshot.date,
      label: dayLabel(snapshot.date),
      scoreReal: isComplete ? score : null,
      // Linha pontilhada de "parcial" cobre só dias reais com 3-4/5 inputs.
      // Dias interpolados vão na linha de interp (que já era tracejada).
      scorePartial: isPartial ? score : null,
      // Include boundary real days adjacent to interp segments so the dashed
      // interp line connects without gaps at the transition point.
      scoreInterp:
        isInterp
          ? score
          : prevIsInterp || nextIsInterp
            ? score
            : null,
      components: point?.components ?? null,
      inputsUsed: point?.inputsUsed ?? [],
      completeness,
      derivedFromInterpolated: isInterp,
      reason: point?.reason,
    }
  })

  if (rows.length < 2) return rows

  // Insere gap rows quando há buracos >2d (mesmo padrão do timeline-chart).
  const withGaps: ChartRow[] = []
  for (let i = 0; i < rows.length; i += 1) {
    const current = rows[i]
    withGaps.push(current)
    const next = rows[i + 1]
    if (!next) continue
    if (calculateDayGapDays(current.date, next.date) > 2) {
      withGaps.push({
        date: `${current.date}-gap`,
        label: '',
        scoreReal: null,
        scorePartial: null,
        scoreInterp: null,
        components: null,
        inputsUsed: [],
        completeness: 0,
        derivedFromInterpolated: false,
      })
    }
  }
  return withGaps
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartRow }>
}

function RecoveryTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (
    !row ||
    (row.scoreReal == null && row.scoreInterp == null && row.scorePartial == null) ||
    !row.components
  ) {
    return null
  }
  const score = row.scoreReal ?? row.scorePartial ?? row.scoreInterp
  const usedSet = new Set<RecoveryComponentKey>(row.inputsUsed)
  const isPartial = row.completeness > 0 && row.completeness < 1
  const missingCount = 5 - row.inputsUsed.length

  const componentRows: Array<{ key: RecoveryComponentKey; label: string; weight: number }> = [
    { key: 'hrv', label: 'HRV (z-score)', weight: RECOVERY_WEIGHTS.hrv },
    { key: 'sleepEff', label: 'Eficiência sono', weight: RECOVERY_WEIGHTS.sleepEff },
    { key: 'rhr', label: 'FC repouso (z invertido)', weight: RECOVERY_WEIGHTS.rhr },
    { key: 'sleepDebt', label: 'Débito sono 7d', weight: RECOVERY_WEIGHTS.sleepDebt },
    { key: 'mood', label: 'Humor (valência)', weight: RECOVERY_WEIGHTS.mood },
  ]

  return (
    <div
      className="rounded-2xl bg-white px-3 py-2 text-xs shadow-[0_18px_42px_rgba(17,35,30,0.12)]"
      style={TOOLTIP_STYLE}
    >
      <div className="mb-1 font-semibold text-slate-700">{row.label}</div>
      {row.derivedFromInterpolated && (
        <div className="mb-1 text-[0.62rem] font-medium text-amber-600 dark:text-amber-300">
          ⚠ estimado a partir de dia interp
        </div>
      )}
      {!row.derivedFromInterpolated && isPartial && (
        <div className="mb-1 text-[0.62rem] font-medium text-indigo-600 dark:text-indigo-300">
          ◔ parcial · {row.inputsUsed.length}/5 inputs · {missingCount} ausente{missingCount > 1 ? 's' : ''}
        </div>
      )}
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          {score!.toFixed(0)}
        </span>
        <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">/ 100</span>
      </div>
      <div className="space-y-1">
        {componentRows.map(({ key, label, weight }) => {
          const value = row.components![key]
          const used = usedSet.has(key)
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-2 rounded-full" />
              <span className={`flex-1 ${used ? 'text-slate-600' : 'text-slate-300 line-through'}`}>
                {label}
              </span>
              <span className="text-[0.65rem] text-slate-400">{Math.round(weight * 100)}%</span>
              <span
                className={`w-9 text-right font-semibold ${used ? 'text-slate-800' : 'text-slate-300'}`}
              >
                {used ? value.toFixed(0) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RecoveryScoreChart({ snapshots, baselineSnapshots }: RecoveryScoreChartProps) {
  const baselineSource = baselineSnapshots ?? snapshots
  const series = useMemo(
    () => computeRecoveryScoreSeries(baselineSource),
    [baselineSource],
  )
  const data = useMemo(() => buildRows(series, snapshots), [series, snapshots])
  const coverage = useMemo(() => {
    // Filtra a série pra incluir apenas as datas presentes em `snapshots`.
    const snapshotDates = new Set(snapshots.map((s) => s.date))
    return computeRecoveryCoverage(series.filter((p) => snapshotDates.has(p.date)))
  }, [series, snapshots])
  const badge = coverage.badge
  const badgeColors = badgeColor(badge)

  const latest = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const row = data[i]
      if (row.scoreReal != null || row.scorePartial != null || row.scoreInterp != null) {
        return row
      }
    }
    return null
  }, [data])

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Composto · preliminary calibration
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Recovery Score
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            Score 0-100 estilo Whoop. Pesos: 30% HRV, 25% eficiência sono, 20% FC repouso, 15%
            débito sono 7d, 10% humor. Pesos preliminares — sprint futura pode recalibrar via
            correlação com sintomas reportados.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {coverage.completeDays}/{coverage.totalDays} dias completos
            {coverage.partialDays > 0
              ? ` · ${coverage.partialDays} parciais (3-4/5 inputs)`
              : ''}
            {coverage.interpolatedDays > 0
              ? ` · ${coverage.interpolatedDays} interpolados`
              : ''}
            {coverage.baselineMissingDays > 0
              ? ` · ${coverage.baselineMissingDays} sem baseline pessoal`
              : ''}
          </p>
        </div>
        {latest != null && (
          <CardScoreBadge
            label="Último"
            value={(latest.scoreReal ?? latest.scorePartial ?? latest.scoreInterp)!.toFixed(0)}
            hint={latest.label}
          />
        )}
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={22}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 33, 66, 100]}
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <ReferenceArea y1={0} y2={BAND_LOW} fill={COLOR_RED} fillOpacity={0.08} />
            <ReferenceArea y1={BAND_LOW} y2={BAND_HIGH} fill={COLOR_AMBER} fillOpacity={0.08} />
            <ReferenceArea y1={BAND_HIGH} y2={100} fill={COLOR_GREEN} fillOpacity={0.08} />
            <Tooltip content={<RecoveryTooltip />} />
            <Line
              type="monotone"
              dataKey="scoreReal"
              stroke={COLOR_LINE}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls={false}
              name="Recovery Score"
            />
            <Line
              type="monotone"
              dataKey="scorePartial"
              stroke={COLOR_LINE}
              strokeWidth={1.8}
              strokeOpacity={0.55}
              strokeDasharray="2 3"
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              name="Recovery Score (parcial)"
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="scoreInterp"
              stroke={COLOR_LINE}
              strokeWidth={2.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls={false}
              name="Recovery Score (estimado)"
              legendType="none"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p
        className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColors.bg} ${badgeColors.text}`}
      >
        <span aria-hidden>●</span>
        <span>
          {badgeLabel(badge)} · {coverage.completeDays}/{coverage.totalDays} dias completos
          {coverage.totalDays > 0
            ? ` (${Math.round(coverage.completeRatio * 100)}%)`
            : ''}
        </span>
      </p>
    </div>
  )
}
