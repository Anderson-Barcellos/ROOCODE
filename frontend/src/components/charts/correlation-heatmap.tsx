import { useMemo, useState } from 'react'
import { interpolateRgbBasis } from 'd3'

import type { DailySnapshot } from '@/types/apple-health'
import { applyFdrToCorrelations, correlate, METRIC_LABELS, type MetricKey } from '@/utils/correlations'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { pearson, type CorrelationResult } from '@/utils/statistics'
import { DataReadinessGate } from './shared/DataReadinessGate'

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
  lag0: RCellData | null
  lag1: RCellData | null
}

interface RCellData {
  r: number
  pValue: number
  qValueFdr: number | null | undefined
  qSignificant: boolean
  n: number
}

interface SelectedHeatmapCell {
  key: string
  label: string
  detail: string
}

function resultToCell(result: CorrelationResult | null) {
  if (!result) return null
  const q = result.qValueFdr
  return {
    r: result.r,
    pValue: result.pValue,
    qValueFdr: q,
    n: result.n,
    qSignificant: q != null && Number.isFinite(q) && q < 0.05,
  }
}

function formatP(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value < 0.001) return '<0.001'
  if (value < 0.01) return value.toFixed(3)
  return value.toFixed(2)
}

export function CorrelationHeatmap({ snapshots, extraMetrics = {} }: CorrelationHeatmapProps) {
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState<SelectedHeatmapCell | null>(null)
  // Filtra interpolated/forecasted antes de correlacionar pra não inflar r
  // artificialmente em métricas auto-preenchidas (sono). `usableSnapshots` é
  // a base canônica; `extraMetrics.values` é re-alinhado pela mesma máscara.
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
  const { interpolatedCount, forecastedCount } = useMemo(
    () => ({
      interpolatedCount: snapshots.filter((s) => s.interpolated === true).length,
      forecastedCount: snapshots.filter((s) => s.forecasted === true).length,
    }),
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
  const { strongestPositive, strongestNegative } = useMemo(() => {
    const cells = rows.flatMap((row) => [
      row.lag0 ? { label: row.label, lag: 'lag 0', data: row.lag0 } : null,
      row.lag1 ? { label: row.label, lag: 'lag +1', data: row.lag1 } : null,
    ]).filter((item): item is { label: string; lag: string; data: RCellData } => item != null)
    return {
      strongestPositive: cells
        .filter((cell) => cell.data.r > 0)
        .sort((a, b) => b.data.r - a.data.r)[0] ?? null,
      strongestNegative: cells
        .filter((cell) => cell.data.r < 0)
        .sort((a, b) => a.data.r - b.data.r)[0] ?? null,
    }
  }, [rows])

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
      {(interpolatedCount > 0 || forecastedCount > 0) && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <span>⚠</span>
          <span>
            excluiu {interpolatedCount} {interpolatedCount === 1 ? 'dia interpolado' : 'dias interpolados'} e {forecastedCount}{' '}
            {forecastedCount === 1 ? 'dia projetado' : 'dias projetados'} da amostra
          </span>
        </p>
      )}

      <DataReadinessGate readiness={readiness}>
        {hasAnyData ? (
          <div className="mt-4">
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Leitura clínica rápida</p>
              <p className="mt-1">
                Verde significa que valores maiores daquela métrica acompanharam valência mais alta; vermelho
                significa valência mais baixa. Isso descreve associação, não causa.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-white/80 px-3 py-2">
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-teal-700">
                    Maior associação positiva
                  </span>
                  <span className="mt-1 block font-medium text-slate-800">
                    {strongestPositive
                      ? `${strongestPositive.label} · ${strongestPositive.lag} · r ${strongestPositive.data.r.toFixed(2)}`
                      : 'Sem associação positiva calculável'}
                  </span>
                </div>
                <div className="rounded-lg bg-white/80 px-3 py-2">
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-red-600">
                    Maior associação negativa
                  </span>
                  <span className="mt-1 block font-medium text-slate-800">
                    {strongestNegative
                      ? `${strongestNegative.label} · ${strongestNegative.lag} · r ${strongestNegative.data.r.toFixed(2)}`
                      : 'Sem associação negativa calculável'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-[1fr_80px_80px] gap-2 px-1">
              <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Métrica</span>
              <span className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Lag 0</span>
              <span className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Lag +1</span>
            </div>

            <div className="space-y-1.5">
              {rows.map((row) => (
                <div key={row.key} className="grid grid-cols-[1fr_80px_80px] items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-700">{row.label}</span>
                  <RCell
                    data={row.lag0}
                    label={`${row.label} · lag 0`}
                    selected={selectedHeatmapCell?.key === `${row.key}-lag0`}
                    onSelect={(detail) => setSelectedHeatmapCell({
                      key: `${row.key}-lag0`,
                      label: `${row.label} · lag 0`,
                      detail,
                    })}
                  />
                  <RCell
                    data={row.lag1}
                    label={`${row.label} · lag +1`}
                    selected={selectedHeatmapCell?.key === `${row.key}-lag1`}
                    onSelect={(detail) => setSelectedHeatmapCell({
                      key: `${row.key}-lag1`,
                      label: `${row.label} · lag +1`,
                      detail,
                    })}
                  />
                </div>
              ))}
            </div>

            {selectedHeatmapCell && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-xs leading-5 text-slate-600">
                <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Detalhe selecionado</p>
                <p className="mt-1 font-semibold text-slate-800">{selectedHeatmapCell.label}</p>
                <p>{selectedHeatmapCell.detail}</p>
              </div>
            )}

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
  )
}

function RCell({
  data,
  label,
  selected,
  onSelect,
}: {
  data: RCellData | null
  label: string
  selected: boolean
  onSelect: (detail: string) => void
}) {
  const detail = data
    ? `r ${data.r.toFixed(3)} · p ${formatP(data.pValue)} · q ${formatP(data.qValueFdr)} · n ${data.n}`
    : 'Dados insuficientes'
  if (!data) {
    return (
      <div
        className="flex h-9 items-center justify-center rounded-xl text-xs font-bold text-slate-300"
        style={{ backgroundColor: colorForR(null) }}
      >
        —
      </div>
    )
  }
  return (
    <button
      type="button"
      className={`flex h-9 items-center justify-center rounded-xl text-xs font-bold transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 ${
        selected ? 'ring-2 ring-slate-900/35 ring-offset-1' : ''
      }`}
      style={{
        backgroundColor: colorForR(data.r),
        color: textColorForR(data.r),
      }}
      aria-label={`${label}: ${detail}`}
      aria-pressed={selected}
      onClick={() => onSelect(detail)}
    >
      {data.r.toFixed(2)}
      {data.qSignificant ? '*' : ''}
    </button>
  )
}
