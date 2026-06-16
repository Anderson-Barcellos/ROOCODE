import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'
import { ChartTooltip } from '@/components/charts/shared/ChartTooltip'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import {
  inferIntradayCorrelation,
  linearRegression,
  type IntradayCorrelationMethod,
  type PKMoodPair,
} from '@/utils/intraday-correlation'
import type { CognitiveSessionChartRow } from '@/types/cognition'

type XAxisKey = 'venvanse_ng_ml' | 'hours_since_dose'
type MetricKey = 'pvt_lapses' | 'pvt_median_rt_ms'

const X_OPTIONS: { key: XAxisKey; label: string; unit: string }[] = [
  { key: 'venvanse_ng_ml', label: 'Concentração', unit: 'ng/mL' },
  { key: 'hours_since_dose', label: 'Horas desde a dose', unit: 'h' },
]
const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'pvt_lapses', label: 'Lapses PVT' },
  { key: 'pvt_median_rt_ms', label: 'RT mediana (ms)' },
]
const METHOD_OPTIONS: IntradayCorrelationMethod[] = ['pearson', 'spearman']

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
  background: 'rgba(255,252,246,0.97)',
  boxShadow: '0 18px 42px rgba(17,35,30,0.12)',
}

function formatPValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  if (value < 0.001) return '<0.001'
  return value.toFixed(3)
}

// r < 0 com a concentração indica MELHORA cognitiva (lapses/RT menores = melhor),
// direção invertida em relação ao humor — por isso a nota textual abaixo do gráfico.
export function PKCognitionScatterChart({ rows }: { rows: CognitiveSessionChartRow[] }) {
  const [xKey, setXKey] = useState<XAxisKey>('venvanse_ng_ml')
  const [metric, setMetric] = useState<MetricKey>('pvt_lapses')
  const [method, setMethod] = useState<IntradayCorrelationMethod>('pearson')

  const { pairs, inference, regression, xMax } = useMemo(() => {
    const built: PKMoodPair[] = rows
      .filter((row) => row[xKey] != null && row[metric] != null)
      .map((row) => ({
        timestamp: new Date(row.started_at).getTime(),
        concentration: row[xKey] as number,
        valence: row[metric] as number,
      }))
    if (built.length < 3) {
      return { pairs: built, inference: null, regression: null as null | { slope: number; intercept: number }, xMax: 0 }
    }
    const xs = built.map((p) => p.concentration)
    const ys = built.map((p) => p.valence)
    return {
      pairs: built,
      inference: inferIntradayCorrelation(built, { method }),
      regression: method === 'pearson' ? linearRegression(xs, ys) : null,
      xMax: Math.max(...xs, 1),
    }
  }, [rows, xKey, metric, method])

  const readiness = evaluateReadiness([], CHART_REQUIREMENTS.pkCognitionScatter, 'PVT × Venvanse', {
    pairCount: pairs.length,
  })

  const xMeta = X_OPTIONS.find((o) => o.key === xKey)!
  const metricMeta = METRIC_OPTIONS.find((o) => o.key === metric)!

  const regressionLine =
    regression && pairs.length >= 3
      ? [
          { concentration: 0, valence: regression.intercept },
          { concentration: xMax, valence: regression.intercept + regression.slope * xMax },
        ]
      : []

  const scatterData = pairs.map((p) => ({ concentration: p.concentration, valence: p.valence }))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-[color:var(--muted)]">
          Cada ponto é uma sessão cognitiva, pareando a métrica do PVT com a concentração estimada de Venvanse no horário da aferição.
        </p>
        {inference && (
          <span className="inline-flex items-center rounded-full border border-teal-200 dark:border-teal-400/30 bg-teal-50 dark:bg-teal-500/10 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
            {method === 'pearson' ? 'Pearson r' : 'Spearman ρ'} = {inference.r.toFixed(2)} · p_perm = {formatPValue(inference.pValuePermutation)} · n = {inference.n}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Eixo X</span>
        {X_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setXKey(option.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              xKey === option.key
                ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Métrica</span>
        {METRIC_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMetric(option.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              metric === option.key
                ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Método</span>
        {METHOD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMethod(option)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              method === option
                ? 'bg-teal-700 text-white'
                : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'
            }`}
          >
            {option === 'pearson' ? 'Pearson' : 'Spearman'}
          </button>
        ))}
      </div>

      <DataReadinessGate readiness={readiness}>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
            <ComposedChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke={CHART_TOKENS.ui.grid} />
              <XAxis
                type="number"
                dataKey="concentration"
                name={xMeta.label}
                tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))}
                label={{ value: `${xMeta.label} (${xMeta.unit})`, position: 'bottom', offset: -5, fontSize: 11, fill: CHART_TOKENS.ui.axis }}
              />
              <YAxis
                type="number"
                dataKey="valence"
                name={metricMeta.label}
                tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(0))}
                label={{ value: metricMeta.label, angle: -90, position: 'left', offset: 10, fontSize: 11, fill: CHART_TOKENS.ui.axis }}
              />
              <ZAxis range={[40, 40]} />
              <ChartTooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => {
                  if (name === xMeta.label) return [typeof v === 'number' ? `${v.toFixed(2)} ${xMeta.unit}` : '—', name]
                  if (name === metricMeta.label) return [typeof v === 'number' ? v.toFixed(0) : '—', name]
                  return [String(v ?? '—'), String(name ?? '')]
                }}
                labelFormatter={() => ''}
              />
              <Scatter name="Sessões" data={scatterData} fill={CHART_TOKENS.series.capacity} fillOpacity={0.65} />
              {regressionLine.length === 2 && (
                <Line
                  type="linear"
                  dataKey="valence"
                  data={regressionLine}
                  stroke={CHART_TOKENS.series.chronobiology}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>

      <p className="text-xs leading-5 text-[color:var(--muted)]">
        Direção: lapses e RT são <strong>piores quando maiores</strong>, então <strong>r &lt; 0</strong> indica melhor
        vigilância com mais concentração (o esperado com o estimulante). Correlação ≠ causalidade; com n pequeno, ruidoso.
      </p>
    </div>
  )
}
