import { useMemo, type ReactNode } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { getDataSuffix } from '@/components/charts/shared/tooltip-helpers'
import { StepsChart } from '@/components/charts/steps-chart'
import { Vo2MaxChart } from '@/components/charts/vo2-max-chart'
import { WalkingVitalityChart } from '@/components/charts/walking-vitality-chart'
import { dayLabel } from '@/utils/aggregation'
import {
  computeCircadianRobustness,
  formatCircadianReadiness,
} from '@/utils/circadian-robustness'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import {
  computeFunctionalCapacity,
  formatFunctionalCapacityReadiness,
  getFunctionalCapacityTone,
} from '@/utils/functional-capacity'
import {
  computeMovementEfficiency,
  formatMovementReadiness,
} from '@/utils/movement-efficiency'
import { mean } from '@/utils/date'

interface SharedPanelProps {
  snapshots: DailySnapshot[]
  baselineSnapshots?: DailySnapshot[]
  forecastStartDate?: string
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

const TONE_CLASS = {
  positive: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  watch: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200',
  negative: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200',
  neutral: 'border-slate-200 bg-slate-50 text-slate-800',
} as const

function formatNumber(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits).replace('.', ',')
}

function SmallBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONE_CLASS }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  )
}

export function FunctionalCapacityIndexCard({ snapshots, baselineSnapshots = snapshots }: SharedPanelProps) {
  const result = useMemo(
    () => computeFunctionalCapacity(snapshots, baselineSnapshots),
    [snapshots, baselineSnapshots],
  )
  const tone = getFunctionalCapacityTone(result.score)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex flex-wrap gap-2">
            <SmallBadge tone={result.readiness === 'robust' ? 'positive' : result.readiness === 'exploratory' ? 'watch' : 'neutral'}>
              {formatFunctionalCapacityReadiness(result)}
            </SmallBadge>
            <SmallBadge tone="neutral">{result.inputsUsed}/5 inputs ativos</SmallBadge>
          </div>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Functional Capacity Index
          </h3>
          <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${TONE_CLASS[tone]}`}>
            <span className="font-semibold">Veredito:</span> {result.verdict}
          </p>
          {result.vo2Divergence != null && Math.abs(result.vo2Divergence) >= 5 && (
            <p className="mt-2 rounded-xl border border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-900 dark:text-sky-200">
              <span className="font-semibold">Cross-check VO2:</span> 6MWT difere {result.vo2Divergence >= 0 ? '+' : ''}
              {result.vo2Divergence.toFixed(1)} ml/kg/min do estimado. Isso é informação clínica, não erro de tela.
            </p>
          )}
        </div>
        <CardScoreBadge
          label="FCI"
          value={result.score != null ? result.score.toFixed(0) : '—'}
          hint={`${Math.round(result.confidence * 100)}% confiança`}
        />
      </div>

      <div className="mt-4 space-y-2">
        {result.components.map((component) => {
          const width = component.score == null ? 0 : Math.max(4, component.score)
          return (
            <div key={component.key} className="grid gap-2 text-xs sm:grid-cols-[150px_1fr_150px]">
              <div>
                <div className="font-semibold text-slate-700">{component.label}</div>
                <div className="text-slate-400">{component.note}</div>
              </div>
              <div className="h-3 self-center rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-teal-600"
                  style={{ width: `${width}%`, opacity: component.score == null ? 0 : 0.75 }}
                />
              </div>
              <div className="text-slate-600">
                {component.value == null ? 'pendente' : `${formatNumber(component.value, component.unit === 'z' ? 2 : 1)} ${component.unit}`}
                {' · '}
                peso {Math.round(component.activeWeight * 100)}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RealLoadChart({ snapshots, forecastStartDate }: SharedPanelProps) {
  const { rows, avgSteps, avgEnergy, avgExercise, avgEffort, avgStanding } = useMemo(() => {
    const source = snapshots.filter((snapshot) => snapshot.health)
    const rows = source.map((snapshot) => ({
      label: dayLabel(snapshot.date),
      energia: snapshot.health?.activeEnergyKcal ?? null,
      exercicio: snapshot.health?.exerciseMinutes ?? null,
      esforco: snapshot.health?.physicalEffort ?? null,
      interpolated: snapshot.interpolated === true,
      forecasted: snapshot.forecasted === true,
      forecastConfidence: snapshot.forecastConfidence ?? null,
    }))
    const real = snapshots.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted).slice(-30)
    return {
      rows,
      avgSteps: mean(real.map((snapshot) => snapshot.health?.steps ?? null)),
      avgEnergy: mean(real.map((snapshot) => snapshot.health?.activeEnergyKcal ?? null)),
      avgExercise: mean(real.map((snapshot) => snapshot.health?.exerciseMinutes ?? null)),
      avgEffort: mean(real.map((snapshot) => snapshot.health?.physicalEffort ?? null)),
      avgStanding: mean(real.map((snapshot) => snapshot.health?.standingMinutes ?? null)),
    }
  }, [snapshots])

  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.capacityRealLoadPanel, 'Carga real'),
    [snapshots],
  )
  const sedentary = avgSteps != null && avgSteps < 5000
  const verdict = sedentary
    ? `Média 30d de ${Math.round(avgSteps).toLocaleString('pt-BR')} passos/dia: padrão sedentário. Intervenção primária sugerida é deslocamento ativo em rotina, antes de treino programado.`
    : avgSteps == null
      ? 'Ainda faltam passos reais suficientes para classificar carga diária.'
      : `Carga diária em ${Math.round(avgSteps).toLocaleString('pt-BR')} passos/dia, com ${formatNumber(avgExercise, 0)} min/dia de exercício registrado.`

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SmallBadge tone={sedentary ? 'negative' : 'neutral'}>{sedentary ? 'Sedentário 30d' : readiness.label}</SmallBadge>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Carga real</h3>
          <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${sedentary ? TONE_CLASS.negative : TONE_CLASS.neutral}`}>
            <span className="font-semibold">Veredito:</span> {verdict}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <span>Energia {formatNumber(avgEnergy, 0)} kcal/d</span>
          <span>Esforço {formatNumber(avgEffort, 2)}</span>
          <span>Exercício {formatNumber(avgExercise, 0)} min/d</span>
          <span>Em pé {formatNumber(avgStanding, 0)} min/d</span>
        </div>
      </div>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
            <ComposedChart data={rows} margin={{ top: 8, right: 44, bottom: 4, left: 0 }} barSize={rows.length > 60 ? 4 : rows.length > 30 ? 6 : 10}>
              <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis yAxisId="left" tick={{ fill: '#ea580c', fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#0369a1', fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name, item) => {
                  const suffix = getDataSuffix(item)
                  if (typeof v !== 'number') return ['—', name]
                  if (name === 'energia') return [`${v.toFixed(0)} kcal${suffix}`, 'Energia ativa']
                  if (name === 'exercicio') return [`${v.toFixed(0)} min${suffix}`, 'Exercício']
                  return [`${v.toFixed(2)} kcal/hr·kg${suffix}`, 'Esforço físico']
                }}
              />
              <Legend formatter={(value) => {
                const labels: Record<string, string> = { energia: 'Energia', exercicio: 'Exercício', esforco: 'Esforço físico' }
                return <span style={{ fontSize: 12, color: '#475569' }}>{labels[value] ?? value}</span>
              }} />
              {forecastStartDate && <ReferenceLine x={dayLabel(forecastStartDate)} stroke="#7c3aed" strokeDasharray="4 3" strokeWidth={1.5} />}
              <Bar yAxisId="left" dataKey="energia" fill="#ea580c" radius={[2, 2, 0, 0]} name="energia">
                {rows.map((entry, i) => <Cell key={`energy-${i}`} fillOpacity={entry.forecasted ? 0.35 : entry.interpolated ? 0.3 : 0.75} />)}
              </Bar>
              <Bar yAxisId="right" dataKey="exercicio" fill="#15803d" radius={[2, 2, 0, 0]} name="exercicio">
                {rows.map((entry, i) => <Cell key={`exercise-${i}`} fillOpacity={entry.forecasted ? 0.35 : entry.interpolated ? 0.3 : 0.75} />)}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="esforco" stroke="#0369a1" strokeWidth={2} dot={false} connectNulls={false} name="esforco" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>
    </div>
  )
}

