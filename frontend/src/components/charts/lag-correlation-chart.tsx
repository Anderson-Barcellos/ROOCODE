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
    valence:
      typeof r.Associações === 'number'
        ? (r.Associações - 50) / 50
        : null,
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

export function LagCorrelationChart() {
  const { data: substances = [] } = useSubstances()
  const { data: allDoses = [] } = useDoses(30 * 24)
  const { data: moodRows = [] } = useMood()
  const [selectedMedId, setSelectedMedId] = useState<string>('lexapro')

  const events = useMemo(() => normalizeMoodRecords(moodRows), [moodRows])

  const selectedSub = substances.find((s) => s.id === selectedMedId)
  const med = selectedSub ? substanceToPKMedication(selectedSub) : null

  const { data, bestLag, eventCount } = (() => {
    if (!med || events.length === 0) return { data: [], bestLag: null as number | null, eventCount: 0 }
    const dosesForMed = allDoses.filter((d) => d.substance === med.id)
    const pkDoses = toPKDoses(dosesForMed)
    const correlations = computeLagCorrelation(events, med, pkDoses, LAGS)
    const data = correlations.map((c) => ({
      lag: c.lagHours,
      r: c.r,
      n: c.n,
    }))
    // Best lag = peak de |r| entre lags >= 0 (causais)
    const causalLags = correlations.filter((c) => c.lagHours >= 0 && c.n >= 3)
    const bestLag = causalLags.length
      ? causalLags.reduce((best, cur) => (Math.abs(cur.r) > Math.abs(best.r) ? cur : best)).lagHours
      : null
    return { data, bestLag, eventCount: events.length }
  })()

  const readiness = evaluateReadiness([], CHART_REQUIREMENTS.lagCorrelation, 'Análise de lag', {
    pairCount: eventCount,
  })

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
        Pra cada lag, Pearson r entre concentração em <code className="text-xs">t−lag</code> e valência em <code className="text-xs">t</code>. Lags positivos testam causalidade (concentração antes do humor); lags negativos servem de controle — se o pico estiver em lag negativo, a correlação é espúria.
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
                label={{ value: 'Pearson r', angle: -90, position: 'left', offset: 10, fontSize: 11, fill: '#475569' }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => {
                  if (name === 'r') return [typeof v === 'number' ? v.toFixed(3) : '—', 'Pearson r']
                  if (name === 'n') return [String(v ?? '—'), 'n (pares)']
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
                dot={{ r: 3, fill: '#0f766e', stroke: '#fff', strokeWidth: 1 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>
    </div>
  )
}
