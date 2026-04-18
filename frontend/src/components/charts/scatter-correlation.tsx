import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import {
  METRIC_KEYS,
  METRIC_LABELS,
  PRESET_CORRELATIONS,
  correlate,
  extractMetricValues,
  type MetricKey,
} from '@/utils/correlations'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { pearson } from '@/utils/statistics'
import { DataReadinessGate } from './shared/DataReadinessGate'

type ExtraMetrics = Record<string, { label: string; values: Array<number | null> }>

interface ScatterCorrelationProps {
  snapshots: DailySnapshot[]
  extraMetrics?: ExtraMetrics
}

const LAG_OPTIONS = [
  { value: 0, label: 'Mesmo dia' },
  { value: 1, label: '+1 dia' },
  { value: 2, label: '+2 dias' },
  { value: 3, label: '+3 dias' },
]

const STRENGTH_BADGE: Record<string, string> = {
  strong: 'bg-emerald-100 text-emerald-800',
  moderate: 'bg-amber-100 text-amber-800',
  weak: 'bg-slate-100 text-slate-600',
  negligible: 'bg-slate-100 text-slate-400',
}

const STRENGTH_LABEL: Record<string, string> = {
  strong: 'Forte',
  moderate: 'Moderada',
  weak: 'Fraca',
  negligible: 'Negligível',
}

const SELECT_CLASS =
  'rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500'

