import { useMemo } from 'react'

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

interface DailyEmaSample {
  date: string
  ema: number
  valence: number | null
}

function buildDailyEmaSamples(
  med: PKMedication,
  doses: PKDose[],
  snapshots: DailySnapshot[],
  weightKg: number,
): DailyEmaSample[] {
  const windowMs = getMoodCorrelationWindowMs(med)
  const hourMs = 60 * 60 * 1000
  const numPoints = Math.max(6, Math.round(windowMs / hourMs))

  const samples: DailyEmaSample[] = []
  for (const snap of snapshots) {
    const eod = new Date(`${snap.date}T23:59:59`).getTime()
    if (!Number.isFinite(eod)) continue

    let weightedSum = 0
    let weightSum = 0
    for (let i = 0; i < numPoints; i++) {
      const t = eod - i * hourMs
      const conc = calculateConcentration(med, doses, t, weightKg)
      if (Number.isFinite(conc) && conc > PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML) {
        const ageMs = i * hourMs
        const weight = Math.exp(-ageMs / Math.max(windowMs, hourMs))
        weightedSum += conc * weight
        weightSum += weight
      }
    }

    if (weightSum > 0) {
      samples.push({
        date: snap.date,
        ema: weightedSum / weightSum,
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
  lag0: CorrelationEstimate
  lag1: CorrelationEstimate | null
}

interface CorrelationRawRow {
  subId: string
  subName: string
  lag0Base: Omit<CorrelationEstimate, 'qFdr'>
  lag1Base: Omit<CorrelationEstimate, 'qFdr'> | null
}

interface CorrelationEstimate {
  r: number
  p: number
  qFdr: number | null
  n: number
  ciLower: number | null
  ciUpper: number | null
}

interface Props {
  snapshots: DailySnapshot[]
  weightKg?: number
}

export function PKHumorCorrelation({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: doses = [] } = useDoses(168 * 6)
  const { data: substances = [] } = useSubstances()

  const rows = useMemo<CorrelationRow[]>(() => {
    if (!substances.length || !doses.length) return []

    const raw = substances
      .map<CorrelationRawRow | null>((sub) => {
        const med = substanceToPKMedication(sub)
        if (!med) return null

        const subDoses = toPKDoses(doses.filter((d) => d.substance === sub.id))
        if (subDoses.length < 3) return null

        const samples = buildDailyEmaSamples(med, subDoses, snapshots, weightKg)
        const valid = samples.filter((s) => s.valence != null) as Array<DailyEmaSample & { valence: number }>
        if (valid.length < 5) return null

        const xs0 = valid.map((s) => s.ema)
        const ys0 = valid.map((s) => s.valence)
        const r0 = pearson(xs0, ys0)
        const p0 = pValueFromR(r0, valid.length)
        const ci0 = fisherCi95(r0, valid.length)

        const lagXs: number[] = []
        const lagYs: number[] = []
        for (let i = 1; i < samples.length; i++) {
          const prev = samples[i - 1]
          const cur = samples[i]
          if (cur.valence != null && Number.isFinite(prev.ema)) {
            lagXs.push(prev.ema)
            lagYs.push(cur.valence)
          }
        }
        const r1 = lagXs.length >= 5 ? pearson(lagXs, lagYs) : Number.NaN
        const p1 = lagXs.length >= 5 ? pValueFromR(r1, lagXs.length) : Number.NaN
        const ci1 = lagXs.length >= 5 ? fisherCi95(r1, lagXs.length) : null

        const lag1Base = Number.isFinite(r1)
          ? {
              r: r1,
              p: p1,
              n: lagXs.length,
              ciLower: ci1?.lower ?? null,
              ciUpper: ci1?.upper ?? null,
            }
          : null

        return {
          subId: sub.id,
          subName: sub.display_name.split(' ')[0],
          lag0Base: {
            r: r0,
            p: p0,
            n: valid.length,
            ciLower: ci0?.lower ?? null,
            ciUpper: ci0?.upper ?? null,
          },
          lag1Base,
        }
      })

      .filter((row): row is CorrelationRawRow => row != null)

    const pTargets: Array<{ idx: number; lag: 'lag0' | 'lag1'; p: number }> = []
    raw.forEach((row, idx) => {
      if (Number.isFinite(row.lag0Base.p)) pTargets.push({ idx, lag: 'lag0', p: row.lag0Base.p })
      if (row.lag1Base && Number.isFinite(row.lag1Base.p)) pTargets.push({ idx, lag: 'lag1', p: row.lag1Base.p })
    })

    const qValues = benjaminiHochbergFdr(pTargets.map((target) => target.p))

    return raw.map((row, idx) => {
      const q0 = qValues[pTargets.findIndex((target) => target.idx === idx && target.lag === 'lag0')] ?? null
      const q1 = qValues[pTargets.findIndex((target) => target.idx === idx && target.lag === 'lag1')] ?? null
      return {
        subId: row.subId,
        subName: row.subName,
        lag0: { ...row.lag0Base, qFdr: q0 },
        lag1: row.lag1Base ? { ...row.lag1Base, qFdr: q1 } : null,
      }
    })
  }, [substances, doses, snapshots, weightKg])

  const significantCount = useMemo(() => {
    return rows
      .flatMap((row) => [row.lag0, row.lag1])
      .filter((estimate): estimate is CorrelationEstimate => estimate != null)
      .filter((estimate) => estimate.qFdr != null && estimate.qFdr < 0.05).length
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Correlação EMA × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          PK suavizada × valência diária
        </h3>
        <p className="mt-4 text-sm text-slate-500">
          Sem substâncias com ≥3 doses + ≥5 dias de humor no período. Aumente a janela de visualização ou logue mais doses.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div>
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Correlação EMA × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Coeficientes diários PK×humor (lag 0 e +1d)
        </h3>
        <p className="mt-1 text-xs text-slate-500 leading-5">
          Pearson r entre EMA de concentração (janela 2×t½) e valência. A barra mostra IC95% (Fisher z). `q_fdr` corrige múltiplos testes no painel.
        </p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          <span>Sinais com q_fdr &lt; 0.05:</span>
          <span>{significantCount}</span>
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.subId} className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: SUBSTANCE_COLORS[row.subId] ?? '#8b5cf6' }} />
              {row.subName}
            </div>
            <div className="space-y-2">
              <CoefficientStrip label="Lag 0" estimate={row.lag0} />
              <CoefficientStrip label="Lag +1d" estimate={row.lag1} />
            </div>
          </div>
        ))}
      </div>
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

function fisherCi95(r: number, n: number): { lower: number; upper: number } | null {
  if (!Number.isFinite(r) || n < 4 || Math.abs(r) >= 1) return null
  const z = 0.5 * Math.log((1 + r) / (1 - r))
  const se = 1 / Math.sqrt(n - 3)
  return {
    lower: Math.tanh(z - 1.959963984540054 * se),
    upper: Math.tanh(z + 1.959963984540054 * se),
  }
}

function benjaminiHochbergFdr(pValues: number[]): Array<number | null> {
  if (pValues.length === 0) return []
  const indexed = pValues
    .map((p, i) => ({ p, i }))
    .filter((item) => Number.isFinite(item.p) && item.p >= 0 && item.p <= 1)
    .sort((a, b) => a.p - b.p)

  const result: Array<number | null> = new Array(pValues.length).fill(null)
  const m = indexed.length
  if (m === 0) return result

  const raw = indexed.map((item, rank) => (item.p * m) / (rank + 1))
  let minSoFar = 1
  for (let idx = raw.length - 1; idx >= 0; idx--) {
    minSoFar = Math.min(minSoFar, raw[idx])
    result[indexed[idx].i] = Math.max(0, Math.min(1, minSoFar))
  }
  return result
}

function formatCi(lower: number | null, upper: number | null): string {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) return 'sem IC95%'
  return `[${lower.toFixed(2)}, ${upper.toFixed(2)}]`
}

