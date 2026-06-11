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
import { computeChronotropicSeries, type ChronotropicComponents } from '@/utils/chronotropic-response'

interface ChronotropicResponseChartProps {
  snapshots: DailySnapshot[]
  baselineSnapshots?: DailySnapshot[]
}

const BAND_THRESHOLD = 1
const COLOR_LINE = '#0369a1'
const COLOR_SMA = '#0369a1'
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
  zReal: number | null
  zInterp: number | null
  sma7: number | null
  components: ChronotropicComponents | null
  derivedFromInterpolated: boolean
}

function bandLabel(z: number): { text: string; color: string } {
  if (z >= BAND_THRESHOLD) return { text: 'Elevado', color: COLOR_GREEN }
  if (z < -BAND_THRESHOLD) return { text: 'Reduzido', color: COLOR_RED }
  return { text: 'Normal', color: COLOR_AMBER }
}

function chronotropicVerdict(z: number): { text: string; mood: 'good' | 'watch' | 'alert' } {
  if (z >= 1) {
    return {
      text: 'Resposta cardíaca ao esforço leve acima do teu padrão. Boa competência cronotrópica hoje.',
      mood: 'good',
    }
  }
  if (z > -0.5) {
    return {
      text: 'Resposta cardíaca ao esforço leve dentro do esperado para teu baseline.',
      mood: 'good',
    }
  }
  if (z > -1) {
    return {
      text: 'Resposta cardíaca a esforço leve dentro do esperado, porém levemente comprimida — manter monitoramento.',
      mood: 'watch',
    }
  }
  return {
    text: 'Resposta cronotrópica reduzida frente ao teu baseline. Pode sugerir sedação autonômica ou baixa prontidão; acompanhar tendência.',
    mood: 'alert',
  }
}

function buildRows(baselineSnapshots: DailySnapshot[], snapshots: DailySnapshot[]): ChartRow[] {
  const series = computeChronotropicSeries(baselineSnapshots)
  const byDate = new Map(series.map((point) => [point.date, point]))
  const alignedSeries = snapshots.map((snapshot) => byDate.get(snapshot.date) ?? null)

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
      zReal: isInterp ? null : (point?.zScore ?? null),
      zInterp:
        isInterp
          ? (point?.zScore ?? null)
          : prevIsInterp || nextIsInterp
            ? (point?.zScore ?? null)
            : null,
      sma7: point?.sma7 ?? null,
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
        zReal: null,
        zInterp: null,
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

function ChronotropicTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row || (row.zReal == null && row.zInterp == null) || !row.components) return null
  const z = (row.zReal ?? row.zInterp)!
  const band = bandLabel(z)
  const { walkingHR, rhr, delta, zScore } = row.components

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
          <span>FC Caminhada</span>
          <span className="font-semibold text-slate-800">{walkingHR.toFixed(0)} bpm</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>FC Repouso</span>
          <span className="font-semibold text-slate-800">{rhr.toFixed(0)} bpm</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Delta</span>
          <span className="font-semibold text-slate-800">{delta.toFixed(0)} bpm</span>
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

export function ChronotropicResponseChart({ snapshots, baselineSnapshots }: ChronotropicResponseChartProps) {
  const baselineSource = baselineSnapshots ?? snapshots
  const data = useMemo(() => buildRows(baselineSource, snapshots), [baselineSource, snapshots])
  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.chronotropicResponseChart, 'Chronotropic Response'),
    [snapshots],
  )

  const latest = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const row = data[i]
      if (row.zReal != null || row.zInterp != null) return row
    }
    return null
  }, [data])

  const yDomain = useMemo<[number, number]>(() => {
    let min = -BAND_THRESHOLD - Y_PAD
    let max = BAND_THRESHOLD + Y_PAD
    for (const row of data) {
      const z = row.zReal ?? row.zInterp
      if (z != null) {
        if (z < min) min = z - Y_PAD
        if (z > max) max = z + Y_PAD
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
            ticks={[yDomain[0], -BAND_THRESHOLD, 0, BAND_THRESHOLD, yDomain[1]]}
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v: number) => (v >= 0 ? `+${v.toFixed(0)}σ` : `${v.toFixed(0)}σ`)}
          />
          <ReferenceArea y1={yDomain[0]} y2={-BAND_THRESHOLD} fill={COLOR_RED} fillOpacity={0.08} />
          <ReferenceArea y1={-BAND_THRESHOLD} y2={BAND_THRESHOLD} fill={COLOR_AMBER} fillOpacity={0.06} />
          <ReferenceArea y1={BAND_THRESHOLD} y2={yDomain[1]} fill={COLOR_GREEN} fillOpacity={0.08} />
          <ReferenceLine y={0} stroke="rgba(15,23,42,0.25)" strokeDasharray="4 3" strokeWidth={1} />
          <Tooltip content={<ChronotropicTooltip />} />
          <Line
            type="monotone"
            dataKey="zReal"
            stroke={COLOR_LINE}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="z-score"
          />
          <Line
            type="monotone"
            dataKey="zInterp"
            stroke={COLOR_LINE}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="z-score (estimado)"
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

  const latestZ = latest != null ? (latest.zReal ?? latest.zInterp) : null
  const latestBand = latestZ != null ? bandLabel(latestZ) : null
  const verdict = latestZ != null ? chronotropicVerdict(latestZ) : null
  const verdictClass =
    verdict?.mood === 'good'
      ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
      : verdict?.mood === 'alert'
        ? 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200'
        : 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200'

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Coração · Resposta Cronotrópica
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Resposta Cronotrópica
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            z-score pessoal de FC Caminhada − FC Repouso. Mede a competência cronotrópica — quanto o coração
            acelera durante esforço leve. As bandas servem como referência visual; a leitura clínica final
            está no veredito textual.
          </p>
          {verdict && (
            <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
              <span className="font-semibold">Veredito:</span> {verdict.text}
            </p>
          )}
        </div>
        {latestZ != null && latestBand && (
          <CardScoreBadge
            label="Último"
            value={`${latestZ >= 0 ? '+' : ''}${latestZ.toFixed(2)}σ`}
            band={latestBand.text}
            bandColor={latestBand.color}
            hint={latest?.label}
          />
        )}
      </div>

      <DataReadinessGate readiness={readiness}>{chartBody}</DataReadinessGate>

      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-600">
          Sobre competência cronotrópica
        </summary>
        <p className="mt-2 leading-5">
          Competência cronotrópica: capacidade do coração de elevar a frequência cardíaca proporcionalmente
          ao esforço. O delta aqui medido (FC caminhada − FC repouso) é normalizado pelo seu histórico pessoal
          via z-score. Valores pessoalmente baixos (z &lt; −1σ) podem indicar: sedação autonômica (clonazepam),
          efeito parassimpático excessivo (escitalopram em doses altas), ou descondicionamento. Valores altos
          (z &gt; +1σ) podem refletir caminhada mais intensa ou melhora no condicionamento aeróbico.
        </p>
        <p className="mt-1 leading-5">
          Referências: Brubaker PH &amp; Kitzman DW. Chronotropic incompetence. Circulation 2011;
          Cole CR et al. Heart-rate recovery. NEJM 1999.
        </p>
      </details>
    </div>
  )
}
