/**
 * PKVariabilityHumorLab — Investiga se VARIABILIDADE da concentração
 * (não o nível) correlaciona com humor.
 *
 * Grade 4×3 (lag × métrica) por substância. Mesma estética do
 * PKVariabilityHeatmap (HeatmapCell reutilizado).
 *
 * 3 métricas exibidas simultaneamente:
 *   - CV% inter-dia: consistência do pico (drug forgiveness, Boissel 2002)
 *   - Swing intra-dia: amplitude diária empírica (Cmax−Cmin)
 *   - Time in Range: horas/dia dentro do therapeutic_range
 *
 * Lag sweep 0-3d com Pearson + FDR Benjamini-Hochberg sobre as 12 células.
 */

import { Fragment, useMemo, useState } from 'react'
import { FlaskConical } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  useConcentrationSeries,
  useDoses,
  useSubstances,
  type ConcentrationSeriesPoint,
  type Substance,
} from '@/lib/api'
import { DEFAULT_PK_BODY_WEIGHT_KG } from '@/utils/pharmacokinetics'
import {
  substanceToPKMedication,
  toPKDoses,
} from '@/utils/intraday-correlation'
import { applyFdrToCorrelations } from '@/utils/correlations'
import {
  analyzePkVariabilityVsMood,
  getPkVariabilityAnalysisWindow,
  PK_VARIABILITY_METRICS,
  PK_VARIABILITY_METRIC_DESCRIPTIONS,
  PK_VARIABILITY_METRIC_LABELS,
  PK_VARIABILITY_METRIC_UNITS,
  type PKVariabilityHypothesis,
  type PKVariabilityMetric,
  type PKVariabilityRow,
} from '@/utils/pk-variability'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'
import { HeatmapCell, type HeatmapCellEstimate } from './shared/heatmap-cell'
import { formatCi, formatP, formatR } from './shared/heatmap-helpers'

// Substâncias com farmacocinética relevante pra análise de variabilidade.
// Clonazepam fora: dose ansiolítica baixa não gera swing detectável (ACHADO #1+#2 BACKLOG).
const VARIABILITY_SUBSTANCE_IDS = ['lexapro', 'lamictal', 'venvanse']
const LAGS = [0, 1, 2, 3] as const
type LagDay = (typeof LAGS)[number]

function availableSubstances(substances: Substance[]): Substance[] {
  return substances.filter((s) => {
    if (!VARIABILITY_SUBSTANCE_IDS.includes(s.id)) return false
    if (s.bioavailability == null || s.half_life_hours == null) return false
    if (s.ka_per_hour == null) return false
    if (s.vd_l_per_kg == null && s.vd_l == null) return false
    return true
  })
}

function rowToEstimate(row: PKVariabilityRow | undefined): HeatmapCellEstimate | null {
  if (!row || !row.result) return null
  return {
    r: row.result.r,
    n: row.result.n,
    p: row.result.pValue,
    qFdr: row.result.qValueFdr ?? null,
  }
}

