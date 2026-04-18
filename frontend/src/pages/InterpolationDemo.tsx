/**
 * Interpolation Demo — rota #interpolation-demo
 *
 * Sanidade quantitativa da Fase 5: pega MOCK_SNAPSHOTS (14 dias "ground truth"),
 * injeta 30% de lacunas determinísticas, roda `interpolateLinear`, e compara
 * valores reconstruídos vs originais via R² per field.
 *
 * Objetivo: validar que a interpolação preserva a estrutura do sinal sem
 * distorcer análises downstream (baselines, correlações, weekly patterns).
 *
 * Simplificação deliberada: só testa estratégia 'linear'. Validação da 'claude'
 * exige backend rodando e chamada real ao Gemini — fica pra Fase 5c.
 */
import { useMemo } from 'react'

import { MOCK_SNAPSHOTS } from '@/mocks/snapshotMock'
import type { DailyHealthMetrics, DailySnapshot } from '@/types/apple-health'
import { interpolateLinear } from '@/utils/interpolate'
import { TimelineChart } from '@/components/charts/timeline-chart'
import { buildTimelineSeries } from '@/utils/aggregation'

// ─── Sparsify: remove 30% dos dias de forma determinística ────────────────────
// Usa índice % 3 !== 0 pra pegar 2 a cada 3 dias (≈67% retenção).
// Dias removidos ficam como snapshot placeholder com health/mood null.
function sparsify(snapshots: DailySnapshot[], keepEvery = 3): DailySnapshot[] {
  return snapshots.map((s, i) => {
    // Mantém primeiro, último, e a cada `keepEvery` index
    const keep = i === 0 || i === snapshots.length - 1 || i % keepEvery === 0
    if (keep) return s
    // Dia "removido": placeholder null pra interpolateLinear enxergar como lacuna
    return { date: s.date, health: null, mood: null, medications: null }
  })
}

// R² = 1 - SS_res / SS_tot
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

// Campos a validar (os 5 que o Gemini preenche + outros de interesse)
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

export function InterpolationDemo() {
  const { sparse, reconstructed, metrics } = useMemo(() => {
    const sparse = sparsify(MOCK_SNAPSHOTS, 3)
    const reconstructed = interpolateLinear(sparse)

    // Computa R² per field usando APENAS os dias que foram removidos+reconstruídos
    const originalByDate = new Map(MOCK_SNAPSHOTS.map((s) => [s.date, s]))
    const sparseByDate = new Map(sparse.map((s) => [s.date, s]))

    // Dias "de teste" = removidos no sparse mas com health original disponível
    const testDays = reconstructed.filter((s) => {
      const originalHasData = originalByDate.get(s.date)?.health != null
      const sparseIsNull = sparseByDate.get(s.date)?.health == null
      return originalHasData && sparseIsNull && s.health != null
    })

    const metrics = FIELDS_TO_VALIDATE.map((field) => {
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

    return { sparse, reconstructed, metrics, testDays }
  }, [])

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
    movementMinutes: 'Movimento',
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
          Interpolation Demo — R² Linear
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          MOCK_SNAPSHOTS tem 14 dias completos (ground truth). Aqui removemos cada 3º dia
          (retendo {retainedPct}%) e rodamos <code>interpolateLinear</code> pra reconstruir.
          O R² mede quanto a linear recuperou da variância original —{' '}
          <strong>{interpolatedDays} dias reconstruídos</strong> no total.
        </p>
      </header>

      {/* Tabela de métricas */}
      <section className="mb-6 rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <h2 className="font-serif text-xl text-slate-900">Métricas per field</h2>
        <p className="mt-1 text-xs text-slate-500">
          R² &gt; 0.7 = boa reconstrução · 0.4-0.7 = aceitável · &lt; 0.4 = ruim.
          MAE em unidades originais do campo.
        </p>
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
      </section>

      {/* Charts side-by-side */}
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
        Abra <code>#charts-demo</code> pra ver todos os 14 charts alimentados pelo MOCK_SNAPSHOTS,
        ou volte pro dashboard principal pra ver dados reais.
      </p>
    </div>
  )
}
