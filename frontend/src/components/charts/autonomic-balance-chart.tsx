import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import { calculateDayGapDays, dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { TOOLTIP_DEFAULTS } from '@/components/charts/shared/tooltip-helpers'
import { sma } from '@/utils/statistics'
import {
  ABI_BAND_THRESHOLD,
  computeAbiSeries,
  type AbiComponents,
} from '@/utils/autonomic-balance'

interface AutonomicBalanceChartProps {
  snapshots: DailySnapshot[]
  baselineSnapshots?: DailySnapshot[]
}

const COLOR_LINE = '#0f766e'
const COLOR_SMA = '#0f766e'
const COLOR_RED = '#ef4444'
const COLOR_AMBER = '#f59e0b'
const COLOR_GREEN = '#10b981'
const Y_PAD = 0.5

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

interface ChartRow {
  date: string
  label: string
  abiReal: number | null
  abiInterp: number | null
  abiBridge: number | null
  sma7: number | null
  components: AbiComponents | null
  derivedFromInterpolated: boolean
}

function bandLabel(z: number): { text: string; color: string } {
  if (z >= ABI_BAND_THRESHOLD) return { text: 'Parassimpático', color: COLOR_GREEN }
  if (z < -ABI_BAND_THRESHOLD) return { text: 'Simpático', color: COLOR_RED }
  return { text: 'Equilibrado', color: COLOR_AMBER }
}

function abiVerdict(z: number): { text: string; tone: 'good' | 'watch' | 'alert' } {
  if (z >= 1.5) {
    return {
      text: 'Sistema nervoso em modo recuperação forte. Bom para recuperação; se houver fadiga/queda de performance, monitorar excesso de carga.',
      tone: 'good',
    }
  }
  if (z >= 1) {
    return {
      text: 'Predomínio parassimpático saudável hoje. Boa prontidão para esforço com recuperação preservada.',
      tone: 'good',
    }
  }
  if (z > -0.6) {
    return {
      text: 'Sistema nervoso em equilíbrio funcional, levemente voltado à recuperação.',
      tone: 'watch',
    }
  }
  if (z > -1) {
    return {
      text: 'Equilíbrio pendendo para ativação simpática. Vale reduzir carga e reforçar sono hoje.',
      tone: 'watch',
    }
  }
  return {
    text: 'Predomínio simpático importante: sinal de estresse fisiológico. Priorize recuperação antes de esforço intenso.',
    tone: 'alert',
  }
}

function buildRows(baselineSnapshots: DailySnapshot[], snapshots: DailySnapshot[]): ChartRow[] {
  const series = computeAbiSeries(baselineSnapshots)
  const byDate = new Map(series.map((point) => [point.date, point]))
  const alignedSeries = snapshots.map((snapshot) => byDate.get(snapshot.date) ?? null)
  const abiValues = alignedSeries.map((p) => p?.abi ?? null)
  const smaValues = sma(abiValues, 7)

  const rows: ChartRow[] = snapshots.map((snapshot, idx) => {
    const point = alignedSeries[idx]
    const prevPoint = idx > 0 ? alignedSeries[idx - 1] : null
    const nextPoint = idx < alignedSeries.length - 1 ? alignedSeries[idx + 1] : null
    const isInterp = point?.derivedFromInterpolated ?? !!(snapshot.interpolated || snapshot.forecasted)
    const prevIsInterp = prevPoint?.derivedFromInterpolated ?? false
    const nextIsInterp = nextPoint?.derivedFromInterpolated ?? false
    return {
      date: snapshot.date,
      label: dayLabel(snapshot.date),
      abiReal: isInterp ? null : (point?.abi ?? null),
      abiInterp:
        isInterp
          ? (point?.abi ?? null)
          : prevIsInterp || nextIsInterp
            ? (point?.abi ?? null)
            : null,
      abiBridge: point?.abi ?? null,
      sma7: smaValues[idx],
      components: point?.components ?? null,
      derivedFromInterpolated: isInterp,
    }
  })

  if (rows.length < 2) return rows

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
        abiReal: null,
        abiInterp: null,
        abiBridge: null,
        sma7: null,
        components: null,
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

function AbiTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row || (row.abiReal == null && row.abiInterp == null) || !row.components) return null
  const abi = (row.abiReal ?? row.abiInterp)!
  const band = bandLabel(abi)
  const { hrv, rhr, ratio, logRatio, zScore } = row.components

  return (
    <div className="rounded-2xl bg-white px-3 py-2 text-xs shadow-[0_18px_42px_rgba(17,35,30,0.12)]" style={TOOLTIP_STYLE}>
      <div className="mb-1 font-semibold text-slate-700">{row.label}</div>
      {row.derivedFromInterpolated && (
        <div className="mb-1 text-[0.62rem] font-medium text-amber-600 dark:text-amber-300">
          ⚠ estimado a partir de dia interp
        </div>
      )}
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          {zScore >= 0 ? '+' : ''}
          {zScore.toFixed(2)}
        </span>
        <span className="text-[0.65rem] uppercase tracking-wider" style={{ color: band.color }}>
          {band.text}
        </span>
      </div>
      <div className="space-y-1 text-slate-600">
        <div className="flex justify-between gap-3">
          <span>HRV</span>
          <span className="font-semibold text-slate-800">{hrv.toFixed(1)} ms</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>FC repouso</span>
          <span className="font-semibold text-slate-800">{rhr.toFixed(0)} bpm</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>HRV / FC</span>
          <span className="font-semibold text-slate-800">{ratio.toFixed(3)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>ln(HRV/FC)</span>
          <span className="font-semibold text-slate-800">{logRatio.toFixed(3)}</span>
        </div>
        {row.sma7 != null && (
          <div className="flex justify-between gap-3 border-t border-slate-100 pt-1">
            <span>SMA 7d</span>
            <span className="font-semibold text-slate-800">
              {row.sma7 >= 0 ? '+' : ''}
              {row.sma7.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function AutonomicBalanceChart({ snapshots, baselineSnapshots }: AutonomicBalanceChartProps) {
  const baselineSource = baselineSnapshots ?? snapshots
  const data = useMemo(() => buildRows(baselineSource, snapshots), [baselineSource, snapshots])
  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.autonomicBalanceChart, 'Autonomic Balance'),
    [snapshots],
  )

  const latest = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const row = data[i]
      if (row.abiReal != null || row.abiInterp != null) return row
    }
    return null
  }, [data])

  const yDomain = useMemo<[number, number]>(() => {
    let min = -ABI_BAND_THRESHOLD - Y_PAD
    let max = ABI_BAND_THRESHOLD + Y_PAD
    for (const row of data) {
      const abi = row.abiReal ?? row.abiInterp
      if (abi != null) {
        if (abi < min) min = abi - Y_PAD
        if (abi > max) max = abi + Y_PAD
      }
    }
    return [Math.floor(min), Math.ceil(max)]
  }, [data])

  const chartBody = (
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
            domain={yDomain}
            ticks={[yDomain[0], -ABI_BAND_THRESHOLD, 0, ABI_BAND_THRESHOLD, yDomain[1]]}
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v: number) => (v >= 0 ? `+${v.toFixed(0)}σ` : `${v.toFixed(0)}σ`)}
          />
          <ReferenceArea y1={yDomain[0]} y2={-ABI_BAND_THRESHOLD} fill={COLOR_RED} fillOpacity={0.08} />
          <ReferenceArea y1={-ABI_BAND_THRESHOLD} y2={ABI_BAND_THRESHOLD} fill={COLOR_AMBER} fillOpacity={0.06} />
          <ReferenceArea y1={ABI_BAND_THRESHOLD} y2={yDomain[1]} fill={COLOR_GREEN} fillOpacity={0.08} />
          <ReferenceLine y={0} stroke="rgba(15,23,42,0.25)" strokeDasharray="4 3" strokeWidth={1} />
          <Tooltip {...TOOLTIP_DEFAULTS} content={<AbiTooltip />} />
          <Line
            type="monotone"
            dataKey="abiBridge"
            stroke={COLOR_LINE}
            strokeWidth={1.2}
            strokeOpacity={0.22}
            strokeDasharray="1 5"
            dot={false}
            activeDot={false}
            connectNulls
            name="ABI (ligação visual)"
            legendType="none"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="abiReal"
            stroke={COLOR_LINE}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="ABI"
          />
          <Line
            type="monotone"
            dataKey="abiInterp"
            stroke={COLOR_LINE}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="ABI (estimado)"
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="sma7"
            stroke={COLOR_SMA}
            strokeWidth={2.6}
            dot={false}
            connectNulls={false}
            name="SMA 7d"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  const latestAbi = latest != null ? (latest.abiReal ?? latest.abiInterp) : null
  const latestBand = latestAbi != null ? bandLabel(latestAbi) : null
  const verdict = latestAbi != null ? abiVerdict(latestAbi) : null
  const verdictClass =
    verdict?.tone === 'good'
      ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
      : verdict?.tone === 'alert'
        ? 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200'
        : 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200'

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Coração · ABI
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Autonomic Balance Index
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            z-score pessoal de <span className="font-mono text-[0.78rem]">ln(HRV / FC repouso)</span>.
            Captura balanço simpato-parassimpático em uma única série. Linha tênue = z diário;
            linha grossa = SMA 7d (tendência). As bandas são referência visual; o veredito clínico
            em linguagem humana é a fonte principal de leitura.
          </p>
          {verdict && (
            <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
              <span className="font-semibold">Veredito:</span> {verdict.text}
            </p>
          )}
        </div>
        {latestAbi != null && latestBand && (
          <CardScoreBadge
            label="Último"
            value={`${latestAbi >= 0 ? '+' : ''}${latestAbi.toFixed(2)}σ`}
            band={latestBand.text}
            bandColor={latestBand.color}
            hint={latest?.label}
          />
        )}
      </div>

      <DataReadinessGate readiness={readiness}>{chartBody}</DataReadinessGate>
    </div>
  )
}
