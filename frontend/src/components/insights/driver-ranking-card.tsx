import { Line, LineChart, ReferenceLine, ResponsiveContainer } from 'recharts'

import type { RankedDriver } from '@/utils/driver-ranking'
import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'
import { DRIVER_ICON_MAP } from './driver-icons'

interface Props {
  driver: RankedDriver
  expanded: boolean
  onToggle: () => void
}

const toneClass: Record<RankedDriver['tone'], string> = {
  positive: 'border-teal-200 bg-teal-50/80 text-teal-900',
  watch: 'border-amber-200 bg-amber-50/80 text-amber-900',
  neutral: 'border-slate-200 bg-white/85 text-slate-800',
}

function fmt(value: number | null, precision: number, unit: string): string {
  if (value == null) return 'sem dado'
  const num = value.toLocaleString('pt-BR', {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
  })
  return unit ? `${num} ${unit}` : num
}

export function DriverRankingCard({ driver, expanded, onToggle }: Props) {
  const Icon = DRIVER_ICON_MAP[driver.iconName]
  const isDim = driver.state === 'dim'
  const baseClass = isDim ? 'border-slate-200 bg-slate-100/60 text-slate-500' : toneClass[driver.tone]
  const sparkData = driver.sparkline14d
    .filter((p) => p.value != null)
    .map((p) => ({ date: p.date, value: p.value as number }))

  return (
    <article className={`rounded-xl border p-4 transition ${baseClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 text-slate-700">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{driver.title}</h4>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {driver.label}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${isDim ? 'bg-slate-200 text-slate-600' : 'bg-white/70 text-slate-500'}`}
        >
          n={driver.pairCount}
          {isDim ? ' (insuf.)' : ''}
        </span>
      </div>

      <div className="mt-4">
        <p className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-950">
          {fmt(driver.recentValue, driver.precision, driver.unit)}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          baseline {fmt(driver.baselineValue, driver.precision, driver.unit)}
        </p>
      </div>

      {sparkData.length >= 2 && (
        <div className="mt-3 h-12">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
            initialDimension={{ width: 1, height: 1 }}
          >
            <LineChart data={sparkData}>
              {driver.baselineValue != null && (
                <ReferenceLine
                  y={driver.baselineValue}
                  stroke={CHART_TOKENS.reference.meanText}
                  strokeDasharray="3 3"
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={isDim ? CHART_TOKENS.ui.axis : CHART_TOKENS.series.composite}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 inline-flex items-center rounded-md border border-slate-900/10 bg-white/70 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-600 hover:bg-white"
      >
        {expanded ? 'Fechar' : 'Detalhes'}
      </button>
    </article>
  )
}
