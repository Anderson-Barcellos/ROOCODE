import { Fragment } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { TimelinePoint, TimelineSeriesKey } from '@/types/apple-health'
import { calculateDayGapDays, dayLabel } from '@/utils/aggregation'
import type { DataReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from './shared/DataReadinessGate'

interface TimelineChartProps {
  data: TimelinePoint[]
  seriesKeys: TimelineSeriesKey[]
  labels: Record<TimelineSeriesKey, string>
  readiness?: DataReadiness
}

const seriesPalette: Record<TimelineSeriesKey, string> = {
  sleepTotalHours: '#0f766e',
  sleepEfficiencyPct: '#0f766e',
  restingHeartRate: '#be123c',
  hrvSdnn: '#2563eb',
  spo2: '#7c3aed',
  activeEnergyKcal: '#ea580c',
  exerciseMinutes: '#ca8a04',
  movementMinutes: '#c2410c',
  standingMinutes: '#fb7185',
  daylightMinutes: '#f59e0b',
  valence: '#15803d',
}

/**
 * Splita cada série em real_<key> e interp_<key> pra renderizar solid vs dashed.
 * Real: valor em dias não-interpolados, null nos interpolados.
 * Interp: valor em dias interpolados + valores-fronteira (dia real adjacente a
 *         um interpolado) pra conectar visualmente o segmento tracejado.
 */
function flattenData(data: TimelinePoint[], seriesKeys: TimelineSeriesKey[]) {
  const rows = data.map((point, idx) => {
    const row: Record<string, number | string | boolean | null> = {
      date: point.date,
      label: dayLabel(point.date),
      interpolated: point.interpolated === true,
    }
    const isInterp = point.interpolated === true
    const prevInterp = data[idx - 1]?.interpolated === true
    const nextInterp = data[idx + 1]?.interpolated === true

    for (const key of seriesKeys) {
      const v = point.values[key] ?? null
      if (isInterp) {
        row[`${key}_real`] = null
        row[`${key}_interp`] = v
      } else {
        row[`${key}_real`] = v
        row[`${key}_interp`] = prevInterp || nextInterp ? v : null
      }
    }
    return row
  })

  if (rows.length < 2) return rows

  const flattened: Array<Record<string, number | string | boolean | null>> = []

  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index]
    flattened.push(current)

    const next = rows[index + 1]
    if (!next) continue

    if (calculateDayGapDays(current.date as string, next.date as string) > 2) {
      const gapRow: Record<string, number | string | boolean | null> = {
        date: `${current.date}-gap`,
        label: '',
        interpolated: false,
      }
      for (const key of seriesKeys) {
        gapRow[`${key}_real`] = null
        gapRow[`${key}_interp`] = null
      }
      flattened.push(gapRow)
    }
  }

  return flattened
}

interface TooltipRow {
  dataKey: string
  value: number
  color: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TimelineTooltip({ active, payload, label, labels }: any) {
  if (!active || !payload?.length) return null
  const rows = payload as TooltipRow[]
  const isInterp = rows[0]?.value != null && rows.some((r) => r.dataKey.endsWith('_interp'))
  // Consolida: para cada série base mostra um único valor (real ou interp)
  const shown = new Map<string, TooltipRow>()
  for (const r of rows) {
    if (r.value == null) continue
    const base = r.dataKey.replace(/_real$|_interp$/, '')
    if (!shown.has(base)) shown.set(base, { ...r, dataKey: base })
  }
  if (shown.size === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-xs shadow-[0_18px_42px_rgba(17,35,30,0.12)]">
      <div className="mb-1 font-semibold text-slate-700">{label}</div>
      {Array.from(shown.values()).map((r) => (
        <div key={r.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
          <span className="text-slate-600">{labels[r.dataKey as TimelineSeriesKey] ?? r.dataKey}:</span>
          <span className="font-semibold text-slate-900">{typeof r.value === 'number' ? r.value.toFixed(1) : r.value}</span>
        </div>
      ))}
      {isInterp && (
        <div className="mt-1 flex items-center gap-1 border-t border-slate-100 pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-amber-700">
          <span>⚠</span>
          <span>estimado</span>
        </div>
      )}
    </div>
  )
}

export function TimelineChart({ data, seriesKeys, labels, readiness }: TimelineChartProps) {
  const chartData = flattenData(data, seriesKeys)

  const chartBody = (
    <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 16, right: 18, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.14)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#475569', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={18}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#475569', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#475569', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip content={<TimelineTooltip labels={labels} />} />
            <Legend />

            {seriesKeys.map((key, index) => (
              <Fragment key={key}>
                <Line
                  key={`${key}-real`}
                  type="monotone"
                  dataKey={`${key}_real`}
                  yAxisId={index === 0 ? 'left' : 'right'}
                  stroke={seriesPalette[key]}
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 5 }}
                  name={labels[key]}
                  connectNulls={false}
                />
                <Line
                  key={`${key}-interp`}
                  type="monotone"
                  dataKey={`${key}_interp`}
                  yAxisId={index === 0 ? 'left' : 'right'}
                  stroke={seriesPalette[key]}
                  strokeWidth={1.8}
                  strokeDasharray="5 4"
                  strokeOpacity={0.7}
                  dot={{ r: 3, fill: seriesPalette[key], stroke: '#fff', strokeWidth: 1 }}
                  activeDot={{ r: 5 }}
                  name={`${labels[key]} (estimado)`}
                  connectNulls
                  legendType="none"
                />
              </Fragment>
            ))}
          </LineChart>
        </ResponsiveContainer>
    </div>
  )

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/80 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Timeline
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Séries multi-eixo
          </h3>
        </div>
        <p className="max-w-md text-sm leading-6 text-slate-600">
          Linhas são interrompidas quando existe um gap maior que dois dias.
          Trechos tracejados indicam dias estimados por interpolação.
        </p>
      </div>

      {readiness ? (
        <DataReadinessGate readiness={readiness}>{chartBody}</DataReadinessGate>
      ) : (
        chartBody
      )}
    </div>
  )
}
