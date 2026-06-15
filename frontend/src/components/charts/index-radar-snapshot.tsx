import { useMemo } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { computeActivityReadiness } from '@/utils/activity-readiness'
import { computeCircadianRobustness } from '@/utils/circadian-robustness'
import { computeFunctionalCapacity } from '@/utils/functional-capacity'
import { computeMovementEfficiency } from '@/utils/movement-efficiency'
import { computeRecoveryIndexSeries } from '@/utils/recovery-index'
import { computeSleepQualityScoreSeries } from '@/utils/sleep-quality-score'
import { computeSleepRegularitySeries } from '@/utils/sleep-regularity'

import { CHART_TOKENS } from './shared/chart-tokens'
import { TOOLTIP_DEFAULTS } from '@/components/charts/shared/tooltip-helpers'

/**
 * Radar com snapshot dos índices em escala 0–100 da INDEX_EVIDENCE_MATRIX.
 *
 * Cobertura desta primeira versão: 7 índices que rendem score 0–100 unificado.
 * Os 3 restantes da matriz (AutonomicBalance z-score, HRVVariability ms,
 * HRRange bpm) ficam fora porque não normalizam pra 0–100 trivialmente.
 *
 * Mostra 1 polígono (snapshot atual) + reference circles em 70 (ótimo) e
 * 45 (atenção). Sombra "média 30d" fica como follow-up — exige snapshots
 * recortados por janela pra alguns índices que são por-janela.
 */

interface IndexRadarSnapshotProps {
  snapshots: DailySnapshot[]
}

interface RadarDatum {
  axis: string
  value: number | null
}

const AXIS_LABELS: Record<string, string> = {
  NightQuality: 'Night Quality',
  RecoveryIndex: 'Recovery',
  SleepRegularity: 'Sleep Reg.',
  ActivityReadiness: 'Activity Ready',
  FunctionalCapacityIndex: 'Func. Capacity',
  CircadianRobustness: 'Circadian',
  MovementEfficiency: 'Movement',
}

function lastNonNullScore(series: ReadonlyArray<{ score: number | null }>): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const s = series[i].score
    if (s != null && Number.isFinite(s)) return s
  }
  return null
}

function buildRadarData(snapshots: DailySnapshot[]): RadarDatum[] {
  const nightQuality = lastNonNullScore(computeSleepQualityScoreSeries(snapshots))
  const recoveryIndex = lastNonNullScore(computeRecoveryIndexSeries(snapshots))
  const sleepRegularity = lastNonNullScore(computeSleepRegularitySeries(snapshots))
  const activityReadiness = computeActivityReadiness(snapshots).score
  const fci = computeFunctionalCapacity(snapshots).score
  const circadian = computeCircadianRobustness(snapshots).score
  const movement = computeMovementEfficiency(snapshots).score

  return [
    { axis: AXIS_LABELS.NightQuality, value: nightQuality },
    { axis: AXIS_LABELS.RecoveryIndex, value: recoveryIndex },
    { axis: AXIS_LABELS.SleepRegularity, value: sleepRegularity },
    { axis: AXIS_LABELS.CircadianRobustness, value: circadian },
    { axis: AXIS_LABELS.MovementEfficiency, value: movement },
    { axis: AXIS_LABELS.FunctionalCapacityIndex, value: fci },
    { axis: AXIS_LABELS.ActivityReadiness, value: activityReadiness },
  ]
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
  background: 'white',
  boxShadow: '0 18px 42px rgba(17,35,30,0.12)',
  padding: '6px 10px',
}

export function IndexRadarSnapshot({ snapshots }: IndexRadarSnapshotProps) {
  const data = useMemo(() => buildRadarData(snapshots), [snapshots])
  const hasAny = data.some((d) => d.value != null)

  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
        Sem dados suficientes na janela atual para os índices do radar.
      </div>
    )
  }

  // Recharts não plota null no Radar — substitui por 0 mas mantém label com asterisco
  const chartData = data.map((d) => ({
    axis: d.value == null ? `${d.axis} *` : d.axis,
    value: d.value ?? 0,
  }))

  return (
    <div className="rounded-2xl border border-slate-900/10 bg-white/85 p-4 shadow-[0_12px_28px_rgba(17,35,30,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Visão sinótica · 7 índices 0–100
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Snapshot atual derivado da janela visível. Eixos marcados com * estão sem dado.
          </p>
        </div>
      </div>

      <div className="mt-3 h-[320px] w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
          initialDimension={{ width: 1, height: 1 }}
        >
          <RadarChart data={chartData} margin={{ top: 12, right: 32, bottom: 12, left: 32 }}>
            <PolarGrid stroke={CHART_TOKENS.ui.grid} />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: CHART_TOKENS.ui.muted, fontSize: 9 }}
              tickCount={6}
              axisLine={false}
            />
            <Tooltip
              {...TOOLTIP_DEFAULTS}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => {
                if (typeof value !== 'number') return ['—', String(name)]
                return [`${value.toFixed(0)}/100`, 'Score']
              }}
            />
            <Radar
              dataKey="value"
              stroke={CHART_TOKENS.series.composite}
              fill={CHART_TOKENS.series.composite}
              fillOpacity={0.25}
              strokeWidth={1.6}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 text-[0.66rem] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: CHART_TOKENS.reference.optimalText }} />
          ≥70 ótimo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: CHART_TOKENS.reference.attentionText }} />
          ≤45 atenção
        </span>
      </div>
    </div>
  )
}
