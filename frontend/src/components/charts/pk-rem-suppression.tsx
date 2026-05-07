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

import {
  useConcentrationSeries,
  useSleep,
  useSubstances,
  type ConcentrationSeriesPoint,
  type SleepRecord,
} from '@/lib/api'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import {
  evaluateReadiness,
  type ReadinessRequirement,
} from '@/utils/data-readiness'
import {
  inferIntradayCorrelation,
  linearRegression,
  type PKMoodPair,
} from '@/utils/intraday-correlation'

// Requirement inline pra evitar tocar em data-readiness.ts (Codex WIP).
// Pares cmax×REM são diários, então thresholds menores que pkMoodScatter (que
// trabalha com timestamps momentâneos com sampling bias).
const PK_REM_REQUIREMENT: ReadinessRequirement = {
  type: 'pairs',
  robustMin: 30,
  exploratoryMin: 14,
  collectingMin: 7,
}

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
  background: 'rgba(255,252,246,0.97)',
}

function formatPValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  if (value < 0.001) return '<0.001'
  return value.toFixed(3)
}

function formatCi95(lower: number | null, upper: number | null, digits = 2): string {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) {
    return 'sem dado'
  }
  return `[${lower.toFixed(digits)}, ${upper.toFixed(digits)}]`
}

