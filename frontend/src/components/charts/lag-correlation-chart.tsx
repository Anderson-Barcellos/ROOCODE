import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useDoses, useMood, useSubstances } from '@/lib/api'
import type { MoodRecord } from '@/lib/api'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import {
  buildMoodEvents,
  computeLagCorrelation,
  type IntradayCorrelationMethod,
  normalizeIntradayValence,
  substanceToPKMedication,
  toPKDoses,
  type MoodEvent,
} from '@/utils/intraday-correlation'

function normalizeMoodRecords(rows: MoodRecord[]): MoodEvent[] {
  const entries = rows.map((r) => ({
    start: r.Iniciar,
    end: null,
    type: r.Fim ?? null,
    labels: [],
    associations: [],
    valence: normalizeIntradayValence(r.Associações),
    valenceClass: r.Valência ?? null,
  }))
  return buildMoodEvents(entries)
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
  background: 'rgba(255,252,246,0.97)',
}

// Lags de -6h até +12h — negativo testa se concentração FUTURA correlaciona (controle de causalidade)
const LAGS = [-6, -4, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8, 10, 12]
const METHOD_OPTIONS: IntradayCorrelationMethod[] = ['pearson', 'spearman']
const FDR_SIGNIFICANCE_THRESHOLD = 0.05

function formatPValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  if (value < 0.001) return '<0.001'
  return value.toFixed(3)
}

function formatCi95(lower: number | null, upper: number | null): string {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) {
    return 'sem dado'
  }
  return `[${lower.toFixed(2)}, ${upper.toFixed(2)}]`
}

function renderLagDot(props: { cx?: number; cy?: number; payload?: { qValueFdr?: number | null } }) {
  const { cx, cy, payload } = props
  if (typeof cx !== 'number' || typeof cy !== 'number') return null
  const q = payload?.qValueFdr
  const isSignificant = typeof q === 'number' && Number.isFinite(q) && q < FDR_SIGNIFICANCE_THRESHOLD

  return (
    <circle
      cx={cx}
      cy={cy}
      r={isSignificant ? 4.5 : 3}
      fill={isSignificant ? '#d97706' : '#0f766e'}
      stroke="#fff"
      strokeWidth={1}
    />
  )
}