export function ScatterCorrelation({ snapshots, extraMetrics = {} }: ScatterCorrelationProps) {
  const [xKey, setXKey] = useState<string>('sleepTotalHours')
  const [yKey, setYKey] = useState<string>('valence')
  const [lag, setLag] = useState(1)

  const allMetricOptions = useMemo(() => [
    ...METRIC_KEYS.map((k) => ({ key: k, label: METRIC_LABELS[k] })),
    ...Object.entries(extraMetrics).map(([k, v]) => ({ key: k, label: v.label })),
  ], [extraMetrics])

  const xLabel = allMetricOptions.find((o) => o.key === xKey)?.label ?? xKey
  const yLabel = allMetricOptions.find((o) => o.key === yKey)?.label ?? yKey

  const { scatterData, regressionLine, result } = useMemo(() => {
    if (!snapshots.length) return { scatterData: [], regressionLine: [], result: null }

    const getValues = (key: string) =>
      key in extraMetrics
        ? extraMetrics[key].values
        : extractMetricValues(snapshots, key as MetricKey)

    const xs = getValues(xKey)
    const ys = getValues(yKey)

    const pairs = lag === 0
      ? xs.flatMap((x, i): { sx: number; sy: number; interp: boolean }[] => {
          const y = ys[i]
          if (x == null || y == null) return []
          const s = snapshots[i]
          return [{ sx: x, sy: y, interp: s?.interpolated === true }]
        })
      : xs.flatMap((x, i): { sx: number; sy: number; interp: boolean }[] => {
          const y = ys[i + lag]
          if (x == null || y == null || i + lag >= snapshots.length) return []
          const sx_snap = snapshots[i]
          const sy_snap = snapshots[i + lag]
          const interp = sx_snap?.interpolated === true || sy_snap?.interpolated === true
          return [{ sx: x, sy: y, interp }]
        })

    const isExtraKey = (k: string) => k in extraMetrics
    const result = (!isExtraKey(xKey) && !isExtraKey(yKey))
      ? correlate(snapshots, xKey as MetricKey, yKey as MetricKey, lag)
      : pairs.length >= 10
        ? pearson(pairs.map((p) => p.sx), pairs.map((p) => p.sy))
        : null

    if (!pairs.length) return { scatterData: pairs, regressionLine: [], result }

    const xVals = pairs.map((p) => p.sx)
    const yVals = pairs.map((p) => p.sy)

    const n = xVals.length
    const sumX = xVals.reduce((a, b) => a + b, 0)
    const sumY = yVals.reduce((a, b) => a + b, 0)
    const sumXY = xVals.reduce((s, x, i) => s + x * yVals[i], 0)
    const sumX2 = xVals.reduce((s, x) => s + x * x, 0)
    const denom = n * sumX2 - sumX * sumX
    const regFull = denom !== 0
      ? (() => {
          const slope = (n * sumXY - sumX * sumY) / denom
          const intercept = (sumY - slope * sumX) / n
          return { predict: (x: number) => slope * x + intercept }
        })()
      : null

    const xMin = Math.min(...xVals)
    const xMax = Math.max(...xVals)

    const regressionLine = regFull
      ? [
          { rx: xMin, ry: regFull.predict(xMin) },
          { rx: xMax, ry: regFull.predict(xMax) },
        ]
      : []

    return { scatterData: pairs, regressionLine, result }
  }, [snapshots, extraMetrics, xKey, yKey, lag])

  const readiness = useMemo(
    () =>
      evaluateReadiness(snapshots, CHART_REQUIREMENTS.scatterCorrelation, 'Scatter', {
        pairCount: scatterData.length,
      }),
    [snapshots, scatterData.length],
  )

  function applyPreset(idx: number) {
    const p = PRESET_CORRELATIONS[idx]
    setXKey(p.xKey)
    setYKey(p.yKey)
    setLag(p.lag)
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Correlações
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Scatter interativo
      </h3>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_CORRELATIONS.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => applyPreset(i)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              xKey === p.xKey && yKey === p.yKey && lag === p.lag
                ? 'bg-teal-700 text-white'
                : 'border border-slate-900/10 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {p.description}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">X</span>
          <select value={xKey} onChange={(e) => setXKey(e.target.value)} className={SELECT_CLASS}>
            {allMetricOptions.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Y</span>
          <select value={yKey} onChange={(e) => setYKey(e.target.value)} className={SELECT_CLASS}>
            {allMetricOptions.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Lag Y</span>
          <select value={lag} onChange={(e) => setLag(Number(e.target.value))} className={SELECT_CLASS}>
            {LAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <DataReadinessGate readiness={readiness}>
      {result ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STRENGTH_BADGE[result.strength]}`}>
            {STRENGTH_LABEL[result.strength]}
          </span>
          <span className="font-mono text-sm font-semibold text-slate-700">
            R = {result.r.toFixed(3)}
          </span>
          <span className="text-xs text-slate-500">
            p = {result.pValue < 0.001 ? '<0.001' : result.pValue.toFixed(3)}
            {result.significant ? ' *' : ''}
          </span>
          <span className="text-xs text-slate-400">N = {result.n}</span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">
          Dados insuficientes para calcular correlação (mín. 10 pares válidos).
        </p>
      )}

      <div className="mt-4 h-[260px] w-full">
        {scatterData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="rgba(100,116,139,0.1)" />
              <XAxis
                dataKey="sx"
                type="number"
                domain={['auto', 'auto']}
                name={xLabel}
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={{ value: xLabel, position: 'insideBottom', offset: -4, fill: '#64748b', fontSize: 11 }}
              />
              <YAxis
                dataKey="sy"
                type="number"
                domain={['auto', 'auto']}
                name={yLabel}
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 14,
                  border: '1px solid rgba(15,23,42,0.08)',
                  fontSize: 12,
                }}
                formatter={(value, _name, item) => {
                  const interp = (item?.payload as { interp?: boolean } | undefined)?.interp
                  const txt = typeof value === 'number' ? value.toFixed(2) : String(value)
                  return [`${txt}${interp ? ' ⚠ estimado' : ''}`]
                }}
              />
              <Scatter
                name={xLabel}
                data={scatterData}
                shape={(props: unknown) => {
                  const p = props as { cx?: number; cy?: number; payload?: { interp?: boolean } }
                  if (p.cx == null || p.cy == null) return <g />
                  const isInterp = p.payload?.interp === true
                  return (
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={4}
                      fill={isInterp ? 'white' : '#0f766e'}
                      stroke="#0f766e"
                      strokeWidth={isInterp ? 1.5 : 1}
                      strokeDasharray={isInterp ? '2 1.5' : undefined}
                      opacity={isInterp ? 0.7 : 0.65}
                    />
                  )
                }}
              />
              {regressionLine.length === 2 && (
                <Line
                  data={regressionLine}
                  dataKey="ry"
                  dot={false}
                  stroke="#be123c"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  activeDot={false}
                  legendType="none"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Sem pares válidos para o período selecionado.
          </div>
        )}
      </div>
      </DataReadinessGate>
    </div>
  )
}
