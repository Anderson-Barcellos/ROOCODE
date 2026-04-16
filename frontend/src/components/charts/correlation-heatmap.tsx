import { useMemo } from 'react'
import { interpolateRgbBasis } from 'd3'

import type { DailySnapshot } from '@/types/apple-health'
import { correlate, METRIC_LABELS, type MetricKey } from '@/utils/correlations'
import { pearson } from '@/utils/statistics'

type ExtraMetrics = Record<string, { label: string; values: Array<number | null> }>

interface CorrelationHeatmapProps {
  snapshots: DailySnapshot[]
  extraMetrics?: ExtraMetrics
}

const MOOD_KEY: MetricKey = 'valence'

const HEATMAP_ROWS: MetricKey[] = [
  'sleepTotalHours',
  'sleepDeepHours',
  'sleepRemHours',
  'sleepEfficiencyPct',
  'hrvSdnn',
  'restingHeartRate',
  'spo2',
  'activeEnergyKcal',
  'exerciseMinutes',
  'daylightMinutes',
  'pulseTemperatureC',
]

// vermelho → neutro/bege → verde
const interpolateCorrelation = interpolateRgbBasis(['#b91c1c', '#f5ece0', '#15803d'])

function colorForR(r: number | null): string {
  if (r == null) return 'rgba(71, 85, 105, 0.08)'
  // mapear -1..+1 → 0..1
  return interpolateCorrelation((r + 1) / 2)
}

function textColorForR(r: number | null): string {
  if (r == null) return '#94a3b8'
  return Math.abs(r) > 0.3 ? '#fff' : '#334155'
}

interface CellData {
  key: string
  label: string
  lag0: { r: number; significant: boolean; n: number } | null
  lag1: { r: number; significant: boolean; n: number } | null
}

function pearsonToCell(result: ReturnType<typeof pearson>) {
  if (!result) return null
  return { r: result.r, significant: result.significant, n: result.n }
}

export function CorrelationHeatmap({ snapshots, extraMetrics = {} }: CorrelationHeatmapProps) {
  const moodValues = useMemo(
    () => snapshots.map((s) => s.mood?.valence ?? null),
    [snapshots],
  )

  const rows = useMemo<CellData[]>(() => {
    const standard = HEATMAP_ROWS.map((key) => {
      const r0 = correlate(snapshots, key, MOOD_KEY, 0)
      const r1 = correlate(snapshots, key, MOOD_KEY, 1)
      return {
        key,
        label: METRIC_LABELS[key],
        lag0: r0 ? { r: r0.r, significant: r0.significant, n: r0.n } : null,
        lag1: r1 ? { r: r1.r, significant: r1.significant, n: r1.n } : null,
      }
    })

    const extra = Object.entries(extraMetrics).map(([key, { label, values }]) => {
      const r0 = pearsonToCell(pearson(values, moodValues))
      return { key, label, lag0: r0, lag1: null }
    })

    return [...standard, ...extra]
  }, [snapshots, extraMetrics, moodValues])

  const hasAnyData = rows.some((r) => r.lag0 || r.lag1)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Correlações
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Humor vs. fisiologia
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Pearson R. * = p &lt; 0,05. Lag 0 = mesmo dia, Lag +1 = métrica hoje / humor amanhã.
      </p>

      {!hasAnyData ? (
        <p className="mt-6 text-sm text-slate-400">
          Dados de humor insuficientes para calcular correlações (mín. 10 pares).
        </p>
      ) : (
        <div className="mt-4">
          <div className="mb-2 grid grid-cols-[1fr_80px_80px] gap-2 px-1">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Métrica</span>
            <span className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Lag 0</span>
            <span className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Lag +1</span>
          </div>

          <div className="space-y-1.5">
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_80px_80px] items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-700">{row.label}</span>
                <RCell data={row.lag0} />
                <RCell data={row.lag1} />
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="text-xs text-slate-400">Negativo</span>
            <div className="h-2 flex-1 rounded-full" style={{
              background: 'linear-gradient(to right, #b91c1c, #f5ece0, #15803d)'
            }} />
            <span className="text-xs text-slate-400">Positivo</span>
          </div>
        </div>
      )}
    </div>
  )
}

function RCell({ data }: { data: { r: number; significant: boolean; n: number } | null }) {
  return (
    <div
      className="flex h-9 items-center justify-center rounded-xl text-xs font-bold transition-transform hover:scale-105"
      style={{
        backgroundColor: colorForR(data?.r ?? null),
        color: textColorForR(data?.r ?? null),
      }}
      title={data ? `R = ${data.r.toFixed(3)}, N = ${data.n}` : 'Dados insuficientes'}
    >
      {data ? (
        <>
          {data.r.toFixed(2)}
          {data.significant ? '*' : ''}
        </>
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </div>
  )
}
