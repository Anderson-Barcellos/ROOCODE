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
import { dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'
import {
  RESPIRATORY_RATE_BANDS,
  getRespiratoryRateCategory,
  getPulseTempCategory,
} from '@/utils/health-policies'

interface VitalSignsTimelineProps {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

// FR: azul médio | Temperatura: âmbar
const COLOR_RR = '#3b82f6'
const COLOR_TEMP = '#d97706'

export function VitalSignsTimeline({ snapshots, forecastStartDate }: VitalSignsTimelineProps) {
  const { data, latestRr, latestTemp, rrCategory, tempCategory } = useMemo(() => {
    const filtered = snapshots.filter(
      (s) => s.health?.respiratoryRate != null || s.health?.pulseTemperatureC != null,
    )

    const data = filtered.map((s) => {
      const rr = s.health?.respiratoryRate ?? null
      const temp = s.health?.pulseTemperatureC ?? null
      const isForecast = s.forecasted === true
      const isInterp = !isForecast && s.interpolated === true
      return {
        label: dayLabel(s.date),
        rr,
        temp,
        rr_real: isForecast || isInterp ? null : rr,
        rr_interp: isInterp ? rr : null,
        rr_forecast: isForecast ? rr : null,
        temp_real: isForecast || isInterp ? null : temp,
        temp_interp: isInterp ? temp : null,
        temp_forecast: isForecast ? temp : null,
        interpolated: isInterp,
        forecasted: isForecast,
        forecastConfidence: s.forecastConfidence ?? null,
      }
    })

    const latestRr = filtered.at(-1)?.health?.respiratoryRate ?? null
    const latestTemp = filtered.at(-1)?.health?.pulseTemperatureC ?? null
    return {
      data,
      latestRr,
      latestTemp,
      rrCategory: getRespiratoryRateCategory(latestRr),
      tempCategory: getPulseTempCategory(latestTemp),
    }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.vitalSignsTimelineChart, 'Sinais vitais'),
    [snapshots],
  )

  if (!data.length) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Fisiologia
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Sinais Vitais
        </h3>
        <p className="mt-4 text-sm text-slate-400">Sem dados de FR ou temperatura no período.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Fisiologia
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Sinais Vitais
        </h3>
        {latestRr != null && rrCategory && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{ borderColor: COLOR_RR, backgroundColor: `${COLOR_RR}22`, color: '#1d4ed8' }}
          >
            FR {latestRr.toFixed(0)} rpm · {rrCategory.label}
          </span>
        )}
        {latestTemp != null && tempCategory && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{ borderColor: COLOR_TEMP, backgroundColor: `${COLOR_TEMP}22`, color: '#92400e' }}
          >
            {latestTemp.toFixed(1)}°C · {tempCategory.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        <span style={{ color: COLOR_RR }}>━</span> FR (rpm, eixo esq.) ·{' '}
        <span style={{ color: COLOR_TEMP }}>━</span> Temperatura (°C, eixo dir.) · bandas de referência por sinal
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          FR elevada crônica (≥20 rpm) pode indicar ansiedade, dor ou doença orgânica subclínica. Temperatura de pulso
          subtilmente elevada em escala de dias pode preceder estados inflamatórios. Ambos os sinais respondem a
          lisdexanfetamina (↑FR e ↑temp por ativação simpática) e clonazepam (↓FR leve por sedação).
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 44, bottom: 4, left: 0 }}>
              {/* Bandas FR no eixo esquerdo */}
              {RESPIRATORY_RATE_BANDS.map((band) => (
                <ReferenceArea
                  key={`rr-${band.label}`}
                  yAxisId="left"
                  y1={band.min}
                  y2={band.max}
                  fill={band.color}
                  fillOpacity={0.10}
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
                yAxisId="left"
                tick={{ fill: COLOR_RR, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                domain={[8, 28]}
                tickFormatter={(v: number) => `${v}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: COLOR_TEMP, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={[35.5, 38.5]}
                tickFormatter={(v: number) => `${v.toFixed(1)}`}
              />
              {/* Linhas de referência clínica para temperatura */}
              <ReferenceLine yAxisId="right" y={37.0} stroke={COLOR_TEMP} strokeDasharray="3 3" strokeOpacity={0.4} strokeWidth={1} />
              <ReferenceLine yAxisId="right" y={38.0} stroke="#dc2626" strokeDasharray="3 3" strokeOpacity={0.5} strokeWidth={1} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name, item) => {
                  if (['rr_real', 'rr_interp', 'rr_forecast', 'temp_real', 'temp_interp', 'temp_forecast'].includes(name as string))
                    return [null, null]
                  const suffix = getDataSuffix(item)
                  if (name === 'rr')
                    return [typeof v === 'number' ? `${v.toFixed(0)} rpm${suffix} · ${getRespiratoryRateCategory(v)?.label ?? ''}` : '—', 'FR']
                  if (name === 'temp')
                    return [typeof v === 'number' ? `${v.toFixed(1)}°C${suffix} · ${getPulseTempCategory(v)?.label ?? ''}` : '—', 'Temperatura']
                  return [typeof v === 'number' ? `${v.toFixed(1)}` : '—', name]
                }}
                itemSorter={() => 0}
              />
              {/* FR — azul */}
              <Line yAxisId="left" type="monotone" dataKey="rr_real" stroke={COLOR_RR} strokeWidth={1.8} dot={{ r: 3, fill: COLOR_RR, stroke: '#fff', strokeWidth: 1 }} connectNulls={false} name="rr" legendType="none" />
              <Line yAxisId="left" type="monotone" dataKey="rr_interp" stroke={COLOR_RR} strokeWidth={1.6} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} connectNulls name="rr (estim.)" legendType="none" />
              <Line yAxisId="left" type="monotone" dataKey="rr_forecast" stroke={COLOR_RR} strokeWidth={1.4} strokeDasharray="2 3" strokeOpacity={0.55} dot={false} connectNulls name="rr (projeção)" legendType="none" />
              {/* Temperatura — âmbar */}
              <Line yAxisId="right" type="monotone" dataKey="temp_real" stroke={COLOR_TEMP} strokeWidth={1.8} dot={{ r: 3, fill: COLOR_TEMP, stroke: '#fff', strokeWidth: 1 }} connectNulls={false} name="temp" legendType="none" />
              <Line yAxisId="right" type="monotone" dataKey="temp_interp" stroke={COLOR_TEMP} strokeWidth={1.6} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} connectNulls name="temp (estim.)" legendType="none" />
              <Line yAxisId="right" type="monotone" dataKey="temp_forecast" stroke={COLOR_TEMP} strokeWidth={1.4} strokeDasharray="2 3" strokeOpacity={0.55} dot={false} connectNulls name="temp (projeção)" legendType="none" />
              {forecastStartDate && (
                <ReferenceLine
                  yAxisId="left"
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