function toTrackPercent(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value))
  return ((clamped + 1) / 2) * 100
}

function CoefficientStrip({
  label,
  estimate,
}: {
  label: string
  estimate: CorrelationEstimate | null
}) {
  if (!estimate) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {label}: dados insuficientes
      </div>
    )
  }

  const center = toTrackPercent(0)
  const dot = toTrackPercent(estimate.r)
  const ciLeft = estimate.ciLower == null ? null : toTrackPercent(estimate.ciLower)
  const ciRight = estimate.ciUpper == null ? null : toTrackPercent(estimate.ciUpper)
  const significant = estimate.qFdr != null && estimate.qFdr < 0.05

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="font-mono text-slate-500">
          r {formatR(estimate.r)} · IC95% {formatCi(estimate.ciLower, estimate.ciUpper)} · p {formatP(estimate.p)} · q {formatP(estimate.qFdr ?? Number.NaN)} · n {estimate.n}
        </span>
      </div>
      <div className="relative h-5 rounded-full bg-slate-200/70">
        <span className="absolute inset-y-0 w-px bg-slate-400" style={{ left: `${center}%` }} />
        {ciLeft != null && ciRight != null && (
          <span
            className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${significant ? 'bg-amber-500' : 'bg-slate-500'}`}
            style={{
              left: `${Math.min(ciLeft, ciRight)}%`,
              width: `${Math.max(1, Math.abs(ciRight - ciLeft))}%`,
            }}
          />
        )}
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow ${significant ? 'bg-amber-500' : 'bg-teal-700'}`}
          style={{ left: `${dot}%` }}
        />
      </div>
    </div>
  )
}