export function RealLoadPanel({ snapshots, forecastStartDate }: SharedPanelProps) {
  return (
    <div className="space-y-4">
      <RealLoadChart snapshots={snapshots} forecastStartDate={forecastStartDate} />
      <StepsChart snapshots={snapshots} forecastStartDate={forecastStartDate} />
    </div>
  )
}

export function CapacityCardiovascularPanel({ snapshots, baselineSnapshots = snapshots, forecastStartDate }: SharedPanelProps) {
  const fci = useMemo(
    () => computeFunctionalCapacity(snapshots, baselineSnapshots),
    [snapshots, baselineSnapshots],
  )
  const verdict = `VO2 estimado ${formatNumber(fci.vo2Estimated, 1)} ml/kg/min. ${fci.verdict}`

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
        <span className="font-semibold text-slate-900">Capacidade aeróbica:</span> {verdict}
      </p>
      <Vo2MaxChart snapshots={snapshots} forecastStartDate={forecastStartDate} />
    </div>
  )
}

export function CircadianRobustnessCard({ snapshots }: SharedPanelProps) {
  const result = useMemo(() => computeCircadianRobustness(snapshots), [snapshots])
  const tone = result.score == null ? 'neutral' : result.score >= 70 ? 'positive' : result.score >= 45 ? 'watch' : 'negative'

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex flex-wrap gap-2">
            <SmallBadge tone={result.readiness === 'robust' ? 'positive' : result.readiness === 'exploratory' ? 'watch' : 'neutral'}>
              {formatCircadianReadiness(result)}
            </SmallBadge>
            <SmallBadge tone="watch">Proxy circadiana parcial</SmallBadge>
          </div>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Robustez circadiana parcial</h3>
          <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${TONE_CLASS[tone]}`}>
            <span className="font-semibold">Veredito:</span> {result.verdict}
          </p>
        </div>
        <CardScoreBadge label="CRI" value={result.score != null ? result.score.toFixed(0) : '—'} hint={`${Math.round(result.confidence * 100)}% confiança`} />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {result.components.map((component) => (
          <div key={component.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <div className="font-semibold text-slate-700">{component.label}</div>
            <div className="mt-1 text-lg font-bold tracking-[-0.04em] text-slate-950">
              {component.value == null ? '—' : `${formatNumber(component.value, component.unit === '/100' ? 0 : 1)}${component.unit}`}
            </div>
            <div className="mt-1 leading-4 text-slate-500">{component.note}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MovementEfficiencyPanel({ snapshots, forecastStartDate }: SharedPanelProps) {
  const result = useMemo(() => computeMovementEfficiency(snapshots), [snapshots])
  const tone = result.persistentAsymmetryAlert || result.lowSpeedAlert
    ? 'negative'
    : result.score == null
      ? 'neutral'
      : result.score >= 75
        ? 'positive'
        : result.score >= 55
          ? 'watch'
          : 'negative'

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <SmallBadge tone={result.readiness === 'robust' ? 'positive' : result.readiness === 'exploratory' ? 'watch' : 'neutral'}>
                {formatMovementReadiness(result)}
              </SmallBadge>
              {(result.persistentAsymmetryAlert || result.lowSpeedAlert) && <SmallBadge tone="negative">Alerta persistente</SmallBadge>}
            </div>
            <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Movement Efficiency Index</h3>
            <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${TONE_CLASS[tone]}`}>
              <span className="font-semibold">Veredito:</span> {result.verdict}
            </p>
          </div>
          <CardScoreBadge label="MEI" value={result.score != null ? result.score.toFixed(0) : '—'} hint={`${Math.round(result.confidence * 100)}% confiança`} />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          {result.components.map((component) => (
            <div key={component.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="font-semibold text-slate-700">{component.label}</div>
              <div className="mt-1 text-lg font-bold tracking-[-0.04em] text-slate-950">
                {component.value == null ? '—' : `${formatNumber(component.value, component.unit === 'km/h' ? 2 : 1)} ${component.unit}`}
              </div>
              <div className="mt-1 leading-4 text-slate-500">{component.note}</div>
            </div>
          ))}
        </div>
      </div>
      <WalkingVitalityChart snapshots={snapshots} forecastStartDate={forecastStartDate} />
    </div>
  )
}
