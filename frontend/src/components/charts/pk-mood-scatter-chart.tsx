import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { useDoses, useMood, useSubstances } from '@/lib/api'
import type { MoodRecord } from '@/lib/api'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import {
  buildMoodEvents,
  buildPKMoodPairs,
  linearRegression,
  pearson,
  substanceToPKMedication,
  toPKDoses,
  type MoodEvent,
} from '@/utils/intraday-correlation'

// Converte MoodRecord[] do backend → MoodEntryRow[] local-like pra reuso de buildMoodEvents.
// Mantemos type = row.Fim pra detectar 'Emoção Momentânea'.
function normalizeMoodRecords(rows: MoodRecord[]): ReturnType<typeof buildMoodEvents> {
  const entries = rows.map((r) => ({
    start: r.Iniciar,
    end: null,
    type: r.Fim ?? null,
    labels: [],
    associations: [],
    // MoodRecord.Associações vem 0-100 do backend; buildMoodEvents espera -1..1.
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

const LAG_OPTIONS = [0, 1, 2, 4, 6, 8]

export function PKMoodScatterChart() {
  const { data: substances = [] } = useSubstances()
  const { data: allDoses = [] } = useDoses(30 * 24)
  const { data: moodRows = [] } = useMood()
  const [selectedMedId, setSelectedMedId] = useState<string>('lexapro')
  const [lagHours, setLagHours] = useState(0)

  const events: MoodEvent[] = useMemo(() => normalizeMoodRecords(moodRows), [moodRows])

  const selectedSub = substances.find((s) => s.id === selectedMedId)
  const med = selectedSub ? substanceToPKMedication(selectedSub) : null

  const { pairs, r, regression, xMax } = useMemo(() => {
    if (!med) return { pairs: [], r: NaN, regression: null as null | { slope: number; intercept: number }, xMax: 0 }
    const dosesForMed = allDoses.filter((d) => d.substance === med.id)
    const pkDoses = toPKDoses(dosesForMed)
    const pairs = buildPKMoodPairs(events, med, pkDoses, 91, lagHours)
    if (pairs.length < 3) return { pairs, r: NaN, regression: null, xMax: 0 }
    const xs = pairs.map((p) => p.concentration)
    const ys = pairs.map((p) => p.valence)
    const r = pearson(xs, ys)
    const regression = linearRegression(xs, ys)
    const xMax = Math.max(...xs, 1)
    return { pairs, r, regression, xMax }
  }, [med, allDoses, events, lagHours])

  const readiness = useMemo(
    () =>
      evaluateReadiness([], CHART_REQUIREMENTS.pkMoodScatter, 'Scatter PK×Humor', {
        pairCount: pairs.length,
      }),
    [pairs.length],
  )

  const regressionLine =
    regression && pairs.length >= 3
      ? [
          { concentration: 0, valence: regression.intercept },
          { concentration: xMax, valence: regression.intercept + regression.slope * xMax },
        ]
      : []

  const scatterData = pairs.map((p) => ({
    concentration: p.concentration,
    valence: p.valence,
    label: format(p.timestamp, "d MMM · HH:mm", { locale: ptBR }),
  }))

  const availableMeds = substances
    .map((s) => substanceToPKMedication(s))
    .filter((m): m is NonNullable<ReturnType<typeof substanceToPKMedication>> => m !== null)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Exploratório · PK × Humor
      </span>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Concentração × Valência (emoções momentâneas)
        </h3>
        {Number.isFinite(r) && (
          <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
            Pearson r = {r.toFixed(2)} · n = {pairs.length}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Cada ponto é uma emoção momentânea do State of Mind, pareada com a concentração da substância naquele instante (com lag opcional em horas).
      </p>

      <div className="mt-3 flex gap-2 flex-wrap items-center">
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
        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider ml-2">Lag (h)</label>
        <div className="flex gap-1">
          {LAG_OPTIONS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLagHours(l)}
              className={`rounded-full px-2 py-0.5 text-xs font-semibold transition ${
                lagHours === l
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Como ler</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Correlação ≠ causalidade. Com n {'<'} 20, r é ruidoso. Emoções momentâneas no iPhone têm
          sampling bias (tu tende a logar quando a emoção é forte). Use como hipótese, não evidência.
          Lag positivo = concentração HÁ X horas vs humor agora.
        </p>
      </details>

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="rgba(100,116,139,0.1)" />
              <XAxis
                type="number"
                dataKey="concentration"
                name="Concentração"
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))}
                label={{ value: 'Concentração (ng/mL)', position: 'bottom', offset: -5, fontSize: 11, fill: '#475569' }}
              />
              <YAxis
                type="number"
                dataKey="valence"
                name="Valência"
                domain={[-1, 1]}
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
                label={{ value: 'Valência', angle: -90, position: 'left', offset: 10, fontSize: 11, fill: '#475569' }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => {
                  if (name === 'Concentração') return [typeof v === 'number' ? `${v.toFixed(2)} ng/mL` : '—', name]
                  if (name === 'Valência') return [typeof v === 'number' ? v.toFixed(2) : '—', name]
                  return [String(v ?? '—'), String(name ?? '')]
                }}
                labelFormatter={() => ''}
              />
              <Scatter
                name="Eventos"
                data={scatterData}
                fill="#0f766e"
                fillOpacity={0.65}
              />
              {regressionLine.length === 2 && (
                <Line
                  type="linear"
                  dataKey="valence"
                  data={regressionLine}
                  stroke="#d97706"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DataReadinessGate>
    </div>
  )
}