export function LagCorrelationChart() {
  const { data: substances = [] } = useSubstances()
  const { data: allDoses = [] } = useDoses(30 * 24)
  const { data: moodRows = [] } = useMood()
  const [selectedMedId, setSelectedMedId] = useState<string>('lexapro')
  const [correlationMethod, setCorrelationMethod] = useState<IntradayCorrelationMethod>('pearson')

  const events = useMemo(() => normalizeMoodRecords(moodRows), [moodRows])

  const selectedSub = substances.find((s) => s.id === selectedMedId)
  const med = selectedSub ? substanceToPKMedication(selectedSub) : null

  const { data, bestLag, bestStats, readinessPairCount } = (() => {
    if (!med || events.length === 0) {
      return {
        data: [],
        bestLag: null as number | null,
        bestStats: null as null | { r: number; n: number; pValuePermutation: number | null; ci95Lower: number | null; ci95Upper: number | null; qValueFdr: number | null },
        readinessPairCount: 0,
      }
    }
    const dosesForMed = allDoses.filter((d) => d.substance === med.id)
    const pkDoses = toPKDoses(dosesForMed)
    const correlations = computeLagCorrelation(events, med, pkDoses, LAGS, 91, {
      method: correlationMethod,
      permutationIterations: 600,
      bootstrapIterations: 600,
    })
    const data = correlations.map((c) => ({
      lag: c.lagHours,
      r: Number.isFinite(c.r) ? c.r : null,
      n: c.n,
      pValuePermutation: c.pValuePermutation,
      ci95Lower: c.ci95Lower,
      ci95Upper: c.ci95Upper,
      qValueFdr: c.qValueFdr,
    }))
    // Best lag = peak de |r| entre lags >= 0 (causais)
    const causalLags = correlations.filter((c) => c.lagHours >= 0)
    const causalWithSignal = causalLags.filter((c) => Number.isFinite(c.r) && c.n >= 3)
    const bestLag = causalWithSignal.length
      ? causalWithSignal.reduce((best, cur) => (Math.abs(cur.r) > Math.abs(best.r) ? cur : best)).lagHours
      : null
    const bestStats = bestLag == null ? null : causalWithSignal.find((row) => row.lagHours === bestLag) ?? null
    const readinessPairCount = causalLags.length > 0 ? Math.min(...causalLags.map((c) => c.n)) : 0
    return { data, bestLag, bestStats, readinessPairCount }
  })()

  const readiness = evaluateReadiness([], CHART_REQUIREMENTS.lagCorrelation, 'Análise de lag', {
    pairCount: readinessPairCount,
  })

  const significantLagCount = data.filter((row) => {
    return typeof row.qValueFdr === 'number' && Number.isFinite(row.qValueFdr) && row.qValueFdr < FDR_SIGNIFICANCE_THRESHOLD
  }).length

  const availableMeds = substances
    .map((s) => substanceToPKMedication(s))
    .filter((m): m is NonNullable<ReturnType<typeof substanceToPKMedication>> => m !== null)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Exploratório · Lag analysis
      </span>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Correlação PK×humor por lag horário
        </h3>
        {bestLag != null && (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            pico em {bestLag > 0 ? `+${bestLag}h` : `${bestLag}h`}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Pra cada lag, {correlationMethod === 'pearson' ? 'Pearson r' : 'Spearman ρ'} entre concentração em <code className="text-xs">t−lag</code> e valência em <code className="text-xs">t</code>. Lags positivos testam causalidade (concentração antes do humor); lags negativos servem de controle — se o pico estiver em lag negativo, a correlação é espúria.
      </p>
      {bestStats && (
        <p className="mt-1 text-xs text-slate-500">
          Melhor lag: {correlationMethod === 'pearson' ? 'r' : 'ρ'} {bestStats.r.toFixed(3)} · IC95%({correlationMethod === 'pearson' ? 'r' : 'ρ'}) {formatCi95(bestStats.ci95Lower, bestStats.ci95Upper)} · p_perm {formatPValue(bestStats.pValuePermutation)} · q_fdr {formatPValue(bestStats.qValueFdr)} · n {bestStats.n}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Pontos dourados: {`q_fdr < ${FDR_SIGNIFICANCE_THRESHOLD.toFixed(2)}`} · lags significativos: {significantLagCount}
      </p>

      <div className="mt-3 flex gap-2 items-center">
        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Substância</label>
        <select
          value={selectedMedId}
          onChange={(e) => setSelectedMedId(e.target.value)}
          className="rounded-lg border border-slate-900/10 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          {availableMeds.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider ml-2">Método</label>
        <div className="flex gap-1">
          {METHOD_OPTIONS.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setCorrelationMethod(method)}
              className={`rounded-full px-2 py-0.5 text-xs font-semibold transition ${
                correlationMethod === method
                  ? 'bg-teal-700 text-white'
                  : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {method === 'pearson' ? 'Pearson' : 'Spearman'}
            </button>
          ))}
        </div>
      </div>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
              <XAxis
                dataKey="lag"
                type="number"
                domain={[LAGS[0], LAGS[LAGS.length - 1]]}
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v > 0 ? `+${v}h` : `${v}h`)}
              />
              <YAxis
                type="number"
                domain={[-1, 1]}
                ticks={[-1, -0.5, 0, 0.5, 1]}
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
                label={{ value: correlationMethod === 'pearson' ? 'Pearson r' : 'Spearman ρ', angle: -90, position: 'left', offset: 10, fontSize: 11, fill: '#475569' }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => {
                  if (name === 'r') return [typeof v === 'number' ? v.toFixed(3) : '—', correlationMethod === 'pearson' ? 'Pearson r' : 'Spearman ρ']
                  if (name === 'n') return [String(v ?? '—'), 'n (pares)']
                  if (name === 'pValuePermutation') return [formatPValue(typeof v === 'number' ? v : null), 'p_perm']
                  if (name === 'qValueFdr') return [formatPValue(typeof v === 'number' ? v : null), 'q_fdr']
                  return [String(v ?? '—'), String(name ?? '')]
                }}
                labelFormatter={(l) => {
                  const num = typeof l === 'number' ? l : Number(l)
                  if (!Number.isFinite(num)) return ''
                  return `Lag ${num > 0 ? '+' : ''}${num}h`
                }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
              <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="3 3" />
              {bestLag != null && (
                <ReferenceLine x={bestLag} stroke="#d97706" strokeWidth={1.5} />
              )}
              <Line
                type="monotone"
                dataKey="r"
                stroke="#0f766e"
                strokeWidth={2.5}
                dot={renderLagDot}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>
    </div>
  )
}
