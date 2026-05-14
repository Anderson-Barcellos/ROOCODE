import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
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
import { computeHeartRateReserveSeries, HRR_BANDS, type HrrBand } from '@/utils/heart-rate-reserve'
import { ANDERS_HRMAX_BPM } from '@/utils/health-policies'
import { USER_PROFILE } from '@/utils/user-profile'

interface HeartRateReserveChartProps {
  snapshots: DailySnapshot[]
  baselineSnapshots?: DailySnapshot[]
}

const COLOR_TEAL = '#0f766e'
const COLOR_ROSE = '#e11d48'

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

const Y_PAD = 5

interface ChartRow {
  date: string
  label: string
  hrr: number | null
  hrrReal: number | null
  hrrInterp: number | null
  hrrSma7: number | null
  walkingReservePct: number | null
  rhr: number | null
  walkingHR: number | null
  band: HrrBand | null
  derivedFromInterpolated: boolean
}

function buildRows(baselineSnapshots: DailySnapshot[], snapshots: DailySnapshot[]): ChartRow[] {
  const series = computeHeartRateReserveSeries(baselineSnapshots)
  const byDate = new Map(series.map((point) => [point.date, point]))

  const rows: ChartRow[] = snapshots.map((snapshot, idx) => {
    const point = byDate.get(snapshot.date)
    const prevPoint = idx > 0 ? byDate.get(snapshots[idx - 1].date) : null
    const nextPoint = idx < snapshots.length - 1 ? byDate.get(snapshots[idx + 1].date) : null
    const isInterp = point?.derivedFromInterpolated ?? !!(snapshot.interpolated || snapshot.forecasted)
    const prevIsInterp = prevPoint?.derivedFromInterpolated ?? false
    const nextIsInterp = nextPoint?.derivedFromInterpolated ?? false
    return {
      date: snapshot.date,
      label: dayLabel(snapshot.date),
      hrr: point?.hrr ?? null,
      hrrReal: isInterp ? null : (point?.hrr ?? null),
      hrrInterp:
        isInterp
          ? (point?.hrr ?? null)
          : prevIsInterp || nextIsInterp
            ? (point?.hrr ?? null)
            : null,
      hrrSma7: point?.hrrSma7 ?? null,
      walkingReservePct: point?.walkingReservePct ?? null,
      rhr: point?.rhr ?? null,
      walkingHR: point?.walkingHR ?? null,
      band: point?.band ?? null,
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
        hrr: null,
        hrrReal: null,
        hrrInterp: null,
        hrrSma7: null,
        walkingReservePct: null,
        rhr: null,
        walkingHR: null,
        band: null,
        derivedFromInterpolated: false,
      })
    }
  }
  return withGaps
}

interface HrrTooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartRow }>
}