// Parseia 'Date/Time' do SleepRecord pra YYYY-MM-DD. Tolerante a formatos variados.
function sleepRecordDate(record: SleepRecord): string | null {
  const raw = record['Date/Time']
  if (!raw) return null
  const trimmed = raw.trim().split(/[ T]/)[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

// Retorna ISO date de hoje (UTC) e N dias atrás, no formato YYYY-MM-DD.
function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// Adiciona N dias a uma string YYYY-MM-DD (UTC).
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface RemPair {
  date: string         // dia D (cmax)
  cmax: number
  remHours: number     // sleep da noite D→D+1 (índice por Date/Time = D+1)
}

export function PkRemSuppression() {
  const { data: substances = [] } = useSubstances()
  const { data: sleepRows = [] } = useSleep()
  const [selectedMedId, setSelectedMedId] = useState<string>('venvanse')

  // Janela: últimos 60 dias (cobertura típica pra n suficiente sem peso de payload)
  const fromIso = useMemo(() => isoDaysAgo(60), [])
  const toIso = useMemo(() => isoToday(), [])

  const { data: pkPayload } = useConcentrationSeries(selectedMedId, fromIso, toIso)

  // Indexa REM por data (YYYY-MM-DD)
  const remByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of sleepRows) {
      const date = sleepRecordDate(row)
      const rem = row['REM (hr)']
      if (date && typeof rem === 'number' && Number.isFinite(rem)) {
        map.set(date, rem)
      }
    }
    return map
  }, [sleepRows])

  // Pareia cmax do dia D com REM da noite D→D+1 (índice = D+1)
  const pairs: RemPair[] = useMemo(() => {
    if (!pkPayload?.series) return []
    const result: RemPair[] = []
    for (const point of pkPayload.series as ConcentrationSeriesPoint[]) {
      const remDate = addDaysIso(point.date, 1)
      const remHours = remByDate.get(remDate)
      if (remHours == null || !Number.isFinite(point.cmax_est) || point.cmax_est <= 0) continue
      result.push({
        date: point.date,
        cmax: point.cmax_est,
        remHours,
      })
    }
    return result
  }, [pkPayload, remByDate])

  // Reusa inferIntradayCorrelation com hack semântico:
  //   concentration = cmax_est, valence = remHours
  // O type PKMoodPair só é usado pra extrair os dois eixos — semântica não interfere.
  const pkMoodLikePairs: PKMoodPair[] = useMemo(
    () =>
      pairs.map((p, idx) => ({
        timestamp: idx, // unused pela inferência
        concentration: p.cmax,
        valence: p.remHours,
      })),
    [pairs],
  )

  const inference = useMemo(
    () => inferIntradayCorrelation(pkMoodLikePairs, { method: 'pearson' }),
    [pkMoodLikePairs],
  )

  const regression = useMemo(() => {
    if (pairs.length < 3) return null
    return linearRegression(
      pairs.map((p) => p.cmax),
      pairs.map((p) => p.remHours),
    )
  }, [pairs])

  const readiness = evaluateReadiness([], PK_REM_REQUIREMENT, 'Cmax × REM (next-night)', {
    pairCount: pairs.length,
  })

  const xMax = pairs.length > 0 ? Math.max(...pairs.map((p) => p.cmax), 1) : 1

  const regressionLine =
    regression && pairs.length >= 3
      ? [
          { cmax: 0, remHours: regression.intercept },
          { cmax: xMax, remHours: regression.intercept + regression.slope * xMax },
        ]
      : []

  const scatterData = pairs.map((p) => ({
    cmax: p.cmax,
    remHours: p.remHours,
    label: p.date,
  }))

  const availableMeds = substances.filter(
    (s) =>
      s.bioavailability != null &&
      s.ka_per_hour != null &&
      s.ke_per_hour != null &&
      (s.vd_l != null || s.vd_l_per_kg != null),
  )

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Exploratório · PK × Sono
      </span>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Cmax estimado × REM da noite seguinte
        </h3>
        {inference && (
          <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
            Pearson r = {inference.r.toFixed(2)} · p_perm = {formatPValue(inference.pValuePermutation)} · n = {inference.n}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Cada ponto é o pico estimado do dia D pareado com horas de REM da noite D→D+1.
        Hipótese clínica: estimulantes peak ~3–4h pós-dose, REM suppression conhecida → r negativo esperado.
      </p>

      <div className="mt-3 flex gap-2 flex-wrap items-center">
        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Substância</label>
        <select
          value={selectedMedId}
          onChange={(e) => setSelectedMedId(e.target.value)}
          className="rounded-lg border border-slate-900/10 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          {availableMeds.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.display_name}
            </option>
          ))}
        </select>
        <span className="text-[0.65rem] uppercase tracking-wide text-slate-400 ml-auto">
          {pkPayload?.source === 'regimen_fallback' ? 'Fallback: regimen sintético' : `Dose log · ${pkPayload?.events_count ?? 0} eventos`}
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Como ler</summary>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          REM é estimada por noite indexada na data do despertar (sleep.Date/Time = D+1). Cmax do dia D
          é pareado com a noite seguinte. Range: últimos 60 dias. Correlação ≠ causalidade. Estimulantes
          como lisdex podem suprimir REM mesmo em dose terapêutica.
        </p>
      </details>

      {inference && (
        <p className="mt-2 text-xs text-slate-500">
          IC95%(r) {formatCi95(inference.ci95Lower, inference.ci95Upper, 2)} · slope{' '}
          {inference.slope?.toFixed(4) ?? 'sem dado'} h-REM por ng/mL
        </p>
      )}

      <DataReadinessGate readiness={readiness}>
        <div className="mt-4 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="rgba(100,116,139,0.1)" />
              <XAxis
                type="number"
                dataKey="cmax"
                name="Cmax estimado"
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))}
                label={{ value: 'Cmax (ng/mL)', position: 'bottom', offset: -5, fontSize: 11, fill: '#475569' }}
              />
              <YAxis
                type="number"
                dataKey="remHours"
                name="REM (h)"
                domain={[0, 'dataMax + 0.5']}
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}h`}
                label={{ value: 'REM (h)', angle: -90, position: 'left', offset: 10, fontSize: 11, fill: '#475569' }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => {
                  if (name === 'Cmax estimado') return [typeof v === 'number' ? `${v.toFixed(2)} ng/mL` : '—', name]
                  if (name === 'REM (h)') return [typeof v === 'number' ? `${v.toFixed(2)}h` : '—', name]
                  return [String(v ?? '—'), String(name ?? '')]
                }}
                labelFormatter={() => ''}
              />
              <Scatter name="Noites" data={scatterData} fill="#7c3aed" fillOpacity={0.65} />
              {regressionLine.length === 2 && (
                <Line
                  type="linear"
                  dataKey="remHours"
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
