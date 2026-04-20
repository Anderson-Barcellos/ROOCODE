import { useMemo, useCallback, useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Eye, EyeOff, Activity, TrendingUp, Smile } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import type { PKDose, PKMedication } from '@/utils/pharmacokinetics'
import {
  calculateConcentration,
  calculateEffectConcentration,
  isChronicMedication,
  computeTrendFromSamples,
  calculateSteadyStateMetrics,
  getEffectMetrics,
  calculateAdherenceEffectLag,
} from '@/utils/pharmacokinetics'

// ─── Props ────────────────────────────────────────────────────────────────────

interface PKIndividualChartProps {
  medication: PKMedication
  doses: PKDose[]
  snapshots: DailySnapshot[]
  color?: string
  daysRange?: number
  futureHours?: number
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ChartDataPoint {
  timestamp: number
  concentration: number | null
  effectConcentration: number | null
  trendConcentration: number | null
  mood: number | null
  formattedTime: string
  isFuture: boolean
  moodDate: string | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MOOD_COLOR = '#22c55e'
const EFFECT_COLOR = '#f97316'
const TREND_COLOR = '#f97316'
const CSS_COLOR = '#06b6d4'
const POINTS_PER_DAY = 48

const ZONE_COLORS = {
  therapeutic: '#22c55e',
  subtherapeutic: '#f59e0b',
  supratherapeutic: '#ef4444',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computePaddedDomain(
  values: Array<number | null | undefined>,
  clampMin = 0,
  paddingRatio = 0.12,
  fallback: [number, number] = [0, 100],
): [number, number] {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!finite.length) return fallback

  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min
  const scale = range > 0 ? range : Math.abs(max) || 1
  const pad = Math.max(scale * paddingRatio, 0.1)

  const low = Math.max(clampMin, min - pad)
  const high = max + pad

  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) return fallback
  return [low, high]
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PKIndividualChart({
  medication,
  doses,
  snapshots,
  color = '#8b5cf6',
  daysRange = 14,
  futureHours = 12,
}: PKIndividualChartProps) {
  const isChronic = useMemo(() => isChronicMedication(medication), [medication])
  const [showTherapeutic, setShowTherapeutic] = useState(true)
  const [showEffectCurve, setShowEffectCurve] = useState(!isChronic)
  const [showTrendCurve, setShowTrendCurve] = useState(isChronic)
  const [showCss, setShowCss] = useState(isChronic)
  const [showOptimalZone, setShowOptimalZone] = useState(false)
  const [currentTimestamp] = useState(() => Date.now())

  const effectMetrics = useMemo(() => getEffectMetrics(medication), [medication])
  const adherenceMetrics = useMemo(() => calculateAdherenceEffectLag(medication), [medication])
  const ssMetrics = useMemo(() => calculateSteadyStateMetrics(medication, doses), [medication, doses])

  // ─── Build chart data ───────────────────────────────────────────────────────

  const { chartData, therapeuticRange, optimalConcRange, nowTimestamp, doseMarkers } = useMemo(() => {
    const doseTimestamps = doses.map((d) => d.timestamp)
    const lastDose = doseTimestamps.length > 0 ? Math.max(...doseTimestamps) : 0
    const futureExtension = futureHours * 3600 * 1000
    const nowTs = currentTimestamp
    const endTime = Math.max(lastDose + futureExtension, nowTs)
    const startTime = endTime - daysRange * 24 * 3600 * 1000

    const totalPoints = daysRange * POINTS_PER_DAY
    const interval = (endTime - startTime) / totalPoints

    const relevantDoses = doses.filter(
      (d) => d.timestamp >= startTime - medication.halfLife * 5 * 3600 * 1000 && d.timestamp <= endTime,
    )

    const visibleDoses = doses
      .filter((d) => d.timestamp >= startTime && d.timestamp <= endTime)
      .map((d) => ({ timestamp: d.timestamp, amount: d.doseAmount }))

    // Build mood map from daily snapshots — use noon timestamps
    const moodMap = new Map<number, { valence: number; date: string }>()
    for (const snap of snapshots) {
      if (snap.mood?.valence == null) continue
      const noon = new Date(`${snap.date}T12:00:00`).getTime()
      if (!Number.isFinite(noon)) continue
      if (noon < startTime || noon > endTime) continue
      moodMap.set(noon, { valence: snap.mood.valence, date: snap.date })
    }

    const rawConcentrations: Array<number | null> = []
    const timestamps: number[] = []
    const data: ChartDataPoint[] = []

    for (let i = 0; i <= totalPoints; i++) {
      const ts = startTime + i * interval
      timestamps.push(ts)

      const conc = calculateConcentration(medication, relevantDoses, ts)
      const concVal = conc > 0.01 ? conc : null
      rawConcentrations.push(concVal)

      const effConc = calculateEffectConcentration(medication, relevantDoses, ts)
      const effVal = effConc > 0.01 ? effConc : null

      // Snap mood to nearest bucket
      let mood: number | null = null
      let moodDate: string | null = null
      for (const [noonTs, entry] of moodMap) {
        if (Math.abs(ts - noonTs) < interval * 0.6) {
          mood = entry.valence
          moodDate = entry.date
          break
        }
      }

      data.push({
        timestamp: ts,
        concentration: concVal,
        effectConcentration: effVal,
        trendConcentration: null,
        mood,
        formattedTime: format(ts, 'dd/MM HH:mm', { locale: ptBR }),
        isFuture: ts > nowTs,
        moodDate,
      })
    }

    // Compute trend (moving average)
    const trendWindowHours = isChronic ? 48 : Math.max(6, 3.5 * medication.halfLife)
    const windowMs = Math.round(trendWindowHours * 3600 * 1000)
    const trendSeries = computeTrendFromSamples(timestamps, rawConcentrations, windowMs, 3)
    for (let i = 0; i < data.length; i++) {
      data[i].trendConcentration = trendSeries[i]
    }

    // Therapeutic range
    let therRange: { min: number; max: number } | null = null
    if (medication.therapeuticRange) {
      const unit = medication.therapeuticRange.unit?.toLowerCase() ?? 'ng/ml'
      const toNg = (v: number) => {
        if (unit.includes('mcg') || unit.includes('µg')) return v * 1000
        if (unit.includes('mg/l')) return v * 1000
        return v
      }
      therRange = {
        min: toNg(medication.therapeuticRange.min),
        max: toNg(medication.therapeuticRange.max),
      }
    }

    // Optimal zone (valence >= 0.6 = roughly "good mood")
    const goodConcValues = data
      .filter((d) => d.mood !== null && d.mood >= 0.6 && d.concentration !== null && (d.concentration ?? 0) > 0)
      .map((d) => d.concentration as number)

    let optRange: { min: number; max: number } | null = null
    if (goodConcValues.length >= 3) {
      const sorted = [...goodConcValues].sort((a, b) => a - b)
      optRange = {
        min: sorted[Math.floor(sorted.length * 0.1)],
        max: sorted[Math.floor(sorted.length * 0.9)],
      }
    }

    return {
      chartData: data,
      therapeuticRange: therRange,
      optimalConcRange: optRange,
      nowTimestamp: nowTs,
      doseMarkers: visibleDoses,
    }
  }, [medication, doses, snapshots, daysRange, futureHours, isChronic, currentTimestamp])

  // ─── Domain ─────────────────────────────────────────────────────────────────

  const concentrationDomain = useMemo<[number, number]>(() => {
    const vals: Array<number | null | undefined> = []
    for (const p of chartData) {
      vals.push(p.concentration)
      if (showEffectCurve) vals.push(p.effectConcentration)
      if (showTrendCurve) vals.push(p.trendConcentration)
    }
    if (showTherapeutic && therapeuticRange) {
      vals.push(therapeuticRange.min, therapeuticRange.max)
    }
    return computePaddedDomain(vals)
  }, [chartData, showEffectCurve, showTrendCurve, showTherapeutic, therapeuticRange])

  const formatConcTick = useCallback(
    (v: number) => {
      const max = concentrationDomain[1]
      const dec = max < 10 ? 2 : max < 100 ? 1 : 0
      return Number.isFinite(v) ? v.toFixed(dec) : ''
    },
    [concentrationDomain],
  )

  const formatXAxis = useCallback(
    (ts: number) => {
      if (!ts || !Number.isFinite(ts)) return ''
      const hours = daysRange * 24
      if (hours <= 48) return format(ts, 'HH:mm')
      if (hours <= 168) return format(ts, "dd/MM HH'h'")
      return format(ts, 'dd/MM')
    },
    [daysRange],
  )

  // ─── Tooltip ────────────────────────────────────────────────────────────────

  const CustomTooltip = useCallback(
    ({ active, payload }: TooltipContentProps) => {
      if (!active || !payload?.length) return null
      const point = payload[0]?.payload as ChartDataPoint
      if (!point) return null

      const displayTime = point.moodDate
        ? format(new Date(`${point.moodDate}T12:00:00`), "dd MMM", { locale: ptBR })
        : format(point.timestamp, "dd MMM 'às' HH:mm", { locale: ptBR })

      const getStatus = () => {
        if (!therapeuticRange || point.concentration == null) return null
        if (point.concentration < therapeuticRange.min) return { text: 'Subterapêutico', color: '#f59e0b' }
        if (point.concentration > therapeuticRange.max) return { text: 'Acima da faixa', color: '#ef4444' }
        return { text: 'Na faixa terapêutica', color: '#22c55e' }
      }

      const status = getStatus()

      return (
        <div className="rounded-2xl border border-slate-900/10 bg-white/95 p-3 shadow-[0_8px_24px_rgba(17,35,30,0.12)] text-xs">
          <div className="font-semibold text-slate-700 mb-2">{displayTime}</div>
          {point.concentration != null && (
            <div className="mb-1">
              <span style={{ color }}>Plasma: <strong>{point.concentration.toFixed(1)} ng/mL</strong></span>
              {status && <div style={{ color: status.color }} className="text-[0.65rem] mt-0.5">{status.text}</div>}
            </div>
          )}
          {point.effectConcentration != null && showEffectCurve && (
            <div className="mb-1" style={{ color: EFFECT_COLOR }}>
              Efeito: <strong>{point.effectConcentration.toFixed(1)} ng/mL</strong>
            </div>
          )}
          {point.trendConcentration != null && showTrendCurve && (
            <div className="mb-1" style={{ color: TREND_COLOR }}>
              Tendência: <strong>{point.trendConcentration.toFixed(1)} ng/mL</strong>
              <span className="opacity-60 ml-1">(48h)</span>
            </div>
          )}
          {point.mood != null && (
            <div style={{ color: MOOD_COLOR }}>
              Humor: <strong>{point.mood > 0 ? '+' : ''}{point.mood.toFixed(2)}</strong>
            </div>
          )}
        </div>
      )
    },
    [color, showEffectCurve, showTrendCurve, therapeuticRange],
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  const hasDoses = doses.length > 0
  const hasConcentration = chartData.some((d) => d.concentration != null && (d.concentration ?? 0) > 0)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="font-['Fraunces'] text-lg tracking-[-0.03em] text-slate-900">
            {medication.name}
          </span>
          {medication.brandName && (
            <span className="text-xs text-slate-400">{medication.brandName}</span>
          )}
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-1">
          {isChronic && ssMetrics && (
            <button
              onClick={() => setShowCss(!showCss)}
              title={showCss ? 'Ocultar Css' : 'Mostrar Css'}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] font-medium transition-colors ${
                showCss
                  ? 'bg-cyan-100 text-cyan-700'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              <span className="hidden sm:inline">Css</span>
            </button>
          )}

          {!isChronic && (
            <button
              onClick={() => setShowEffectCurve(!showEffectCurve)}
              title={showEffectCurve ? 'Ocultar curva efeito' : 'Mostrar curva efeito'}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] font-medium transition-colors ${
                showEffectCurve
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Activity className="h-3 w-3" />
              <span className="hidden sm:inline">Efeito</span>
            </button>
          )}

          {isChronic && (
            <button
              onClick={() => setShowTrendCurve(!showTrendCurve)}
              title={showTrendCurve ? 'Ocultar tendência' : 'Mostrar tendência'}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] font-medium transition-colors ${
                showTrendCurve
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Activity className="h-3 w-3" />
              <span className="hidden sm:inline">Tendência</span>
            </button>
          )}

          {therapeuticRange && (
            <button
              onClick={() => setShowTherapeutic(!showTherapeutic)}
              title={showTherapeutic ? 'Ocultar faixa terapêutica' : 'Mostrar faixa terapêutica'}
              className={`rounded-lg p-1.5 transition-colors ${
                showTherapeutic
                  ? 'text-emerald-600 bg-emerald-50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              {showTherapeutic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          )}

          {optimalConcRange && (
            <button
              onClick={() => setShowOptimalZone(!showOptimalZone)}
              title={showOptimalZone ? 'Ocultar zona ótima' : 'Mostrar zona ótima'}
              className={`rounded-lg p-1.5 transition-colors ${
                showOptimalZone
                  ? 'text-green-600 bg-green-50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 4, bottom: 16 }}>
            <defs>
              <linearGradient id={`grad-${medication.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id={`grad-eff-${medication.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={EFFECT_COLOR} stopOpacity={0.12} />
                <stop offset="95%" stopColor={EFFECT_COLOR} stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" vertical={false} />

            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              tick={{ fill: '#475569', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              yAxisId="conc"
              domain={concentrationDomain}
              allowDataOverflow
              tick={{ fill: '#475569', fontSize: 10 }}
              tickFormatter={formatConcTick}
              tickLine={false}
              axisLine={false}
              label={{ value: 'ng/mL', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#94a3b8' }}
            />

            <YAxis
              yAxisId="mood"
              orientation="right"
              domain={[-1, 1]}
              allowDataOverflow
              tick={{ fill: '#22c55e', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: 'Valência', angle: 90, position: 'insideRight', fontSize: 9, fill: '#22c55e' }}
            />

            <Tooltip content={CustomTooltip} />
            <Legend
              wrapperStyle={{ paddingTop: 10, fontSize: 11 }}
              formatter={(value) => <span style={{ color: '#475569', fontSize: 11 }}>{value}</span>}
            />

            {/* Faixa terapêutica */}
            {showTherapeutic && therapeuticRange && (
              <>
                <ReferenceArea
                  yAxisId="conc"
                  y1={0}
                  y2={therapeuticRange.min}
                  fill={ZONE_COLORS.subtherapeutic}
                  fillOpacity={0.06}
                  ifOverflow="hidden"
                />
                <ReferenceArea
                  yAxisId="conc"
                  y1={therapeuticRange.min}
                  y2={therapeuticRange.max}
                  fill={ZONE_COLORS.therapeutic}
                  fillOpacity={0.08}
                  ifOverflow="hidden"
                  label={{
                    value: 'Faixa terapêutica',
                    position: 'insideTopLeft',
                    fontSize: 8,
                    fill: ZONE_COLORS.therapeutic,
                    opacity: 0.7,
                  }}
                />
                <ReferenceLine
                  yAxisId="conc"
                  y={therapeuticRange.min}
                  stroke={ZONE_COLORS.therapeutic}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  ifOverflow="hidden"
                />
                <ReferenceLine
                  yAxisId="conc"
                  y={therapeuticRange.max}
                  stroke={ZONE_COLORS.therapeutic}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  ifOverflow="hidden"
                />
              </>
            )}

            {/* Css steady-state */}
            {showCss && ssMetrics && (
              <>
                <ReferenceArea
                  yAxisId="conc"
                  y1={ssMetrics.Cmin_ss}
                  y2={ssMetrics.Cmax_ss}
                  fill={CSS_COLOR}
                  fillOpacity={0.1}
                  ifOverflow="hidden"
                />
                <ReferenceLine
                  yAxisId="conc"
                  y={ssMetrics.Css_avg}
                  stroke={CSS_COLOR}
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  ifOverflow="hidden"
                  label={{
                    value: `Css ${ssMetrics.Css_avg.toFixed(0)}`,
                    position: 'right',
                    fontSize: 9,
                    fill: CSS_COLOR,
                  }}
                />
              </>
            )}

            {/* Zona ótima (valência ≥ 0.6) */}
            {showOptimalZone && optimalConcRange && (
              <ReferenceArea
                yAxisId="conc"
                y1={optimalConcRange.min}
                y2={optimalConcRange.max}
                fill={MOOD_COLOR}
                fillOpacity={0.12}
                stroke={MOOD_COLOR}
                strokeWidth={1}
                strokeDasharray="4 2"
                strokeOpacity={0.4}
                ifOverflow="hidden"
                label={{
                  value: 'Zona ótima',
                  position: 'insideTopRight',
                  fontSize: 8,
                  fill: MOOD_COLOR,
                  opacity: 0.8,
                }}
              />
            )}

            {/* Marcadores de dose */}
            {doseMarkers.map((dose, idx) => (
              <ReferenceLine
                key={`dose-${idx}`}
                yAxisId="conc"
                x={dose.timestamp}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{
                  value: `▼ ${dose.amount.toFixed(0)}mg`,
                  position: 'top',
                  fontSize: 7,
                  fill: color,
                  opacity: 0.7,
                }}
              />
            ))}

            {/* Linha "agora" */}
            <ReferenceLine
              yAxisId="conc"
              x={nowTimestamp}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 4"
              strokeOpacity={0.5}
            />

            {/* Curva de plasma */}
            <Area
              yAxisId="conc"
              type="monotoneX"
              dataKey="concentration"
              name="Plasma"
              stroke={color}
              fill={`url(#grad-${medication.id})`}
              strokeWidth={2}
              connectNulls
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
            />

            {/* Curva de efeito (agudos) */}
            {showEffectCurve && (
              <Area
                yAxisId="conc"
                type="monotoneX"
                dataKey="effectConcentration"
                name="Efeito Terapêutico"
                stroke={EFFECT_COLOR}
                fill={`url(#grad-eff-${medication.id})`}
                strokeWidth={2}
                strokeDasharray="5 3"
                connectNulls
                dot={false}
                activeDot={{ r: 4, fill: EFFECT_COLOR, stroke: '#fff', strokeWidth: 2 }}
              />
            )}

            {/* Curva de tendência (crônicos) */}
            {showTrendCurve && (
              <Line
                yAxisId="conc"
                type="monotoneX"
                dataKey="trendConcentration"
                name="Tendência (48h)"
                stroke={TREND_COLOR}
                strokeWidth={3}
                strokeDasharray="8 4"
                connectNulls
                dot={false}
                activeDot={{ r: 5, fill: TREND_COLOR, stroke: '#fff', strokeWidth: 2 }}
              />
            )}

            {/* Overlay de humor */}
            <Line
              yAxisId="mood"
              type="monotoneX"
              dataKey="mood"
              name="Humor (valência)"
              stroke={MOOD_COLOR}
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 4, fill: MOOD_COLOR, stroke: '#fff', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: MOOD_COLOR, stroke: '#fff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Mensagens de dados ausentes */}
      {!hasDoses && (
        <p className="text-xs text-slate-400 text-center mt-2">Nenhuma dose registrada para gerar curva.</p>
      )}
      {hasDoses && !hasConcentration && (
        <p className="text-xs text-slate-400 text-center mt-2">Sem concentração detectável no período. Ajuste o intervalo.</p>
      )}

      {/* Footer info */}
      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[0.68rem] text-slate-400">
        {showTherapeutic && therapeuticRange && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 rounded" style={{ backgroundColor: ZONE_COLORS.therapeutic, opacity: 0.7 }} />
            <span>Faixa terapêutica: {therapeuticRange.min}–{therapeuticRange.max} ng/mL</span>
          </div>
        )}

        {showCss && ssMetrics && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-5 h-0.5 border-t-2 border-dashed" style={{ borderColor: CSS_COLOR }} />
            <span style={{ color: CSS_COLOR }}>Css: {ssMetrics.Css_avg.toFixed(1)} ng/mL</span>
            <span className="text-slate-300">|</span>
            <span>Faixa ss: {ssMetrics.Cmin_ss.toFixed(0)}–{ssMetrics.Cmax_ss.toFixed(0)} ng/mL</span>
            <span className="text-slate-300">|</span>
            <span>τ={ssMetrics.tau}h</span>
            {!ssMetrics.atSteadyState && (
              <span className="text-amber-500">ainda atingindo steady-state (~{ssMetrics.timeToSteadyState.toFixed(0)}h)</span>
            )}
          </div>
        )}

        {showEffectCurve && !isChronic && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 border-t-2 border-dashed" style={{ borderColor: EFFECT_COLOR }} />
            <span style={{ color: EFFECT_COLOR }}>
              Pico de efeito ~{effectMetrics.tMaxEffect.toFixed(1)}h após dose
              (ke0={effectMetrics.ke0.toFixed(2)}/h, lag={effectMetrics.effectLag.toFixed(1)}h)
            </span>
          </div>
        )}

        {isChronic && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-500">Delay adesão→humor:</span>
            <span>~{adherenceMetrics.adherenceLagDays}d — {adherenceMetrics.description}</span>
          </div>
        )}
      </div>
    </div>
  )
}
