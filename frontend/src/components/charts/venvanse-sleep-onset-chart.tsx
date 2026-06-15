import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { FULL_HISTORY_DOSE_HOURS, useDoses, useSubstances } from '@/lib/api'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'
import { TOOLTIP_DEFAULTS } from '@/components/charts/shared/tooltip-helpers'
import { evaluateReadiness, type ReadinessRequirement } from '@/utils/data-readiness'
import {
  inferIntradayCorrelation,
  linearRegression,
  substanceToPKMedication,
  toPKDoses,
  type PKMoodPair,
} from '@/utils/intraday-correlation'
import { calculateConcentration, DEFAULT_PK_BODY_WEIGHT_KG } from '@/utils/pharmacokinetics'
import { computeSleepOnsetDelaySeries } from '@/utils/sleep-onset-delay'

const VENVANSE_ID = 'venvanse'

// Pares concentração×atraso são diários (um por noite). Thresholds de pares.
const REQUIREMENT: ReadinessRequirement = {
  type: 'pairs',
  robustMin: 30,
  exploratoryMin: 14,
  collectingMin: 7,
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'var(--card-strong)',
  color: 'var(--foreground)',
  fontSize: 12,
}

function formatPValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  if (value < 0.001) return '<0.001'
  return value.toFixed(3)
}

interface OnsetPair {
  date: string
  concentration: number
  delayMinutes: number
}

interface VenvanseSleepOnsetChartProps {
  snapshots: DailySnapshot[]
}

export function VenvanseSleepOnsetChart({ snapshots }: VenvanseSleepOnsetChartProps) {
  const { data: allDoses = [] } = useDoses(FULL_HISTORY_DOSE_HOURS)
  const { data: substances = [] } = useSubstances()

  const med = useMemo(() => {
    const sub = substances.find((s) => s.id === VENVANSE_ID)
    return sub ? substanceToPKMedication(sub) : null
  }, [substances])

  const venvanseDoses = useMemo(
    () => toPKDoses(allDoses.filter((d) => d.substance === VENVANSE_ID)),
    [allDoses],
  )

  const pairs: OnsetPair[] = useMemo(() => {
    if (!med || venvanseDoses.length === 0) return []
    const delays = computeSleepOnsetDelaySeries(snapshots)
    const result: OnsetPair[] = []
    for (const point of delays) {
      if (point.delayMinutes == null) continue
      const realStartMs = new Date(point.sleepStartAt).getTime()
      if (!Number.isFinite(realStartMs)) continue
      // Hora-âncora = instante do baseline de onset naquela noite, NÃO o horário
      // real de deitar. realStart - delay = baseline (delay = onsetReal - baseline),
      // desacoplando a concentração do confound "deitou tarde => menos residual".
      const anchorMs = realStartMs - point.delayMinutes * 60_000
      const concentration = calculateConcentration(med, venvanseDoses, anchorMs, DEFAULT_PK_BODY_WEIGHT_KG)
      if (!Number.isFinite(concentration)) continue
      result.push({ date: point.date, concentration, delayMinutes: point.delayMinutes })
    }
    return result
  }, [med, venvanseDoses, snapshots])

  const pkMoodLikePairs: PKMoodPair[] = useMemo(
    () => pairs.map((p, idx) => ({ timestamp: idx, concentration: p.concentration, valence: p.delayMinutes })),
    [pairs],
  )

  const inference = useMemo(
    () => inferIntradayCorrelation(pkMoodLikePairs, { method: 'pearson' }),
    [pkMoodLikePairs],
  )

  const regression = useMemo(() => {
    if (pairs.length < 3) return null
    return linearRegression(
      pairs.map((p) => p.concentration),
      pairs.map((p) => p.delayMinutes),
    )
  }, [pairs])

  const readiness = evaluateReadiness([], REQUIREMENT, 'Venvanse ao deitar × atraso do sono', {
    pairCount: pairs.length,
  })

  const xMax = pairs.length > 0 ? Math.max(...pairs.map((p) => p.concentration), 0.01) : 0.01
  const regressionLine =
    regression && pairs.length >= 3
      ? [
          { concentration: 0, delayMinutes: regression.intercept },
          { concentration: xMax, delayMinutes: regression.intercept + regression.slope * xMax },
        ]
      : []

  const scatterData = pairs.map((p) => ({ concentration: p.concentration, delayMinutes: p.delayMinutes, label: p.date }))

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-violet-200 dark:border-violet-400/30 bg-violet-50 dark:bg-violet-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
        Exploratório · Venvanse × Sono
      </span>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">
          O Venvanse atrasou meu sono?
        </h3>
        {inference && (
          <span className="inline-flex items-center rounded-full border border-violet-200 dark:border-violet-400/30 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
            Pearson r = {inference.r.toFixed(2)} · p = {formatPValue(inference.pValuePermutation)} · n = {inference.n}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Cada ponto é uma noite: concentração estimada de Venvanse na sua <strong>hora habitual de dormir</strong> (eixo X)
        contra o atraso do início do sono vs. seu baseline (eixo Y). Hipótese: mais estimulante residual na hora
        de dormir → adormeceu mais tarde → r positivo.
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">Como ler</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          A concentração é avaliada na sua hora-âncora de dormir (média circular das últimas ~14 noites), não no
          horário real em que deitou — isso evita o confound farmacocinético de que deitar mais tarde sempre reduz
          o residual. Vem do modelo PK sobre suas doses registradas (não é medição). O atraso é o desvio do horário
          de adormecer vs. esse baseline — positivo = dormiu mais tarde. Correlação ≠ causalidade.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
            <ComposedChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke={CHART_TOKENS.ui.grid} />
              <XAxis
                type="number"
                dataKey="concentration"
                name="Venvanse na hora de dormir"
                tick={{ fill: CHART_TOKENS.ui.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))}
                label={{ value: 'Venvanse na hora de dormir (ng/mL)', position: 'bottom', offset: -5, fontSize: 11, fill: CHART_TOKENS.ui.muted }}
              />
              <YAxis
                type="number"
                dataKey="delayMinutes"
                name="Atraso do sono"
                tick={{ fill: CHART_TOKENS.ui.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}min`}
                label={{ value: 'Atraso do início (min)', angle: -90, position: 'left', offset: 10, fontSize: 11, fill: CHART_TOKENS.ui.muted }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                {...TOOLTIP_DEFAULTS}
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => {
                  if (name === 'Venvanse na hora de dormir') return [typeof v === 'number' ? `${v.toFixed(2)} ng/mL` : '—', name]
                  if (name === 'Atraso do sono') return [typeof v === 'number' ? `${v > 0 ? '+' : ''}${v.toFixed(0)} min` : '—', name]
                  return [String(v ?? '—'), String(name ?? '')]
                }}
                labelFormatter={() => ''}
              />
              <Scatter name="Noites" data={scatterData} fill={CHART_TOKENS.series.venvanse} fillOpacity={0.65} />
              {regressionLine.length === 2 && (
                <Line
                  type="linear"
                  dataKey="delayMinutes"
                  data={regressionLine}
                  stroke={CHART_TOKENS.reference.attentionText}
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
    </div>
  )
}
