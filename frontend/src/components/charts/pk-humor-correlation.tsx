/**
 * PK×Humor Correlation — Pipeline Diário
 *
 * Hipótese pré-registrada:
 *   - Janela: EMA por substância (ex.: 48h para Lexapro/Lamictal, 72h para Rivotril)
 *   - Lag esperado: 0 (correlação contemporânea concentração×humor)
 *   - Cauda esperada: ≤ +3d (perda de efeito não persiste pós-reposição)
 *
 * Robustez (não p-hacking):
 *   - Lag sweep [-3,-2,-1,0,+1,+2,+3] dias testa se pico está em lag=0
 *   - Lags negativos = controle de causalidade (pico em lag<0 = espúrio)
 *   - FDR Benjamini-Hochberg cross-substância × cross-lag
 */

import { Fragment, useMemo, useState } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { FULL_HISTORY_DOSE_HOURS, useDoses, useSubstances } from '@/lib/api'
import {
  calculateConcentration,
  DEFAULT_PK_BODY_WEIGHT_KG,
  formatMoodCorrelationWindowLabel,
  getMoodCorrelationWindowMs,
  PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML,
  type PKDose,
  type PKMedication,
} from '@/utils/pharmacokinetics'
import {
  benjaminiHochbergFdr,
  fisherCi95,
  pearson,
  substanceToPKMedication,
  toPKDoses,
} from '@/utils/intraday-correlation'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'
import { HeatmapCell, type HeatmapCellEstimate } from '@/components/charts/shared/heatmap-cell'
import { formatCi, formatP, formatR } from '@/components/charts/shared/heatmap-helpers'

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

interface LagEstimate {
  lagDays: number
  r: number
  p: number
  qFdr: number | null
  n: number
  ciLower: number | null
  ciUpper: number | null
}

interface CorrelationRow {
  subId: string
  subName: string
  windowLabel: string
  lags: LagEstimate[]
  peakLagDays: number | null
}

interface FutureImpactRow {
  subId: string
  subName: string
  lagDays: number
  r: number
  n: number
  significant: boolean
}

const LAG_DAYS_SWEEP = [-3, -2, -1, 0, 1, 2, 3] as const
const MIN_VALID_PAIRS = 5
const MAX_LAG_ABS = 3
const MIN_TOTAL_SAMPLES = MIN_VALID_PAIRS + MAX_LAG_ABS // = 8

function pairAtLag(
  samples: DailyEmaSample[],
  lagDays: number,
): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < samples.length; i++) {
    const j = i + lagDays
    if (j < 0 || j >= samples.length) continue
    const ema = samples[i].ema
    const valence = samples[j].valence
    if (Number.isFinite(ema) && valence != null) {
      xs.push(ema)
      ys.push(valence)
    }
  }
  return { xs, ys }
}

interface Props {
  snapshots: DailySnapshot[]
  weightKg?: number
}

interface SelectedHeatmapCell {
  key: string
  label: string
  detail: string
}

function describeEstimate(estimate: HeatmapCellEstimate): string {
  return `r ${formatR(estimate.r)} · IC95% ${formatCi(estimate.ciLower, estimate.ciUpper)} · p ${formatP(estimate.p)} · q ${formatP(estimate.qFdr)} · n ${estimate.n}`
}