function describeLag(
  lag: LagDay,
  rowsByMetric: Record<PKVariabilityMetric, PKVariabilityRow | undefined>,
  substanceName: string,
): string {
  const cv = rowsByMetric.cv
  const swing = rowsByMetric.swing
  const tir = rowsByMetric.tir
  const quando = lag === 0 ? 'mesmo dia' : `${lag}d depois`

  // Maior |r| entre os 3 results disponíveis
  type Pick = { metric: PKVariabilityMetric; row: PKVariabilityRow }
  const candidates: Pick[] = [
    cv && cv.result ? { metric: 'cv' as const, row: cv } : null,
    swing && swing.result ? { metric: 'swing' as const, row: swing } : null,
    tir && tir.result ? { metric: 'tir' as const, row: tir } : null,
  ].filter((c): c is Pick => c !== null)

  if (candidates.length === 0) {
    const minN = Math.min(cv?.n ?? 0, swing?.n ?? 0, tir?.n ?? 0)
    return `Lag ${quando}: dados insuficientes (n=${minN}, precisa ≥10).`
  }

  const strongest = candidates
    .slice()
    .sort((a, b) => Math.abs(b.row.result!.r) - Math.abs(a.row.result!.r))[0]
  const r = strongest.row.result!.r
  const n = strongest.row.n
  const q = strongest.row.result!.qValueFdr
  const metricName = PK_VARIABILITY_METRIC_LABELS[strongest.metric]
  const direction = r > 0 ? 'sobe' : 'cai'
  const qSuffix =
    q != null && Number.isFinite(q)
      ? ` (q=${q.toFixed(3)}${q < 0.05 ? ' ★' : ''})`
      : ''

  // Detecta padrão U: r negativo + Q4 > Q1 (extremos parecidos com sweet spot intermediário)
  const uPattern =
    strongest.row.q1q4Delta != null &&
    Math.sign(r) !== Math.sign(strongest.row.q1q4Delta) &&
    Math.abs(strongest.row.q1q4Delta) > 0.1
  const uNote = uPattern
    ? ' Atenção: sinal em U — extremos têm humor parecido, intermediário difere.'
    : ''

  return `Lag ${quando}: sinal mais forte em ${metricName} (r=${r.toFixed(2)}, n=${n}${qSuffix}) — humor ${direction} quando ${metricName.toLowerCase()} de ${substanceName} aumenta.${uNote}`
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

export function PKVariabilityHumorLab({
  snapshots,
  weightKg = DEFAULT_PK_BODY_WEIGHT_KG,
}: Props) {
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState<SelectedHeatmapCell | null>(null)
  const { data: substances = [] } = useSubstances()
  const analysisWindow = useMemo(() => getPkVariabilityAnalysisWindow(snapshots), [snapshots])
  const { data: doses = [] } = useDoses(analysisWindow.doseHours)

  const subs = useMemo(() => availableSubstances(substances), [substances])

  const [substanceId, setSubstanceId] = useState<string>(VARIABILITY_SUBSTANCE_IDS[0])

  const effectiveSubstanceId = useMemo(() => {
    if (subs.length === 0) return substanceId
    if (subs.some((s) => s.id === substanceId)) return substanceId
    return subs[0].id
  }, [subs, substanceId])

  const { data: pkPayload, isFetching } = useConcentrationSeries(
    effectiveSubstanceId,
    analysisWindow.fromIso,
    analysisWindow.toIso,
    weightKg,
  )

  // Calcula 3 hypothesis (uma por métrica) em paralelo, depois aplica FDR BH
  // sobre as 12 células (4 lags × 3 métricas) — antes da auditoria 2026-05-15
  // o componente fazia FDR só nos 4 lags da métrica selecionada.
  const { hypotheses, substanceName, totalRealMoodDays } = useMemo(() => {
    const substance = subs.find((s) => s.id === effectiveSubstanceId)
    if (!substance) {
      return {
        hypotheses: null,
        substanceName: '',
        totalRealMoodDays: 0,
      }
    }
    const med = substanceToPKMedication(substance)
    if (!med) {
      return {
        hypotheses: null,
        substanceName: substance.display_name.split(' ')[0],
        totalRealMoodDays: 0,
      }
    }
    const series: ConcentrationSeriesPoint[] = pkPayload?.series ?? []
    if (series.length === 0) {
      return {
        hypotheses: null,
        substanceName: substance.display_name.split(' ')[0],
        totalRealMoodDays: 0,
      }
    }
    const subDoses = toPKDoses(doses.filter((d) => d.substance === substance.id))
    const shortName = substance.display_name.split(' ')[0]

    const byMetric = {} as Record<PKVariabilityMetric, PKVariabilityHypothesis>
    for (const metric of PK_VARIABILITY_METRICS) {
      byMetric[metric] = analyzePkVariabilityVsMood(
        substance.id,
        shortName,
        metric,
        snapshots,
        series,
        med,
        subDoses,
        weightKg,
      )
    }

    // FDR Benjamini-Hochberg sobre as 12 células
    const allResults = PK_VARIABILITY_METRICS.flatMap((metric) =>
      byMetric[metric].rows.map((row) => row.result),
    )
    applyFdrToCorrelations(allResults)

    return {
      hypotheses: byMetric,
      substanceName: shortName,
      totalRealMoodDays: byMetric.cv.realMoodDays,
    }
  }, [subs, effectiveSubstanceId, pkPayload, doses, snapshots, weightKg])

  const seriesLength = pkPayload?.series.length ?? 0

  // Detecta a célula com maior |r| significativa (q<0.05) pra destacar
  const peakKey = useMemo<string | null>(() => {
    if (!hypotheses) return null
    let bestKey: string | null = null
    let bestAbsR = 0
    for (const metric of PK_VARIABILITY_METRICS) {
      for (const row of hypotheses[metric].rows) {
        if (!row.result) continue
        const q = row.result.qValueFdr
        if (q == null || !Number.isFinite(q) || q >= 0.05) continue
        const absR = Math.abs(row.result.r)
        if (absR > bestAbsR) {
          bestAbsR = absR
          bestKey = `${metric}-${row.lagDays}`
        }
      }
    }
    return bestKey
  }, [hypotheses])

  if (subs.length === 0) {
    return (
      <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
          PK Variability Lab
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Concentrações irregulares afetam humor?
        </h3>
        <p className="mt-3 text-sm text-slate-500">
          Sem substâncias com PK completo (Lexapro, Lamictal, Venvanse). Carregando catálogo…
        </p>
      </section>
    )
  }

  // Linhas observacionais (1 por lag não-trivial)
  const lagObservations = LAGS.map((lag) => {
    if (!hypotheses) return null
    const rowsByMetric: Record<PKVariabilityMetric, PKVariabilityRow | undefined> = {
      cv: hypotheses.cv.rows.find((r) => r.lagDays === lag),
      swing: hypotheses.swing.rows.find((r) => r.lagDays === lag),
      tir: hypotheses.tir.rows.find((r) => r.lagDays === lag),
    }
    return { lag, text: describeLag(lag, rowsByMetric, substanceName) }
  }).filter((x): x is { lag: LagDay; text: string } => x !== null)

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
            PK Variability Lab
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Variabilidade da concentração × humor
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Testa se concentrações irregulares OU muito estáveis correlacionam com humor. Grade
            4×3: lag (0–3d) × métrica (CV%, Swing, TIR). Pearson R com FDR Benjamini-Hochberg
            sobre as 12 células. ★ = q&lt;0,05. Borda âmbar = célula mais forte significativa.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          <FlaskConical className="h-3.5 w-3.5" />
          base {analysisWindow.spanDays}d · humor pareado: {totalRealMoodDays}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Substância
          </label>
          <select
            value={effectiveSubstanceId}
            onChange={(e) => setSubstanceId(e.target.value)}
            className="rounded-lg border border-slate-900/10 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {subs.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.display_name}
              </option>
            ))}
          </select>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: SUBSTANCE_COLORS[effectiveSubstanceId] ?? '#8b5cf6' }}
            aria-hidden
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {hypotheses ? (
            <>
              <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[520px] grid-cols-[60px_repeat(3,minmax(0,1fr))] gap-1.5">
                  <span />
                  {PK_VARIABILITY_METRICS.map((metric) => (
                    <span
                      key={metric}
                      className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500"
                      title={PK_VARIABILITY_METRIC_DESCRIPTIONS[metric]}
                    >
                      {PK_VARIABILITY_METRIC_LABELS[metric]}
                      <span className="ml-1 text-slate-400">({PK_VARIABILITY_METRIC_UNITS[metric]})</span>
                    </span>
                  ))}
                  {LAGS.map((lag) => (
                    <Fragment key={`row-${lag}`}>
                      <span className="flex items-center justify-end pr-2 text-xs font-semibold text-slate-600">
                        {lag === 0 ? '0d' : `+${lag}d`}
                      </span>
                      {PK_VARIABILITY_METRICS.map((metric) => {
                        const row = hypotheses[metric].rows.find((r) => r.lagDays === lag)
                        const estimate = rowToEstimate(row)
                        const key = `${metric}-${lag}`
                        const label = `${substanceName} · ${PK_VARIABILITY_METRIC_LABELS[metric]} · ${lag === 0 ? '0d' : `+${lag}d`}`
                        return (
                          <HeatmapCell
                            key={key}
                            label={label}
                            estimate={estimate}
                            isPeak={peakKey === key}
                            significanceThreshold={0.05}
                            selected={selectedHeatmapCell?.key === key}
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
              </div>

              {selectedHeatmapCell && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-xs leading-5 text-slate-600">
                  <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Detalhe selecionado</p>
                  <p className="mt-1 font-semibold text-slate-800">{selectedHeatmapCell.label}</p>
                  <p>{selectedHeatmapCell.detail}</p>
                </div>
              )}

              <div className="mt-4 space-y-1.5 text-xs leading-5 text-slate-600">
                {lagObservations.map(({ lag, text }) => (
                  <p key={lag}>{text}</p>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-400">
              {isFetching ? 'Carregando série…' : 'Sem dados disponíveis pra essa combinação.'}
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-slate-900/10 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Legenda
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            <span className="font-semibold text-slate-700">CV%</span>: consistência do pico inter-dia
            (mais alto = mais errático).{' '}
            <span className="font-semibold text-slate-700">Swing</span>: amplitude intra-dia
            (Cmax−Cmin).{' '}
            <span className="font-semibold text-slate-700">TIR</span>: tempo no range terapêutico
            (horas/dia).
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Cor teal = r&gt;0 · cor vermelha = r&lt;0 · intensidade ∝ |r| · ★ = q&lt;0,05 após FDR.
          </p>
          <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-700">Ressalvas:</span> emoções têm sampling
            bias (logadas quando algo chama atenção). LHL drugs (Lexapro/Lamictal) têm swing baixo
            natural — desvios são sinal real. Venvanse (t½=11h) tem swing alto fisiológico.
            Variabilidade mistura PK + adesão — não causal. Lamictal sem TIR (range terapêutico
            removido após auditoria 2026-05-15 — TDM não padrão em bipolar).
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-lg bg-white/80 p-2 text-slate-500">
              dias série{' '}
              <strong className="block font-mono text-slate-800">{seriesLength}</strong>
            </span>
            <span className="rounded-lg bg-white/80 p-2 text-slate-500">
              fonte{' '}
              <strong className="block font-mono text-slate-800">
                {pkPayload?.source === 'regimen_fallback' ? 'fallback' : 'dose log'}
              </strong>
            </span>
          </div>
        </aside>
      </div>
    </section>
  )
}
