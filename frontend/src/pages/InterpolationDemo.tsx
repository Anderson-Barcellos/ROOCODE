/**
 * Interpolation Demo — rota #interpolation-demo
 *
 * Sanidade quantitativa da Fase 5: pega MOCK_SNAPSHOTS (14 dias "ground truth"),
 * injeta 30% de lacunas determinísticas, roda `interpolateLinear` (frontend) e
 * também `strategy: 'claude'` (backend + Gemini), comparando valores
 * reconstruídos vs originais via R² per field.
 *
 * Objetivo: validar que a interpolação preserva a estrutura do sinal sem
 * distorcer análises downstream (baselines, correlações, weekly patterns).
 */
import { useMemo, useState } from 'react'

import { MOCK_SNAPSHOTS } from '@/mocks/snapshotMock'
import type { DailyHealthMetrics, DailySnapshot } from '@/types/apple-health'
import { interpolateLinear } from '@/utils/interpolate'
import { TimelineChart } from '@/components/charts/timeline-chart'
import { buildTimelineSeries } from '@/utils/aggregation'

// Esparsifica dias pra simular lacunas (mantém primeiro, último, e cada 3º).
function sparsify(snapshots: DailySnapshot[], keepEvery = 3): DailySnapshot[] {
  return snapshots.map((s, i) => {
    const keep = i === 0 || i === snapshots.length - 1 || i % keepEvery === 0
    if (keep) return s
    return { date: s.date, health: null, mood: null, medications: null }
  })
}

function r2(actual: number[], predicted: number[]): number | null {
  if (actual.length < 2 || actual.length !== predicted.length) return null
  const mean = actual.reduce((a, b) => a + b, 0) / actual.length
  const ssRes = actual.reduce((s, a, i) => s + (a - predicted[i]) ** 2, 0)
  const ssTot = actual.reduce((s, a) => s + (a - mean) ** 2, 0)
  if (ssTot === 0) return null
  return 1 - ssRes / ssTot
}

function meanAbsError(actual: number[], predicted: number[]): number | null {
  if (actual.length === 0) return null
  return actual.reduce((s, a, i) => s + Math.abs(a - predicted[i]), 0) / actual.length
}

const FIELDS_TO_VALIDATE: Array<keyof DailyHealthMetrics> = [
  'sleepTotalHours',
  'hrvSdnn',
  'restingHeartRate',
  'activeEnergyKcal',
  'exerciseMinutes',
  'spo2',
  'daylightMinutes',
]

const FIELD_LABELS: Partial<Record<keyof DailyHealthMetrics, string>> = {
  sleepTotalHours: 'Sono total (h)',
  hrvSdnn: 'HRV SDNN (ms)',
  restingHeartRate: 'FC repouso (bpm)',
  activeEnergyKcal: 'Energia ativa (kcal)',
  exerciseMinutes: 'Exercício (min)',
  spo2: 'SpO₂ (%)',
  daylightMinutes: 'Luz do dia (min)',
}

interface FieldMetric {
  field: keyof DailyHealthMetrics
  label: string
  n: number
  r2: number | null
  mae: number | null
}

function computeMetrics(
  reconstructed: DailySnapshot[],
  originalByDate: Map<string, DailySnapshot>,
  sparseByDate: Map<string, DailySnapshot>,
): FieldMetric[] {
  const testDays = reconstructed.filter((s) => {
    const originalHasData = originalByDate.get(s.date)?.health != null
    const sparseIsNull = sparseByDate.get(s.date)?.health == null
    return originalHasData && sparseIsNull && s.health != null
  })

  return FIELDS_TO_VALIDATE.map((field) => {
    const actual: number[] = []
    const predicted: number[] = []
    for (const day of testDays) {
      const actualVal = originalByDate.get(day.date)?.health?.[field]
      const predictedVal = day.health?.[field]
      if (typeof actualVal === 'number' && typeof predictedVal === 'number') {
        actual.push(actualVal)
        predicted.push(predictedVal)
      }
    }
    return {
      field,
      label: FIELD_LABELS[field] ?? String(field),
      n: actual.length,
      r2: r2(actual, predicted),
      mae: meanAbsError(actual, predicted),
    }
  })
}

