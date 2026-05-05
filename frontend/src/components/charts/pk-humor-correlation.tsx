import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { useDoses, useSubstances } from '@/lib/api'
import {
  calculateConcentration,
  DEFAULT_PK_BODY_WEIGHT_KG,
  getMoodCorrelationWindowMs,
  PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML,
  type PKDose,
  type PKMedication,
} from '@/utils/pharmacokinetics'
import { pearson, substanceToPKMedication, toPKDoses } from '@/utils/intraday-correlation'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'

interface DailySMASample {
  date: string
  sma: number
  valence: number | null
}

function buildDailySMASamples(
  med: PKMedication,
  doses: PKDose[],
  snapshots: DailySnapshot[],
  weightKg: number,
): DailySMASample[] {
  const windowMs = getMoodCorrelationWindowMs(med)
  const hourMs = 60 * 60 * 1000
  const numPoints = Math.max(6, Math.round(windowMs / hourMs))

  const samples: DailySMASample[] = []
  for (const snap of snapshots) {
    const eod = new Date(`${snap.date}T23:59:59`).getTime()
    if (!Number.isFinite(eod)) continue

    let sum = 0
    let count = 0
    for (let i = 0; i < numPoints; i++) {
      const t = eod - i * hourMs
      const conc = calculateConcentration(med, doses, t, weightKg)
      if (Number.isFinite(conc) && conc > PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML) {
        sum += conc
        count++
      }
    }

    if (count >= 3) {
      samples.push({
        date: snap.date,
        sma: sum / count,
        valence: snap.mood?.valence ?? null,
      })
    }
  }
  return samples
}

// p-value bilateral via Fisher z-transform + erf approx (Abramowitz & Stegun 26.2.17)
function normCdf(z: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.sqrt(2)
  const t = 1 / (1 + p * x)
  const y =
    1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

function pValueFromR(r: number, n: number): number {
  if (n < 4 || !Number.isFinite(r) || Math.abs(r) >= 1) return Number.NaN
  const z = 0.5 * Math.log((1 + r) / (1 - r))
  const se = 1 / Math.sqrt(n - 3)
  return 2 * (1 - normCdf(Math.abs(z / se)))
}

interface CorrelationRow {
  subId: string
  subName: string
  med: PKMedication
  r0: number
  p0: number
  r1: number
  p1: number
  n: number
  nLag: number
}

interface Props {
  snapshots: DailySnapshot[]
  weightKg?: number
}

export function PKHumorCorrelation({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: doses = [] } = useDoses(168 * 6)
  const { data: substances = [] } = useSubstances()
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null)

  const rows = useMemo<CorrelationRow[]>(() => {
    if (!substances.length || !doses.length) return []

    return substances
      .map<CorrelationRow | null>((sub) => {
        const med = substanceToPKMedication(sub)
        if (!med) return null

        const subDoses = toPKDoses(doses.filter((d) => d.substance === sub.id))
        if (subDoses.length < 3) return null

        const samples = buildDailySMASamples(med, subDoses, snapshots, weightKg)
        const valid = samples.filter((s) => s.valence != null) as Array<DailySMASample & { valence: number }>
        if (valid.length < 7) return null

        const xs0 = valid.map((s) => s.sma)
        const ys0 = valid.map((s) => s.valence)
        const r0 = pearson(xs0, ys0)
        const p0 = pValueFromR(r0, valid.length)

        const lagXs: number[] = []
        const lagYs: number[] = []
        for (let i = 1; i < samples.length; i++) {
          const prev = samples[i - 1]
          const cur = samples[i]
          if (cur.valence != null && Number.isFinite(prev.sma)) {
            lagXs.push(prev.sma)
            lagYs.push(cur.valence)
          }
        }
        const r1 = lagXs.length >= 7 ? pearson(lagXs, lagYs) : Number.NaN
        const p1 = lagXs.length >= 7 ? pValueFromR(r1, lagXs.length) : Number.NaN

        return {
          subId: sub.id,
          subName: sub.display_name.split(' ')[0],
          med,
          r0,
          p0,
          r1,
          p1,
          n: valid.length,
          nLag: lagXs.length,
        }
      })
      .filter((row): row is CorrelationRow => row != null)
  }, [substances, doses, snapshots, weightKg])

  const selected = rows.find((r) => r.subId === selectedSubId) ?? rows[0] ?? null

  const scatterData = useMemo(() => {
    if (!selected) return []
    const subDoses = toPKDoses(doses.filter((d) => d.substance === selected.subId))
    return buildDailySMASamples(selected.med, subDoses, snapshots, weightKg)
      .filter((s) => s.valence != null)
      .map((s) => ({ sma: s.sma, valence: s.valence as number, date: s.date }))
  }, [selected, doses, snapshots, weightKg])

  if (rows.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Correlação SMA × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          PK suavizada × valência diária
        </h3>
        <p className="mt-4 text-sm text-slate-500">
          Sem substâncias com ≥3 doses + ≥7 dias de humor no período. Aumente a janela de visualização ou logue mais doses.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div>
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Correlação SMA × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          PK suavizada (2×t½) × valência diária
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Pearson r entre média móvel de concentração (janela 2×meia-vida) e valência. Lag +1d compara SMA do dia anterior com humor de hoje.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="pb-2 font-semibold">Substância</th>
              <th className="pb-2 font-semibold">r (lag 0)</th>
              <th className="pb-2 font-semibold">r (lag +1d)</th>
              <th className="pb-2 font-semibold">p (lag 0)</th>
              <th className="pb-2 font-semibold">n</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selected?.subId === row.subId
              const dotColor = SUBSTANCE_COLORS[row.subId] ?? '#8b5cf6'
              return (
                <tr
                  key={row.subId}
                  onClick={() => setSelectedSubId(row.subId)}
                  className={`cursor-pointer border-t border-slate-100 transition ${
                    isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <td className="py-2 font-medium">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: dotColor }} />
                    {row.subName}
                  </td>
                  <td className="py-2 font-mono">{formatR(row.r0)}</td>
                  <td className="py-2 font-mono">{formatR(row.r1)}</td>
                  <td className="py-2 font-mono">{formatP(row.p0)}</td>
                  <td className="py-2 font-mono text-slate-500">{row.n}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && scatterData.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs text-slate-500">
            Scatter <span className="font-semibold text-slate-700">{selected.subName}</span> · clique outra linha pra trocar
          </p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
                <CartesianGrid stroke="rgba(100,116,139,0.1)" />
                <XAxis
                  type="number"
                  dataKey="sma"
                  name="SMA conc"
                  tick={{ fill: '#475569', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'SMA conc (ng/mL)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  type="number"
                  dataKey="valence"
                  name="Valência"
                  domain={[-1, 1]}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <ZAxis range={[40, 40]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Scatter data={scatterData} fill={SUBSTANCE_COLORS[selected.subId] ?? '#8b5cf6'} fillOpacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function formatR(r: number): string {
  if (!Number.isFinite(r)) return '—'
  return r.toFixed(2)
}

function formatP(p: number): string {
  if (!Number.isFinite(p)) return '—'
  if (p < 0.001) return '<0.001'
  if (p < 0.01) return p.toFixed(3)
  return p.toFixed(2)
}
