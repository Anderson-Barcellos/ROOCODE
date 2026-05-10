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
import { dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'
import {
  RESPIRATORY_RATE_BANDS,
  WRIST_TEMP_DEVIATION_BANDS,
  getRespiratoryRateCategory,
  getWristTempDeviationCategory,
} from '@/utils/health-policies'
import {
  computeRollingBaseline,
  rollingStandardDeviation,
} from '@/utils/personal-baselines'

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
  const { data, latestRr, latestTempDelta, rrCategory, tempDeltaCategory, tempBaseline } =
    useMemo(() => {
      // Baseline pessoal de wrist temp usa apenas valores REAIS (regra interim M6
      // — não inflar baseline com interpolação linear). Janela 30d, mín 14 pontos.
      const realTempValues = snapshots.map((s) =>
        s.forecasted || s.interpolated ? null : s.health?.pulseTemperatureC ?? null,
      )
      const baseline = computeRollingBaseline(realTempValues, { minPoints: 14, windowSize: 30 })

      // FR variability: rolling SD 7d, também ignorando interp/forecast.
      const rrValuesForSd = snapshots.map((s) =>
        s.forecasted || s.interpolated ? null : s.health?.respiratoryRate ?? null,
      )
      const rrSdSeries = rollingStandardDeviation(rrValuesForSd, 7, 4)

      const fullData = snapshots.map((s, idx) => {
        const rr = s.health?.respiratoryRate ?? null
        const temp = s.health?.pulseTemperatureC ?? null
        const isForecast = s.forecasted === true
        const isInterp = !isForecast && s.interpolated === true
        const tempDelta = temp != null && baseline ? temp - baseline.mean : null
        const rrSd = !isForecast && !isInterp ? rrSdSeries[idx] : null

        return {
          label: dayLabel(s.date),
          rr,
          tempDelta,
          rr_real: isForecast || isInterp ? null : rr,
          rr_interp: isInterp ? rr : null,
          rr_forecast: isForecast ? rr : null,
          tempDelta_real: isForecast || isInterp ? null : tempDelta,
          tempDelta_interp: isInterp ? tempDelta : null,
          tempDelta_forecast: isForecast ? tempDelta : null,
          rrSd,
          interpolated: isInterp,
          forecasted: isForecast,
          forecastConfidence: s.forecastConfidence ?? null,
        }
      })

      const data = fullData.filter((d) => d.rr != null || d.tempDelta != null)
      const latestRr = data.findLast((d) => d.rr != null)?.rr ?? null
      const latestTempDelta = data.findLast((d) => d.tempDelta != null)?.tempDelta ?? null

      return {
        data,
        latestRr,
        latestTempDelta,
        rrCategory: getRespiratoryRateCategory(latestRr),
        tempDeltaCategory: getWristTempDeviationCategory(latestTempDelta),
        tempBaseline: baseline,
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
        <p className="mt-4 text-sm text-slate-400">Sem dados de FR ou temperatura do pulso no período.</p>
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
        {latestTempDelta != null && tempDeltaCategory && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{ borderColor: COLOR_TEMP, backgroundColor: `${COLOR_TEMP}22`, color: '#92400e' }}
          >
            Desvio: {latestTempDelta >= 0 ? '+' : ''}
            {latestTempDelta.toFixed(2)}°C · {tempDeltaCategory.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        FR (rpm) com variabilidade rolling SD 7d · Wrist temperature como desvio da baseline pessoal (média 30d, n≥14). Painéis sincronizados.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          O Apple Watch mede <strong>temperatura do pulso</strong> durante o sono e o algoritmo nativo já normaliza
          como <strong>desvio da baseline pessoal</strong>, não como temperatura absoluta. Por isso o painel mostra
          delta (temperatura_hoje − média_30d) em vez de °C absoluto — chamar 35.9°C de "hipotermia" seria
          clinicamente incorreto. Desvios sustentados &gt;<strong>+0.5°C</strong> por 2-3 noites podem preceder
          estado inflamatório ou doença infecciosa subclínica.
          <br />
          <br />
          FR elevada crônica (≥20 rpm) pode indicar ansiedade, dor ou doença orgânica subclínica. <strong>FR
          variability</strong> (SD rolling 7d) acima de ~2.5 rpm pode marcar estresse autonômico ou início de
          quadro respiratório. Ambos respondem a lisdexanfetamina (↑ por ativação simpática) e clonazepam
          (↓ leve por sedação).
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Frequência respiratória <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">+ variabilidade (SD 7d, eixo direito)</span></p>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart syncId="vital-signs" data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  {RESPIRATORY_RATE_BANDS.map((band) => (
                    <ReferenceArea
                      key={`rr-${band.label}`}
                      yAxisId="rrLeft"
                      y1={band.min}
                      y2={band.max}
                      fill={band.color}
                      fillOpacity={0.10}
                      stroke="none"
                      ifOverflow="hidden"
                    />
                  ))}
                  <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
                  <XAxis dataKey="label" hide />
                  <YAxis
                    yAxisId="rrLeft"
                    tick={{ fill: COLOR_RR, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    domain={[8, 28]}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <YAxis
                    yAxisId="rrSd"
                    orientation="right"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    domain={[0, 5]}
                    tickFormatter={(v: number) => `${v.toFixed(1)}`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name, item) => {
                      if (['rr_real', 'rr_interp', 'rr_forecast'].includes(name as string)) return [null, null]
                      const suffix = getDataSuffix(item)
                      if (name === 'rr') {
                        const category = typeof v === 'number' ? getRespiratoryRateCategory(v)?.label ?? '' : ''
                        return [typeof v === 'number' ? `${v.toFixed(0)} rpm${suffix} · ${category}` : '—', 'FR']
                      }
                      if (name === 'rrSd') {
                        return [typeof v === 'number' ? `${v.toFixed(1)} rpm` : '—', 'FR var (SD 7d)']
                      }
                      return [typeof v === 'number' ? `${v.toFixed(1)}` : '—', String(name)]
                    }}
                    itemSorter={() => 0}
                  />
                  <Line yAxisId="rrLeft" type="monotone" dataKey="rr_real" stroke={COLOR_RR} strokeWidth={1.8} dot={{ r: 3, fill: COLOR_RR, stroke: '#fff', strokeWidth: 1 }} connectNulls={false} name="rr" legendType="none" />
                  <Line yAxisId="rrLeft" type="monotone" dataKey="rr_interp" stroke={COLOR_RR} strokeWidth={1.6} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} connectNulls name="rr (estim.)" legendType="none" />
                  <Line yAxisId="rrLeft" type="monotone" dataKey="rr_forecast" stroke={COLOR_RR} strokeWidth={1.4} strokeDasharray="2 3" strokeOpacity={0.55} dot={false} connectNulls name="rr (projeção)" legendType="none" />
                  <Line yAxisId="rrSd" type="monotone" dataKey="rrSd" stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="2 4" strokeOpacity={0.7} dot={false} connectNulls name="rrSd" legendType="none" />
                  {forecastStartDate && (
                    <ReferenceLine
                      yAxisId="rrLeft"
                      x={dayLabel(forecastStartDate)}
                      stroke="#7c3aed"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Wrist Temp Deviation <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">(delta da baseline pessoal{tempBaseline ? ` · n=${tempBaseline.n}` : ''})</span></p>
            {tempBaseline ? (
            <div className="h-[190px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart syncId="vital-signs" data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  {WRIST_TEMP_DEVIATION_BANDS.map((band) => (
                    <ReferenceArea
                      key={`temp-${band.label}`}
                      y1={band.min}
                      y2={band.max}
                      fill={band.color}
                      fillOpacity={0.18}
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
                    tick={{ fill: COLOR_TEMP, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    domain={[-1.0, 1.5]}
                    tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                  <ReferenceLine y={0.5} stroke="#dc2626" strokeDasharray="3 3" strokeOpacity={0.5} strokeWidth={1} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name, item) => {
                      if (['tempDelta_real', 'tempDelta_interp', 'tempDelta_forecast'].includes(name as string)) return [null, null]
                      const suffix = getDataSuffix(item)
                      if (name === 'tempDelta') {
                        if (typeof v !== 'number') return ['—', 'Desvio Temp Pulso']
                        const category = getWristTempDeviationCategory(v)?.label ?? ''
                        const sign = v >= 0 ? '+' : ''
                        return [`${sign}${v.toFixed(2)}°C${suffix} · ${category}`, 'Desvio Temp Pulso']
                      }
                      return [typeof v === 'number' ? `${v.toFixed(1)}` : '—', String(name)]
                    }}
                    itemSorter={() => 0}
                  />
                  <Line type="monotone" dataKey="tempDelta_real" stroke={COLOR_TEMP} strokeWidth={1.8} dot={{ r: 3, fill: COLOR_TEMP, stroke: '#fff', strokeWidth: 1 }} connectNulls={false} name="tempDelta" legendType="none" />
                  <Line type="monotone" dataKey="tempDelta_interp" stroke={COLOR_TEMP} strokeWidth={1.6} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} connectNulls name="tempDelta (estim.)" legendType="none" />
                  <Line type="monotone" dataKey="tempDelta_forecast" stroke={COLOR_TEMP} strokeWidth={1.4} strokeDasharray="2 3" strokeOpacity={0.55} dot={false} connectNulls name="tempDelta (projeção)" legendType="none" />
                  {forecastStartDate && (
                    <ReferenceLine
                      x={dayLabel(forecastStartDate)}
                      stroke="#7c3aed"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            ) : (
              <div className="flex h-[190px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/40 px-6 text-center">
                <p className="text-xs text-slate-500">
                  Coletando baseline pessoal de wrist temp (mín. 14 medições reais nos últimos 30 dias).
                </p>
              </div>
            )}
          </div>
        </div>
      </DataReadinessGate>
    </div>
  )
}
