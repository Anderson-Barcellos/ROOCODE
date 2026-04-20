import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'

import type { DailySnapshot, MedicationRow } from '@/types/apple-health'
import type { MedicationRegimenEntry, PKLagCorrelationRow, PKTimelineSeries } from '@/types/pharmacology'
import {
  buildPKTimelinePayload,
  type PKOverlayChartDatum,
} from '@/utils/medication-bridge'

interface PKConcentrationChartProps {
  medicationRows: MedicationRow[]
  regimen: MedicationRegimenEntry[]
  snapshots?: DailySnapshot[]
}

const STRENGTH_LABEL: Record<string, string> = {
  strong: 'Forte',
  moderate: 'Moderada',
  weak: 'Fraca',
  negligible: 'Negligível',
}

function dayKeyFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatPct(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '-'
}

function formatRaw(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  if (value >= 1000) return value.toFixed(0)
  if (value >= 100) return value.toFixed(1)
  return value.toFixed(2)
}

function formatMood(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '-'
}

function correlationTone(row: PKLagCorrelationRow): string {
  const abs = Math.abs(row.result?.r ?? 0)
  if (abs > 0.7) return 'bg-emerald-100 text-emerald-900'
  if (abs > 0.4) return 'bg-amber-100 text-amber-900'
  if (abs > 0.2) return 'bg-slate-100 text-slate-700'
  return 'bg-slate-50 text-slate-400'
}

function bestLag(rows: PKLagCorrelationRow[]): PKLagCorrelationRow | null {
  return rows
    .filter((row) => row.result)
    .sort((left, right) => Math.abs(right.result?.r ?? 0) - Math.abs(left.result?.r ?? 0))[0] ?? null
}