export function PKHumorCorrelation({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const [showRaw, setShowRaw] = useState(true)
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState<SelectedHeatmapCell | null>(null)
  const { data: doses = [] } = useDoses(FULL_HISTORY_DOSE_HOURS)
  const { data: substances = [] } = useSubstances()

  const rows = useMemo<CorrelationRow[]>(() => {
    if (!substances.length || !doses.length) return []

    type RawLagsBase = Array<Omit<LagEstimate, 'qFdr'> | null>
    type RawRow = { subId: string; subName: string; windowLabel: string; lagsBase: RawLagsBase }

    const raw: RawRow[] = []
    for (const sub of substances) {
      const med = substanceToPKMedication(sub)
      if (!med) continue

      const subDoses = toPKDoses(doses.filter((d) => d.substance === sub.id))
      if (subDoses.length < 3) continue

      const samples = buildDailyEmaSamples(med, subDoses, snapshots, weightKg)
      if (samples.length < MIN_TOTAL_SAMPLES) continue

      const lagsBase: RawLagsBase = LAG_DAYS_SWEEP.map((lagDays) => {
        const { xs, ys } = pairAtLag(samples, lagDays)
        if (xs.length < MIN_VALID_PAIRS) return null
        const r = pearson(xs, ys)
        if (!Number.isFinite(r)) return null
        const p = pValueFromR(r, xs.length)
        const ci = fisherCi95(r, xs.length)
        return {
          lagDays,
          r,
          p,
          n: xs.length,
          ciLower: ci?.lower ?? null,
          ciUpper: ci?.upper ?? null,
        }
      })

      raw.push({
        subId: sub.id,
        subName: sub.display_name.split(' ')[0],
        windowLabel: formatMoodCorrelationWindowLabel(med),
        lagsBase,
      })
    }

    // FDR cross-substância × cross-lag
    const pTargets: Array<{ rowIdx: number; lagIdx: number; p: number }> = []
    raw.forEach((row, rowIdx) => {
      row.lagsBase.forEach((est, lagIdx) => {
        if (est && Number.isFinite(est.p)) {
          pTargets.push({ rowIdx, lagIdx, p: est.p })
        }
      })
    })
    const qValues = benjaminiHochbergFdr(pTargets.map((t) => t.p))

    return raw.map((row, rowIdx) => {
      const lags: LagEstimate[] = []
      row.lagsBase.forEach((est, lagIdx) => {
        if (!est) return
        const targetIdx = pTargets.findIndex((t) => t.rowIdx === rowIdx && t.lagIdx === lagIdx)
        const qFdr = targetIdx >= 0 ? qValues[targetIdx] : null
        lags.push({ ...est, qFdr })
      })
      const significant = lags.filter((l) => l.qFdr != null && l.qFdr < 0.05)
      const peakLagDays = significant.length
        ? significant.reduce((peak, l) => (Math.abs(l.r) > Math.abs(peak.r) ? l : peak)).lagDays
        : null
      return {
        subId: row.subId,
        subName: row.subName,
        windowLabel: row.windowLabel,
        lags,
        peakLagDays,
      }
    })
  }, [substances, doses, snapshots, weightKg])

  const significantCount = useMemo(() => {
    return rows
      .flatMap((row) => row.lags)
      .filter((estimate) => estimate.qFdr != null && estimate.qFdr < 0.05).length
  }, [rows])

  const summaryVerdict = useMemo(() => {
    const allEstimates = rows.flatMap((row) => row.lags.map((lag) => ({ row, lag })))
    const strongest = allEstimates.length
      ? allEstimates.reduce((best, current) =>
          Math.abs(current.lag.r) > Math.abs(best.lag.r) ? current : best,
        )
      : null

    if (significantCount > 0) {
      return {
        text: `Há ${significantCount} associação(ões) com significância estatística após correção de múltiplos testes (FDR).`,
        tone: 'good' as const,
      }
    }

    if (strongest) {
      const lagLabel = strongest.lag.lagDays === 0
        ? 'no mesmo dia'
        : strongest.lag.lagDays > 0
          ? `${strongest.lag.lagDays} dia(s) depois`
          : `${Math.abs(strongest.lag.lagDays)} dia(s) antes`
      return {
        text: `Sem evidência confirmada por FDR neste período. Hipótese mais forte: ${strongest.row.subName} em ${lagLabel} (r=${strongest.lag.r.toFixed(2)}, n=${strongest.lag.n}).`,
        tone: 'watch' as const,
      }
    }

    return {
      text: 'Sem pares suficientes para inferência robusta de remédio × humor no período atual.',
      tone: 'neutral' as const,
    }
  }, [rows, significantCount])

  const verdictClass =
    summaryVerdict.tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : summaryVerdict.tone === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-50 text-slate-800'

  const futureImpact = useMemo<FutureImpactRow[]>(() => {
    return rows
      .map((row) => {
        const future = row.lags.filter((lag) => lag.lagDays > 0)
        if (!future.length) return null
        const significantFuture = future.filter((lag) => lag.qFdr != null && lag.qFdr < 0.05)
        const pool = significantFuture.length > 0 ? significantFuture : future
        const peak = pool.reduce((best, current) =>
          Math.abs(current.r) > Math.abs(best.r) ? current : best,
        )
        return {
          subId: row.subId,
          subName: row.subName,
          lagDays: peak.lagDays,
          r: peak.r,
          n: peak.n,
          significant: peak.qFdr != null && peak.qFdr < 0.05,
        }
      })
      .filter((row): row is FutureImpactRow => row != null)
      .sort((a, b) => a.lagDays - b.lagDays || Math.abs(b.r) - Math.abs(a.r))
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Remédio × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Esta medicação muda meu humor? (teste em 7 lags)
        </h3>
        <p className="mt-4 text-sm text-slate-500">
          Sem substâncias com ≥3 doses + ≥{MIN_TOTAL_SAMPLES} dias de snapshots no período. Aumente a janela de visualização ou logue mais doses.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div>
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Remédio × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Esta medicação muda meu humor? (teste em 7 lags)
        </h3>
        <p className="mt-1 text-xs text-slate-500 leading-5">
          {showRaw
            ? 'Modo bruto ativo: verde/vermelho em gradiente (intensidade = |r|, sinal = direção), mesmo sem significância estatística.'
            : 'Modo conservador: só achados com q < 0.05 ficam coloridos. Não significativos aparecem em cinza para reduzir falso padrão visual.'}
        </p>
        <p className="mt-2 text-[0.72rem] leading-5 text-slate-500">
          Exposição suavizada por janela pré-fixada por substância: Lexapro/Lamictal usam 48h; Rivotril usa 72h. Evitamos 2 meias-vidas universal para não defasar sinais clínicos.
        </p>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowRaw((prev) => !prev)}
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              showRaw
                ? 'border-violet-300 bg-violet-50 text-violet-700'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
            }`}
          >
            {showRaw ? 'Filtrar só significativos' : 'Mostrar gradiente completo'}
          </button>
        </div>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          <span>Sinais significativos (q &lt; 0.05):</span>
          <span>{significantCount}</span>
        </p>
        <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
          <span className="font-semibold">Veredito:</span> {summaryVerdict.text}
        </p>
        {futureImpact.length > 0 && (
          <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
            <span className="font-semibold">Impacto para frente (+1d…+3d):</span>
            <div className="mt-1 space-y-1">
              {futureImpact.map((item) => (
                <div key={item.subId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold">{item.subName}:</span>
                  <span className={item.r >= 0 ? 'text-teal-700' : 'text-red-600'}>
                    {item.r >= 0 ? 'tendência de melhora' : 'tendência de piora'} em +{item.lagDays}d
                  </span>
                  <span className="text-slate-600">(r={item.r.toFixed(2)}, n={item.n})</span>
                  <span className={item.significant ? 'text-amber-700' : 'text-slate-500'}>
                    {item.significant ? 'q<0.05' : 'exploratório'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {rows.filter((r) => r.peakLagDays !== null).length > 0 && (
        <div className="mt-3 space-y-1.5">
          {rows
            .filter((r) => r.peakLagDays !== null)
            .map((row) => {
              const peak = row.lags.find((l) => l.lagDays === row.peakLagDays)
              const direction =
                peak && peak.r > 0 ? '↑ humor tende a subir' : '↓ humor tende a cair'
              const lagText =
                row.peakLagDays === 0
                  ? 'no mesmo dia'
                  : row.peakLagDays! > 0
                    ? `${row.peakLagDays}d depois`
                    : 'lag negativo — correlação provavelmente espúria'
              return (
                <div
                  key={row.subId}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: SUBSTANCE_COLORS[row.subId] ?? '#8b5cf6' }}
                  />
                  <span className="font-semibold">{row.subName}:</span>
                  <span>
                    {direction} quando concentração alta — pico {lagText}
                    {peak ? ` (r≈${peak.r.toFixed(2)})` : ''}
                  </span>
                </div>
              )
            })}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <div
          className="grid min-w-[720px] gap-x-1 gap-y-2"
          style={{ gridTemplateColumns: '140px repeat(7, minmax(72px, 1fr))' }}
        >
          <div />
          {LAG_DAYS_SWEEP.map((lag) => (
            <div
              key={lag}
              className={`text-center text-[0.65rem] font-semibold uppercase tracking-wider ${
                lag < 0 ? 'text-slate-400' : lag === 0 ? 'text-teal-700' : 'text-slate-700'
              }`}
            >
              {lag === 0 ? 'lag 0' : lag > 0 ? `+${lag}d` : `${lag}d`}
            </div>
          ))}

          {rows.map((row) => (
            <Fragment key={row.subId}>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: SUBSTANCE_COLORS[row.subId] ?? '#8b5cf6' }}
                />
                <span>{row.subName}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.62rem] font-medium uppercase tracking-wide text-slate-500">
                  {row.windowLabel}
                </span>
              </div>
              {LAG_DAYS_SWEEP.map((lag) => {
                const est = row.lags.find((l) => l.lagDays === lag) ?? null
                const label = `${row.subName} · ${lag === 0 ? 'lag 0' : lag > 0 ? `+${lag}d` : `${lag}d`}`
                const estimate = est
                  ? {
                      r: est.r,
                      n: est.n,
                      p: est.p,
                      qFdr: est.qFdr,
                      ciLower: est.ciLower,
                      ciUpper: est.ciUpper,
                    }
                  : null
                const key = `${row.subId}-${lag}`
                return (
                  <HeatmapCell
                    key={lag}
                    label={label}
                    estimate={estimate}
                    isPeak={row.peakLagDays === lag}
                    isControl={lag < 0}
                    selected={selectedHeatmapCell?.key === key}
                    muteNonSignificant={!showRaw}
                    onSelect={estimate ? () => setSelectedHeatmapCell({
                      key,
                      label,
                      detail: describeEstimate(estimate),
                    }) : undefined}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>

        {selectedHeatmapCell && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-xs leading-5 text-slate-600">
            <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Detalhe selecionado</p>
            <p className="mt-1 font-semibold text-slate-800">{selectedHeatmapCell.label}</p>
            <p>{selectedHeatmapCell.detail}</p>
          </div>
        )}

        <ul className="mt-3 space-y-0.5 text-[0.68rem] leading-5 text-slate-500">
          <li>
            <span className="font-semibold text-teal-700">Verde/↑</span> = mais concentração → humor melhor ·{' '}
            <span className="font-semibold text-red-500">Vermelho/↓</span> = mais concentração → humor pior ·{' '}
            <span className="font-semibold text-slate-500">cinza</span> = sem significância após FDR
          </li>
          <li>
            <span className="font-semibold text-amber-600">★</span> = resultado com q &lt; 0.05 (controle de falsos positivos entre todas as substâncias × lags) ·{' '}
            <span className="font-semibold text-amber-600">borda âmbar</span> = lag de pico da substância
          </li>
          <li>
            <span className="font-semibold text-slate-400">Lags negativos (esmaecidos)</span> = controles de causalidade — pico neles indica correlação espúria (concentração futura não causa humor passado)
          </li>
        </ul>
      </div>
    </div>
  )
}
