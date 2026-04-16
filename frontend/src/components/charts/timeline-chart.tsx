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

interface TimelineChartProps {
  data: TimelinePoint[]
  seriesKeys: TimelineSeriesKey[]
  labels: Record<TimelineSeriesKey, string>
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

function flattenData(data: TimelinePoint[], seriesKeys: TimelineSeriesKey[]) {
  const rows = data.map((point) => ({
    date: point.date,
    label: dayLabel(point.date),
    ...point.values,
  }))

  if (rows.length < 2) {
    return rows
  }

  const flattened: Array<Record<string, number | string | null>> = []

  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index]
    flattened.push(current)

    const next = rows[index + 1]
    if (!next) {
      continue
    }

    if (calculateDayGapDays(current.date as string, next.date as string) > 2) {
      const gapRow: Record<string, number | string | null> = {
        date: `${current.date}-gap`,
        label: '',
      }

      for (const key of seriesKeys) {
        gapRow[key] = null
      }

      flattened.push(gapRow)
    }
  }

  return flattened
}

export function TimelineChart({ data, seriesKeys, labels }: TimelineChartProps) {
  const chartData = flattenData(data, seriesKeys)

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
          Linhas são interrompidas quando existe um gap maior que dois dias, para
          não insinuar continuidade onde os dados somem.
        </p>
      </div>

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
            <Tooltip
              contentStyle={{
                borderRadius: 18,
                border: '1px solid rgba(15, 23, 42, 0.08)',
                boxShadow: '0 18px 42px rgba(17,35,30,0.14)',
              }}
            />
            <Legend />

            {seriesKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                yAxisId={index === 0 ? 'left' : 'right'}
                stroke={seriesPalette[key]}
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 5 }}
                name={labels[key]}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