function PKTooltip({
  active,
  payload,
  series,
}: TooltipContentProps & { series: PKTimelineSeries[] }) {
  if (!active || !payload?.length) return null
  const datum = payload[0]?.payload as PKOverlayChartDatum | undefined
  if (!datum) return null

  return (
    <div className="rounded-xl border border-slate-900/10 bg-white/95 p-3 text-xs shadow-xl">
      <div className="font-mono font-semibold text-slate-700">{datum.label}</div>
      <div className="mt-2 space-y-1.5">
        {series.map((item) => (
          <div key={item.presetKey} className="flex min-w-[220px] items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-mono font-semibold text-slate-800">
              {formatPct(datum[item.presetKey] as number | null)}
              <span className="ml-2 text-slate-400">
                {formatRaw(datum[`${item.presetKey}Raw`] as number | null)} raw
              </span>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t border-slate-900/10 pt-1.5 text-slate-600">
          <span>Humor</span>
          <span className="font-mono font-semibold text-slate-800">{formatMood(datum.mood as number | null)}</span>
        </div>
      </div>
    </div>
  )
}

function MedicationDetailPanels({
  chartData,
  series,
}: {
  chartData: PKOverlayChartDatum[]
  series: PKTimelineSeries[]
}) {
  return (
    <div className="mt-5 grid min-w-0 gap-3 xl:grid-cols-3">
      {series.map((item) => {
        const peakPct = item.points.reduce((max, point) => Math.max(max, point.normalizedPct ?? 0), 0)
        const loggedDoses = item.doses.filter((dose) => dose.source === 'logged').length
        const plannedDoses = item.doses.length - loggedDoses

        return (
          <div
            key={item.presetKey}
            className="min-w-0 rounded-xl border border-slate-900/10 bg-slate-50 p-3"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{item.name}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Ref. {formatRaw(item.referenceDose)} mg · Cmax {formatRaw(item.referenceCmax)}
                </div>
              </div>
              <div className="rounded-lg bg-white px-2.5 py-1.5 text-right font-mono text-xs text-slate-600">
                Pico {formatPct(peakPct)}
              </div>
            </div>

            <div className="mt-3 h-[180px] min-h-[180px] min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart data={chartData} margin={{ top: 6, right: 2, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(100,116,139,0.10)" vertical={false} />
                  <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} hide />
                  <YAxis yAxisId="left" domain={[0, 'auto']} hide />
                  <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} hide />
                  <Tooltip content={(props) => <PKTooltip {...props} series={[item]} />} />
                  <Line
                    yAxisId="left"
                    dataKey={item.presetKey}
                    name={item.name}
                    type="monotone"
                    stroke={item.color}
                    strokeWidth={2.1}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    dataKey="mood"
                    name="Humor"
                    type="monotone"
                    stroke="#16a34a"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-white px-2 py-1">{plannedDoses} previstas</span>
              <span className="rounded-full bg-white px-2 py-1">{loggedDoses} logs reais</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CorrelationTable({ rows, series }: { rows: PKLagCorrelationRow[]; series: PKTimelineSeries[] }) {
  const rowsByPreset = new Map<string, PKLagCorrelationRow[]>()
  for (const row of rows) {
    rowsByPreset.set(row.presetKey, [...(rowsByPreset.get(row.presetKey) ?? []), row])
  }

  if (!rows.length) {
    return (
      <p className="mt-4 rounded-xl border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-400">
        Sem pares suficientes para correlação com lags.
      </p>
    )
  }

  return (
    <div className="mt-5 min-w-0 overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-xs">
        <thead className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="px-3 py-1">Medicação</th>
            <th className="px-3 py-1">Melhor lag</th>
            {Array.from({ length: 8 }, (_, index) => (
              <th key={index} className="px-2 py-1 text-center">{index}d</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((item) => {
            const medRows = rowsByPreset.get(item.presetKey) ?? []
            const best = bestLag(medRows)
            return (
              <tr key={item.presetKey}>
                <td className="rounded-l-xl bg-slate-50 px-3 py-2 font-semibold text-slate-700">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </td>
                <td className="bg-slate-50 px-3 py-2 font-mono text-slate-600">
                  {best?.result ? `${best.lagDays}d · R ${best.result.r.toFixed(2)}` : 'N insuf.'}
                </td>
                {Array.from({ length: 8 }, (_, lag) => {
                  const row = medRows.find((candidate) => candidate.lagDays === lag)
                  return (
                    <td key={lag} className="bg-slate-50 px-1 py-2 text-center last:rounded-r-xl">
                      {row?.result ? (
                        <span
                          className={`inline-flex min-w-[3.5rem] justify-center rounded-lg px-2 py-1 font-mono font-semibold ${correlationTone(row)}`}
                          title={`p=${row.result.pValue.toFixed(3)} N=${row.result.n} ${STRENGTH_LABEL[row.result.strength]}`}
                        >
                          {row.result.r.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-300">{row?.n ?? 0}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        Lag positivo compara concentração no dia D com humor em D+lag. Correlação é exploratória, não causal.
      </p>
    </div>
  )
}

export function PKConcentrationChart({ medicationRows, regimen, snapshots = [] }: PKConcentrationChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const payload = useMemo(
    () => buildPKTimelinePayload(regimen, medicationRows, snapshots, { resolutionMinutes: 60, maxLagDays: 7 }),
    [regimen, medicationRows, snapshots],
  )

  const currentDate = selectedDate ?? snapshots.at(-1)?.date ?? payload.chartData.at(-1)?.date ?? null
  const selectedSummary = useMemo(() => {
    if (!currentDate) return null
    const noon = new Date(`${currentDate}T12:00:00`).getTime()
    const mood = snapshots.find((snapshot) => snapshot.date === currentDate)?.mood?.valence ?? null

    return {
      date: currentDate,
      mood,
      meds: payload.series.map((item) => {
        const closest = item.points
          .filter((point) => point.date === currentDate)
          .sort((left, right) => Math.abs(left.timestamp - noon) - Math.abs(right.timestamp - noon))[0]
        const dayDoses = item.doses.filter((dose) => dayKeyFromTimestamp(dose.timestamp) === currentDate)
        return {
          ...item,
          noonPct: closest?.normalizedPct ?? null,
          noonRaw: closest?.rawConcentration ?? null,
          regimenDoses: dayDoses.filter((dose) => dose.source === 'regimen').length,
          loggedDoses: dayDoses.filter((dose) => dose.source === 'logged').length,
        }
      }),
    }
  }, [currentDate, payload.series, snapshots])

  const handleChartClick = (state: unknown) => {
    const chartState = state as { activePayload?: Array<{ payload?: PKOverlayChartDatum }> }
    const date = chartState.activePayload?.[0]?.payload?.date
    if (date) setSelectedDate(date)
  }

  if (!payload.series.length || !payload.chartData.length) {
    return (
      <div className="min-w-0 rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Farmacocinética
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Concentração ao longo do tempo
        </h3>
        <p className="mt-4 text-sm text-slate-400">
          Configure o regime ou registre doses para gerar as curvas.
        </p>
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Farmacocinética
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Concentração ao longo do tempo
          </h3>
        </div>
        <div className="rounded-xl border border-slate-900/10 bg-slate-50 px-3 py-2 text-right">
          <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-400">Janela</div>
          <div className="font-mono text-sm font-semibold text-slate-700">
            {payload.chartData[0]?.date} · {payload.chartData.at(-1)?.date}
          </div>
        </div>
      </div>

      <div className="mt-5 h-[360px] min-h-[360px] min-w-0 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={payload.chartData} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} onClick={(state) => handleChartClick(state)}>
            <CartesianGrid stroke="rgba(100,116,139,0.12)" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => {
                const datum = payload.chartData.find((item) => item.timestamp === value)
                return datum?.label.slice(0, 5) ?? ''
              }}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              domain={[0, 'auto']}
              width={44}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[-1, 1]}
              width={38}
              tick={{ fill: '#16a34a', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={(props) => <PKTooltip {...props} series={payload.series} />} />
            <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            {payload.series.map((item) => (
              <Line
                key={item.presetKey}
                yAxisId="left"
                dataKey={item.presetKey}
                name={item.name}
                type="monotone"
                stroke={item.color}
                strokeWidth={2.2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            <Line
              yAxisId="right"
              dataKey="mood"
              name="Humor"
              type="monotone"
              stroke="#16a34a"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {selectedSummary && (
        <div className="mt-4 rounded-xl border border-slate-900/10 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-400">Dia selecionado</span>
              <div className="font-mono text-sm font-semibold text-slate-700">{selectedSummary.date}</div>
            </div>
            <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-600">
              Humor <span className="font-mono font-bold text-slate-900">{formatMood(selectedSummary.mood)}</span>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {selectedSummary.meds.map((item) => (
              <div key={item.presetKey} className="rounded-lg bg-white px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-500">
                  12h {formatPct(item.noonPct)} · {formatRaw(item.noonRaw)} raw
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {item.regimenDoses} previstas · {item.loggedDoses} logs
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <MedicationDetailPanels chartData={payload.chartData} series={payload.series} />

      <CorrelationTable rows={payload.correlations} series={payload.series} />
    </div>
  )
}