function HrrTooltip({ active, payload }: HrrTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row || row.hrr == null) return null
  const hrr = row.hrr

  return (
    <div className="rounded-2xl bg-white px-3 py-2 text-xs shadow-[0_18px_42px_rgba(17,35,30,0.12)]" style={TOOLTIP_STYLE}>
      <div className="mb-1 font-semibold text-slate-700">{row.label}</div>
      {row.derivedFromInterpolated && (
        <div className="mb-1 text-[0.62rem] font-medium text-amber-600">
          ⚠ estimado a partir de dia interp
        </div>
      )}
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          {hrr.toFixed(0)} bpm
        </span>
        {row.band && (
          <span className="text-[0.65rem] uppercase tracking-wider" style={{ color: row.band.color }}>
            {row.band.label}
          </span>
        )}
      </div>
      <div className="space-y-1 text-slate-600">
        {row.hrrSma7 != null && (
          <div className="flex justify-between gap-3">
            <span>SMA 7d</span>
            <span className="font-semibold text-slate-800">{row.hrrSma7.toFixed(0)} bpm</span>
          </div>
        )}
        {row.rhr != null && (
          <div className="flex justify-between gap-3">
            <span>FC Repouso</span>
            <span className="font-semibold text-slate-800">{row.rhr.toFixed(0)} bpm</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span>FC Máx estimada</span>
          <span className="font-semibold text-slate-800">{ANDERS_HRMAX_BPM} bpm</span>
        </div>
        {(row.walkingReservePct != null || row.walkingHR != null) && (
          <div className="mt-1 border-t border-slate-100 pt-1">
            {row.walkingReservePct != null && (
              <div className="flex justify-between gap-3">
                <span>% Reserva ao caminhar</span>
                <span className="font-semibold" style={{ color: COLOR_ROSE }}>
                  {row.walkingReservePct.toFixed(0)}%
                </span>
              </div>
            )}
            {row.walkingHR != null && (
              <div className="flex justify-between gap-3">
                <span>FC Caminhada</span>
                <span className="font-semibold text-slate-800">{row.walkingHR.toFixed(0)} bpm</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function buildHrrVerdict(row: ChartRow): { text: string; mood: 'good' | 'watch' | 'alert' } {
  if (row.hrr == null || row.band == null) {
    return {
      text: 'Sem dados suficientes para estimar reserva cardíaca de forma confiável.',
      mood: 'watch',
    }
  }

  if (row.band.tone === 'positive') {
    return {
      text: 'Reserva cardíaca boa para esforço aeróbico. Sinal favorável de capacidade cardiovascular funcional.',
      mood: 'good',
    }
  }

  if (row.band.tone === 'watch') {
    return {
      text: 'Reserva cardíaca moderada. Dá para evoluir com treino regular e melhora de recuperação basal.',
      mood: 'watch',
    }
  }

  return {
    text: 'Reserva cardíaca reduzida no momento. Priorize condicionamento progressivo e revisão de carga de estresse.',
    mood: 'alert',
  }
}

export function HeartRateReserveChart({ snapshots, baselineSnapshots }: HeartRateReserveChartProps) {
  const baselineSource = baselineSnapshots ?? snapshots
  const data = useMemo(() => buildRows(baselineSource, snapshots), [baselineSource, snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.heartRateReserveChart, 'Heart Rate Reserve'),
    [snapshots],
  )

  const hasWalkingData = useMemo(() => data.some((r) => r.walkingReservePct != null), [data])

  const latest = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const row = data[i]
      if (row.hrr != null) return row
    }
    return null
  }, [data])

  const yDomain = useMemo<[number, number]>(() => {
    let min = HRR_BANDS[0].max
    let max = HRR_BANDS[2].max
    for (const row of data) {
      if (row.hrr != null) {
        if (row.hrr < min) min = row.hrr
        if (row.hrr > max) max = row.hrr
      }
      if (row.hrrSma7 != null) {
        if (row.hrrSma7 < min) min = row.hrrSma7
        if (row.hrrSma7 > max) max = row.hrrSma7
      }
    }
    return [Math.max(0, Math.floor(min - Y_PAD)), Math.ceil(max + Y_PAD)]
  }, [data])

  const chartBody = (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: hasWalkingData ? 44 : 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={22}
          />
          <YAxis
            yAxisId="left"
            domain={yDomain}
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => `${v}`}
          />
          {hasWalkingData && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: COLOR_ROSE, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
              stroke={COLOR_ROSE}
            />
          )}
          <ReferenceArea yAxisId="left" y1={yDomain[0]} y2={Math.min(100, yDomain[1])} fill="#fca5a5" fillOpacity={0.08} />
          <ReferenceArea yAxisId="left" y1={Math.max(100, yDomain[0])} y2={Math.min(115, yDomain[1])} fill="#fed7aa" fillOpacity={0.06} />
          <ReferenceArea yAxisId="left" y1={Math.max(115, yDomain[0])} y2={Math.min(125, yDomain[1])} fill="#bbf7d0" fillOpacity={0.06} />
          <ReferenceArea yAxisId="left" y1={Math.max(125, yDomain[0])} y2={yDomain[1]} fill="#86efac" fillOpacity={0.08} />
          <Tooltip content={<HrrTooltip />} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="hrrReal"
            stroke={COLOR_TEAL}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="HRR"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="hrrInterp"
            stroke={COLOR_TEAL}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="HRR (estimado)"
            legendType="none"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="hrrSma7"
            stroke={COLOR_TEAL}
            strokeWidth={2.6}
            dot={false}
            connectNulls={false}
            name="SMA 7d"
          />
          {hasWalkingData && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="walkingReservePct"
              stroke={COLOR_ROSE}
              strokeWidth={1.8}
              strokeDasharray="4 2"
              dot={{ r: 2, fill: COLOR_ROSE, stroke: '#fff', strokeWidth: 1 }}
              activeDot={{ r: 4 }}
              connectNulls={false}
              name="% Reserva caminhada"
            />
          )}
          {hasWalkingData && (
            <ReferenceLine
              yAxisId="right"
              y={50}
              stroke={COLOR_ROSE}
              strokeDasharray="4 3"
              strokeOpacity={0.4}
              strokeWidth={1}
              label={{ value: '50% HRR', position: 'insideTopRight', fontSize: 10, fill: COLOR_ROSE }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )

  const latestBandColor = latest?.band?.color
  const latestBandLabel = latest?.band?.label
  const verdict = latest ? buildHrrVerdict(latest) : null
  const verdictClass =
    verdict?.mood === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : verdict?.mood === 'alert'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-amber-200 bg-amber-50 text-amber-900'

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Coração · Reserva
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Reserva Cardíaca
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            HRmax estimada ({ANDERS_HRMAX_BPM} bpm) − FC Repouso. Representa a capacidade cardiovascular de
            resposta ao esforço. Linha rosa tracejada = % da reserva utilizada durante caminhada
            (fórmula de Karvonen).
          </p>
          {verdict && (
            <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
              <span className="font-semibold">Veredito:</span> {verdict.text}
            </p>
          )}
        </div>
        {latest != null && latest.hrr != null && (
          <CardScoreBadge
            label="Último"
            value={`${latest.hrr.toFixed(0)} bpm`}
            band={latestBandLabel || undefined}
            bandColor={latestBandColor}
            hint={latest.label}
          />
        )}
      </div>

      <DataReadinessGate readiness={readiness}>{chartBody}</DataReadinessGate>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Sobre a Reserva Cardíaca
        </summary>
        <div className="mt-2 space-y-2 text-xs leading-5 text-slate-500">
          <p>
            Reserva Cardíaca = FC Máxima − FC Repouso. Representa a capacidade total de resposta do
            coração ao esforço. Atletas e pessoas condicionadas têm reserva alta (RHR baixo);
            sedentarismo e destreinamento reduzem a reserva progressivamente.
          </p>
          <p>
            % Reserva ao Caminhar (fórmula de Karvonen): indica a intensidade relativa da sua
            caminhada diária em relação à sua capacidade. Orientação ACSM: 40-60% da reserva
            corresponde a atividade moderada ideal para condicionamento aeróbico. Valores abaixo de
            30% indicam caminhada muito leve; acima de 70% indica esforço vigoroso para caminhada.
          </p>
          <p>
            FC Máxima estimada = 220 − idade ({USER_PROFILE.age}) = {ANDERS_HRMAX_BPM} bpm (Fox-Haskell). Estimativa populacional
            — a FC máxima individual pode variar ±10-12 bpm.
          </p>
        </div>
      </details>
    </div>
  )
}
