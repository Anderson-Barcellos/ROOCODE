import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
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
import { dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'
import {
  RESPIRATORY_DISTURBANCES_BANDS,
  getRespiratoryDisturbancesCategory,
} from '@/utils/health-policies'
import { sma } from '@/utils/statistics'

interface RespiratoryDisturbancesChartProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

export function RespiratoryDisturbancesChart({
  snapshots,
  forecastStartDate,
}: RespiratoryDisturbancesChartProps) {
  const { data, latest, latestCategory } = useMemo(() => {
    const filtered = snapshots.filter((s) => s.health?.respiratoryDisturbances != null)
    const values = filtered.map((s) => s.health?.respiratoryDisturbances ?? null)
    const smaValues = sma(values, 7)

    const data = filtered.map((s, i) => {
      const v = s.health?.respiratoryDisturbances ?? null
      const isForecast = s.forecasted === true
      const cat = getRespiratoryDisturbancesCategory(v)
      return {
        label: dayLabel(s.date),
        rd: v,
        sma7: smaValues[i],
        forecasted: isForecast,
        forecastConfidence: s.forecastConfidence ?? null,
        bandColor: cat?.color ?? '#bbf7d0',
      }
    })

    const latest = filtered.at(-1)?.health?.respiratoryDisturbances ?? null
    const latestCategory = getRespiratoryDisturbancesCategory(latest)
    return { data, latest, latestCategory }
  }, [snapshots])

  const readiness = useMemo(
    () =>
      evaluateReadiness(
        snapshots,
        CHART_REQUIREMENTS.respiratoryDisturbancesChart,
        'Distúrbios respiratórios',
      ),
    [snapshots],
  )

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Sono
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Distúrbios Respiratórios
        </h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de distúrbios respiratórios no período.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Sono
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Distúrbios Respiratórios
        </h3>
        {latest != null && latestCategory && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{
              borderColor: latestCategory.color,
              backgroundColor: `${latestCategory.color}40`,
              color: '#065f46',
            }}
          >
            {latest.toFixed(1)} ev/h · {latestCategory.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Eventos/hora durante o sono · IAH &lt;5 normal, 5-15 leve, 15-30 moderado, &gt;30 severo · SMA 7d em linha sólida
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          IAH (Índice Apneia-Hipopneia) quantifica eventos obstrutivos por hora de sono. AOS não-tratada amplifica
          depressão, prejudica memória e bloqueia resposta a antidepressivos. Clonazepam e GABAérgicos podem elevar
          o IAH ao relaxar musculatura faríngea. Threshold de tratamento: IAH ≥15 ou ≥5 com sintomas.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              {RESPIRATORY_DISTURBANCES_BANDS.map((band) => (
                <ReferenceArea
                  key={band.label}
                  y1={band.min}
                  y2={band.max}
                  fill={band.color}
                  fillOpacity={0.12}
                  stroke="none"
                  ifOverflow="hidden"
                />
              ))}
              <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={20}
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name, item) => {
                  const suffix = getDataSuffix(item)
                  if (name === 'rd') {
                    const cat =
                      typeof v === 'number'
                        ? getRespiratoryDisturbancesCategory(v)?.label ?? ''
                        : ''
                    const text =
                      typeof v === 'number' ? `${v.toFixed(1)} ev/h${suffix} · ${cat}` : '—'
                    return [text, 'Distúrbios respiratórios']
                  }
                  if (name === 'sma7')
                    return [typeof v === 'number' ? `${v.toFixed(1)} ev/h` : '—', 'SMA 7d']
                  return [typeof v === 'number' ? `${v.toFixed(1)}` : '—', name]
                }}
                itemSorter={() => 0}
              />
              <Bar dataKey="rd" name="rd" legendType="none" radius={[3, 3, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={entry.bandColor}
                    fillOpacity={entry.forecasted ? 0.35 : 0.85}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="sma7"
                stroke="#1e293b"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                name="sma7"
              />
              {forecastStartDate && (
                <ReferenceLine
                  x={dayLabel(forecastStartDate)}
                  stroke="#7c3aed"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>
    </div>
  )
}
