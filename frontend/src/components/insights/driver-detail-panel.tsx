import { ArrowRight } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from 'recharts'

import type { RankedDriver } from '@/utils/driver-ranking'
import { buildInvestigativePrompt } from '@/utils/insights-narrative'
import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'

interface Props {
  driver: RankedDriver
}

function regressionLine(
  points: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> | null {
  if (points.length < 10) return null
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return null
  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  const xs = points.map((p) => p.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept },
  ]
}

export function DriverDetailPanel({ driver }: Props) {
  const prompt = buildInvestigativePrompt(driver)
  const scatterPoints = driver.sparkline14d
    .filter((p) => p.value != null && p.mood != null)
    .map((p) => ({ x: p.value as number, y: p.mood as number }))
  const regression = regressionLine(scatterPoints)

  return (
    <div className="mt-3 rounded-xl border border-slate-900/10 bg-white/85 p-4 text-sm leading-6 text-slate-700">
      <p className="text-base text-slate-800">{prompt}</p>

      {scatterPoints.length >= 3 && (
        <div className="mt-4 h-44">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
            initialDimension={{ width: 1, height: 1 }}
          >
            <ScatterChart margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
              <CartesianGrid stroke={CHART_TOKENS.ui.grid} />
              <XAxis
                dataKey="x"
                name={driver.label}
                type="number"
                stroke={CHART_TOKENS.ui.axis}
                fontSize={11}
              />
              <YAxis
                dataKey="y"
                name="humor"
                type="number"
                domain={[-1, 1]}
                stroke={CHART_TOKENS.ui.axis}
                fontSize={11}
              />
              <ReferenceLine y={0} stroke={CHART_TOKENS.reference.meanText} strokeDasharray="2 2" />
              <Scatter data={scatterPoints} fill={CHART_TOKENS.series.composite} />
              {regression && (
                <Line
                  type="linear"
                  data={regression}
                  dataKey="y"
                  stroke={CHART_TOKENS.series.mood}
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Destino natural:&nbsp;
        <span className="font-mono normal-case">{driver.chartHint}</span>
        <ArrowRight className="h-3 w-3" />
      </p>
    </div>
  )
}