interface ClaudeResponse {
  snapshots: DailySnapshot[]
  meta: { cached: boolean; error: string | null; filled_dates: string[] }
}

type ClaudeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; metrics: FieldMetric[]; filledCount: number; cached: boolean }
  | { status: 'error'; message: string }

export function InterpolationDemo() {
  const { sparse, reconstructed, metrics, originalByDate, sparseByDate } = useMemo(() => {
    const sparse = sparsify(MOCK_SNAPSHOTS, 3)
    const reconstructed = interpolateLinear(sparse)
    const originalByDate = new Map(MOCK_SNAPSHOTS.map((s) => [s.date, s]))
    const sparseByDate = new Map(sparse.map((s) => [s.date, s]))
    const metrics = computeMetrics(reconstructed, originalByDate, sparseByDate)
    return { sparse, reconstructed, metrics, originalByDate, sparseByDate }
  }, [])

  const [claude, setClaude] = useState<ClaudeState>({ status: 'idle' })

  async function validateClaude() {
    setClaude({ status: 'loading' })
    try {
      const realSnapshots = sparse.filter((s) => s.health != null)
      const res = await fetch('/health/api/interpolate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshots: realSnapshots, strategy: 'claude' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as ClaudeResponse
      if (body.meta.error) throw new Error(body.meta.error)
      const claudeMetrics = computeMetrics(body.snapshots, originalByDate, sparseByDate)
      setClaude({
        status: 'success',
        metrics: claudeMetrics,
        filledCount: body.meta.filled_dates.length,
        cached: body.meta.cached,
      })
    } catch (exc) {
      setClaude({ status: 'error', message: exc instanceof Error ? exc.message : String(exc) })
    }
  }

  const originalSeries = useMemo(
    () => buildTimelineSeries(MOCK_SNAPSHOTS, ['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']),
    [],
  )
  const reconstructedSeries = useMemo(
    () => buildTimelineSeries(reconstructed, ['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']),
    [reconstructed],
  )
  const sparseSeries = useMemo(
    () => buildTimelineSeries(sparse, ['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']),
    [sparse],
  )

  const timelineLabels = {
    sleepTotalHours: 'Sono (h)',
    hrvSdnn: 'HRV (ms)',
    restingHeartRate: 'FC Repouso (bpm)',
    spo2: 'SpO₂',
    activeEnergyKcal: 'Energia Ativa',
    exerciseMinutes: 'Exercício',
    standingMinutes: 'Em Pé',
    daylightMinutes: 'Luz Natural',
    sleepEfficiencyPct: 'Eficiência Sono',
    valence: 'Humor',
  } as const

  const retainedPct = Math.round((sparse.filter((s) => s.health != null).length / sparse.length) * 100)
  const interpolatedDays = reconstructed.filter((s) => s.interpolated).length

  return (
    <div className="app-shell">
      <header className="mb-6">
        <span className="eyebrow">Validação Fase 5</span>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-slate-900">
          Interpolation Demo — R² Linear vs Claude
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          MOCK_SNAPSHOTS tem 14 dias completos (ground truth). Aqui removemos cada 3º dia
          (retendo {retainedPct}%) e reconstruímos via duas estratégias. O R² mede quanto
          cada uma recuperou da variância original — <strong>{interpolatedDays} dias reconstruídos</strong> pela linear.
        </p>
      </header>

      {/* Tabelas de métricas lado a lado */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <MetricsCard
          title="Linear (frontend)"
          subtitle="interpolateLinear() · média ponderada entre vizinhos · O(n) sync"
          metrics={metrics}
        />
        <ClaudeMetricsCard
          state={claude}
          onValidate={validateClaude}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-1">
        <section>
          <h2 className="mb-2 font-serif text-lg text-slate-900">Original (ground truth)</h2>
          <TimelineChart
            data={originalSeries}
            seriesKeys={['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']}
            labels={timelineLabels}
          />
        </section>

        <section>
          <h2 className="mb-2 font-serif text-lg text-slate-900">Esparso (com lacunas injetadas)</h2>
          <TimelineChart
            data={sparseSeries}
            seriesKeys={['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']}
            labels={timelineLabels}
          />
        </section>

        <section>
          <h2 className="mb-2 font-serif text-lg text-slate-900">
            Reconstruído (linear · {interpolatedDays} dias estimados em tracejado)
          </h2>
          <TimelineChart
            data={reconstructedSeries}
            seriesKeys={['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']}
            labels={timelineLabels}
          />
        </section>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Volte pro dashboard principal pra ver dados reais.
      </p>
    </div>
  )
}

// ─── Subcomponentes locais ───────────────────────────────────────────────────

function MetricsCard({
  title,
  subtitle,
  metrics,
  footer,
}: {
  title: string
  subtitle: string
  metrics: FieldMetric[]
  footer?: React.ReactNode
}) {
  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <h2 className="font-serif text-xl text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="pb-2 font-semibold">Campo</th>
            <th className="pb-2 text-right font-semibold">N</th>
            <th className="pb-2 text-right font-semibold">R²</th>
            <th className="pb-2 text-right font-semibold">MAE</th>
            <th className="pb-2 pl-4 font-semibold">Qualidade</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(({ field, label, n, r2: r2Val, mae }) => {
            const quality =
              r2Val == null
                ? { label: '—', color: 'text-slate-400' }
                : r2Val > 0.7
                ? { label: 'Boa', color: 'text-emerald-700' }
                : r2Val > 0.4
                ? { label: 'Aceitável', color: 'text-amber-700' }
                : { label: 'Ruim', color: 'text-rose-700' }
            return (
              <tr key={String(field)} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 font-medium text-slate-700">{label}</td>
                <td className="py-2 text-right font-mono text-slate-600">{n}</td>
                <td className="py-2 text-right font-mono text-slate-900">
                  {r2Val == null ? '—' : r2Val.toFixed(3)}
                </td>
                <td className="py-2 text-right font-mono text-slate-600">
                  {mae == null ? '—' : mae.toFixed(2)}
                </td>
                <td className={`py-2 pl-4 text-xs font-semibold ${quality.color}`}>{quality.label}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {footer}
    </section>
  )
}

function ClaudeMetricsCard({
  state,
  onValidate,
}: {
  state: ClaudeState
  onValidate: () => void
}) {
  if (state.status === 'idle') {
    return (
      <section className="flex flex-col items-start justify-center rounded-[1.5rem] border border-dashed border-slate-900/20 bg-white/50 p-5 shadow-none">
        <h2 className="font-serif text-xl text-slate-900">Claude (Gemini)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Estratégia 'claude' via POST /health/api/interpolate. Requer backend ativo na porta 8011.
        </p>
        <button
          onClick={onValidate}
          className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Validar Claude (requer backend)
        </button>
      </section>
    )
  }

  if (state.status === 'loading') {
    return (
      <section className="flex flex-col items-start justify-center rounded-[1.5rem] border border-slate-900/10 bg-white/50 p-5">
        <h2 className="font-serif text-xl text-slate-900">Claude (Gemini)</h2>
        <p className="mt-3 animate-pulse text-sm text-slate-600">
          Chamando Gemini 2.5 Flash… pode levar 10-30s dependendo do tamanho do payload.
        </p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="rounded-[1.5rem] border border-rose-200 bg-rose-50/60 p-5">
        <h2 className="font-serif text-xl text-rose-900">Claude (erro)</h2>
        <p className="mt-2 text-sm text-rose-800">{state.message}</p>
        <button
          onClick={onValidate}
          className="mt-3 rounded-full border border-rose-300 bg-white px-4 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          Tentar novamente
        </button>
      </section>
    )
  }

  return (
    <MetricsCard
      title="Claude (Gemini)"
      subtitle={`gemini-2.5-flash · ${state.filledCount} dias preenchidos${state.cached ? ' · cached' : ''}`}
      metrics={state.metrics}
      footer={
        <button
          onClick={onValidate}
          className="mt-3 text-xs font-semibold text-slate-500 underline decoration-dotted hover:text-slate-700"
        >
          Revalidar
        </button>
      }
    />
  )
}
