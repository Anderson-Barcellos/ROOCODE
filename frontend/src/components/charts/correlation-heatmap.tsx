import { useMemo } from 'react'
import { interpolateRgbBasis } from 'd3'

import type { DailySnapshot } from '@/types/apple-health'
import { applyFdrToCorrelations, correlate, METRIC_LABELS, type MetricKey } from '@/utils/correlations'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { pearson, type CorrelationResult } from '@/utils/statistics'
import { DataReadinessGate } from './shared/DataReadinessGate'
import { MoodDriverBoard } from './mood-driver-board'

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
  lag0: { r: number; qSignificant: boolean; n: number } | null
  lag1: { r: number; qSignificant: boolean; n: number } | null
}

function resultToCell(result: CorrelationResult | null) {
  if (!result) return null
  const q = result.qValueFdr
  return {
    r: result.r,
    n: result.n,
    qSignificant: q != null && Number.isFinite(q) && q < 0.05,
  }
}

export function CorrelationHeatmap({ snapshots, extraMetrics = {} }: CorrelationHeatmapProps) {
  // T9 (2026-05-15): MoodDriverBoard e PKVariabilityHumorLab já filtram
  // interpolated/forecasted antes de correlacionar. Padronizar aqui também
  // pra não inflar r artificialmente em métricas auto-preenchidas (sono).
  // `usableSnapshots` é a base canônica; `extraMetrics.values` é
  // re-alinhado pela mesma máscara de índices.
  const { usableSnapshots, usableExtraMetrics } = useMemo(() => {
    const mask = snapshots.map((s) => !s.forecasted && !s.interpolated)
    const filteredSnapshots = snapshots.filter((_, i) => mask[i])
    const filteredExtras: ExtraMetrics = Object.fromEntries(
      Object.entries(extraMetrics).map(([k, v]) => [
        k,
        { label: v.label, values: v.values.filter((_, i) => mask[i]) },
      ]),
    )
    return { usableSnapshots: filteredSnapshots, usableExtraMetrics: filteredExtras }
  }, [snapshots, extraMetrics])

  const moodValues = useMemo(
    () => usableSnapshots.map((s) => s.mood?.valence ?? null),
    [usableSnapshots],
  )
  const interpolatedCount = useMemo(
    () => snapshots.filter((s) => s.interpolated === true).length,
    [snapshots],
  )

  const rows = useMemo<CellData[]>(() => {
    // Calcular todas as correlações primeiro (sem FDR), depois aplicar BH FDR
    // sobre o conjunto completo (10 métricas × 2 lags + extras). Antes da
    // auditoria 2026-05-15, cada célula exibia '*' por p<0.05 sem corrigir
    // para o número de testes simultâneos — testar muitos pares aumenta a
    // chance de falso positivo significativamente.
    const standardResults = HEATMAP_ROWS.flatMap((key): Array<{
      key: string
      label: string
      slot: 'lag0' | 'lag1'
      result: CorrelationResult | null
    }> => [
      { key, label: METRIC_LABELS[key], slot: 'lag0', result: correlate(usableSnapshots, key, MOOD_KEY, 0) },
      { key, label: METRIC_LABELS[key], slot: 'lag1', result: correlate(usableSnapshots, key, MOOD_KEY, 1) },
    ])
    const extraResults = Object.entries(usableExtraMetrics).map(([key, { label, values }]) => ({
      key,
      label,
      slot: 'lag0' as const,
      result: pearson(values, moodValues),
    }))

    const allResults = [...standardResults, ...extraResults]
    applyFdrToCorrelations(allResults.map((r) => r.result))

    // Reagrupar por key
    const grouped = new Map<string, CellData>()
    for (const item of allResults) {
      if (!grouped.has(item.key)) {
        grouped.set(item.key, { key: item.key, label: item.label, lag0: null, lag1: null })
      }
      const cell = grouped.get(item.key)!
      cell[item.slot] = resultToCell(item.result)
    }

    return Array.from(grouped.values())
  }, [usableSnapshots, usableExtraMetrics, moodValues])

  const hasAnyData = rows.some((r) => r.lag0 || r.lag1)

  // pairCount representativo = mínimo entre todas as rows × lags.
  // Conservador: se QUALQUER métrica tem poucos pares, heatmap sinaliza.
  const minPairCount = useMemo(() => {
    const counts = rows.flatMap((r) =>
      [r.lag0?.n, r.lag1?.n].filter((n): n is number => n != null),
    )
    return counts.length > 0 ? Math.min(...counts) : 0
  }, [rows])

  const readiness = useMemo(
    () =>
      evaluateReadiness(snapshots, CHART_REQUIREMENTS.correlationHeatmap, 'Heatmap', {
        pairCount: minPairCount,
      }),
    [snapshots, minPairCount],
  )

  return (
    <>
      <MoodDriverBoard snapshots={snapshots} />
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Correlações
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Humor vs. fisiologia
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Pearson R. * = q &lt; 0,05 (Benjamini-Hochberg FDR sobre todos os pares testados).
        Lag 0 = mesmo dia, Lag +1 = métrica hoje / humor amanhã.
      </p>
      {interpolatedCount > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <span>⚠</span>
          <span>inclui {interpolatedCount} {interpolatedCount === 1 ? 'dia estimado' : 'dias estimados'} na amostra</span>
        </p>
      )}

      <DataReadinessGate readiness={readiness}>
        {hasAnyData ? (
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
        ) : null}
      </DataReadinessGate>
      </div>
    </>
  )
}

function RCell({ data }: { data: { r: number; qSignificant: boolean; n: number } | null }) {
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
          {data.qSignificant ? '*' : ''}
        </>
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </div>
  )
}
