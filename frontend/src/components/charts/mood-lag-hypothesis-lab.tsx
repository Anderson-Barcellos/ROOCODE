import { useMemo, useState } from 'react'
import { FlaskConical } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  MOOD_LAG_METRICS,
  buildMoodLagHypothesis,
  type MetricKey,
  type MoodLagQuality,
} from '@/utils/correlations'

const QUALITY_LABEL: Record<MoodLagQuality, string> = {
  insufficient: 'dados insuficientes',
  partial: 'parcial',
  observable: 'observavel',
}

const QUALITY_CLASS: Record<MoodLagQuality, string> = {
  insufficient: 'border-slate-200 bg-slate-50 text-slate-500',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  observable: 'border-teal-200 bg-teal-50 text-teal-800',
}

function formatNumber(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function formatSigned(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatNumber(value, 2)}`
}

function describeBestLag(bestLagDays: number | null, n: number): string {
  if (bestLagDays == null) {
    return `precisa >=10 pares por lag; melhor lag ainda indisponivel. Humor pareado: ${n} dia${n === 1 ? '' : 's'}.`
  }
  if (bestLagDays === 0) return 'melhor sinal no mesmo dia; trate como associacao exploratoria.'
  return `melhor sinal em +${bestLagDays}d; metrica antes do humor, ainda sem causalidade clinica.`
}

export function MoodLagHypothesisLab({ snapshots }: { snapshots: DailySnapshot[] }) {
  const [metricKey, setMetricKey] = useState<MetricKey>('sleepTotalHours')
  const hypothesis = useMemo(
    () => buildMoodLagHypothesis(snapshots, metricKey),
    [snapshots, metricKey],
  )
  const bestRow = hypothesis.rows.find((row) => row.lagDays === hypothesis.bestLagDays)

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Lag & Hypothesis Lab
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Metrica hoje, humor depois
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Compara uma metrica contra humor em lags 0-3d, com n e qualidade do sinal. Acima/abaixo usa a media pessoal da propria metrica.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          <FlaskConical className="h-3.5 w-3.5" />
          humor pareado: {hypothesis.realMoodDays}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {MOOD_LAG_METRICS.map((metric) => (
          <button
            key={metric.key}
            type="button"
            onClick={() => setMetricKey(metric.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              metricKey === metric.key
                ? 'bg-violet-700 text-white'
                : 'border border-slate-900/10 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {metric.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-900/10 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                <th className="py-2 pr-3">Lag</th>
                <th className="px-3 py-2">R</th>
                <th className="px-3 py-2">n</th>
                <th className="px-3 py-2">Qualidade</th>
                <th className="px-3 py-2">Humor acima</th>
                <th className="px-3 py-2">Humor abaixo</th>
                <th className="py-2 pl-3">Delta</th>
              </tr>
            </thead>
            <tbody>
              {hypothesis.rows.map((row) => (
                <tr key={row.lagDays} className="border-b border-slate-900/5 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">
                    {row.lagDays === 0 ? '0d' : `+${row.lagDays}d`}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">
                    {row.result ? row.result.r.toFixed(3) : 'sem dado'}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.n}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-bold ${QUALITY_CLASS[row.quality]}`}>
                      {QUALITY_LABEL[row.quality]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatNumber(row.aboveMeanMood)}</td>
                  <td className="px-3 py-2 text-slate-500">{formatNumber(row.belowMeanMood)}</td>
                  <td className="py-2 pl-3 font-mono text-xs font-semibold text-slate-700">
                    {formatSigned(row.moodDelta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-slate-900/10 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Hipotese selecionada
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {hypothesis.label} {hypothesis.unit ? `(${hypothesis.unit})` : ''}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {describeBestLag(hypothesis.bestLagDays, hypothesis.realMoodDays)}
          </p>
          <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-700">Sampling bias:</span> humor do State of Mind tende a aparecer quando a emocao chama atencao; r alto com n baixo continua so hipotese.
          </div>
          {bestRow?.result && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-lg bg-white/80 p-2 text-slate-500">
                R <strong className="block font-mono text-slate-800">{bestRow.result.r.toFixed(3)}</strong>
              </span>
              <span className="rounded-lg bg-white/80 p-2 text-slate-500">
                n <strong className="block font-mono text-slate-800">{bestRow.n}</strong>
              </span>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
