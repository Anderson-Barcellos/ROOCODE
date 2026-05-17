import { Fragment, useMemo, useState } from 'react'
import { FlaskConical } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  useConcentrationSeries,
  useDoses,
  useRangeExposureSeries,
  useSubstances,
  type ConcentrationSeriesPoint,
  type RangeExposureSeriesPoint,
  type Substance,
} from '@/lib/api'
import { DEFAULT_PK_BODY_WEIGHT_KG } from '@/utils/pharmacokinetics'
import { substanceToPKMedication, toPKDoses } from '@/utils/intraday-correlation'
import { applyFdrToCorrelations } from '@/utils/correlations'
import {
  analyzePkVariabilityVsMood,
  buildPkVariabilitySeries,
  buildSwingTirCrossTab,
  getPkVariabilityAnalysisWindow,
  PK_VARIABILITY_LOW_POWER_CELL_N,
  PK_VARIABILITY_METRICS,
  PK_VARIABILITY_METRIC_DESCRIPTIONS,
  PK_VARIABILITY_METRIC_LABELS,
  PK_VARIABILITY_METRIC_UNITS,
  type DailyRangeExposure,
  type PKVariabilityHypothesis,
  type PKVariabilityMetric,
  type PKVariabilityRow,
  type SwingTirCrossTab,
} from '@/utils/pk-variability'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'
import { HeatmapCell, type HeatmapCellEstimate } from './shared/heatmap-cell'
import { formatCi, formatP, formatR } from './shared/heatmap-helpers'

const VARIABILITY_SUBSTANCE_IDS = ['lexapro', 'lamictal', 'venvanse']
const LAGS = [0, 1, 2, 3] as const
type LagDay = (typeof LAGS)[number]
type SignalTier = 'robust' | 'watch' | 'noise'

function availableSubstances(substances: Substance[]): Substance[] {
  return substances.filter((s) => {
    if (!VARIABILITY_SUBSTANCE_IDS.includes(s.id)) return false
    if (s.bioavailability == null || s.half_life_hours == null) return false
    if (s.ka_per_hour == null) return false
    if (s.vd_l_per_kg == null && s.vd_l == null) return false
    return true
  })
}

function mapRangeExposureSeries(points: RangeExposureSeriesPoint[] | undefined): DailyRangeExposure[] | undefined {
  if (!points || points.length === 0) return undefined
  return points.map((point) => ({
    inRangeHours: point.in_range_hours,
    outOfRangeHours: point.out_of_range_hours,
    belowRangeHours: point.below_range_hours,
    aboveRangeHours: point.above_range_hours,
    lowExitClass: point.low_exit_class,
  }))
}

function classifyRowTier(row: PKVariabilityRow | undefined, hypothesis: PKVariabilityHypothesis): SignalTier {
  if (!row || !row.result) return 'noise'
  if (row.censored || row.replication.signInversion) return 'noise'
  const absR = Math.abs(row.result.r)
  const hasReplication = row.replication.replicates
  const hasCrossLag = hypothesis.crossLagConsistency.consistent

  if (hasReplication && hasCrossLag && absR >= 0.2 && row.n >= 20) return 'robust'
  if ((hasReplication || hasCrossLag) && absR >= 0.15 && row.n >= 10) return 'watch'
  return 'noise'
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

function describeEstimate(estimate: HeatmapCellEstimate, row?: PKVariabilityRow): string {
  const base = `r ${formatR(estimate.r)} · IC95% ${formatCi(estimate.ciLower, estimate.ciUpper)} · p ${formatP(estimate.p)} · q ${formatP(estimate.qFdr)} · n ${estimate.n}`
  if (!row) return base
  const windows = row.windowEstimates
    .map((w) => `${w.windowDays}d:${w.result ? w.result.r.toFixed(2) : 'n/d'}(n=${w.n})`)
    .join(' · ')
  return `${base} · janelas ${windows}`
}

function describeLag(
  lag: LagDay,
  rowsByMetric: Record<PKVariabilityMetric, PKVariabilityRow | undefined>,
  hypotheses: Record<PKVariabilityMetric, PKVariabilityHypothesis>,
  substanceName: string,
): string {
  type Pick = { metric: PKVariabilityMetric; row: PKVariabilityRow; tier: SignalTier }
  const candidates: Pick[] = PK_VARIABILITY_METRICS
    .map((metric) => {
      const row = rowsByMetric[metric]
      if (!row || !row.result) return null
      return { metric, row, tier: classifyRowTier(row, hypotheses[metric]) }
    })
    .filter((x): x is Pick => x != null)

  if (candidates.length === 0) return `Lag ${lag === 0 ? '0d' : `+${lag}d`}: sem pares suficientes.`

  const tierWeight = (tier: SignalTier) => (tier === 'robust' ? 2 : tier === 'watch' ? 1 : 0)
  const strongest = candidates
    .slice()
    .sort((a, b) => {
      const delta = tierWeight(b.tier) - tierWeight(a.tier)
      if (delta !== 0) return delta
      return Math.abs(b.row.result!.r) - Math.abs(a.row.result!.r)
    })[0]

  const r = strongest.row.result!.r
  const direction = r >= 0 ? 'sobe' : 'cai'
  const tierLabel = strongest.tier === 'robust' ? 'robusto' : strongest.tier === 'watch' ? 'a vigiar' : 'ruído'
  const inversion = strongest.row.replication.signInversion ? ' · inversão de sinal entre janelas' : ''

  return `Lag ${lag === 0 ? '0d' : `+${lag}d`}: ${tierLabel} em ${PK_VARIABILITY_METRIC_LABELS[strongest.metric]} (r=${r.toFixed(2)}, n=${strongest.row.n}) — humor ${direction} quando a métrica aumenta em ${substanceName}.${inversion}`
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

function SwingTirCrossTabCard({ crossTab }: { crossTab: SwingTirCrossTab | null }) {
  if (!crossTab || crossTab.cells.length === 0) return null

  const bins = crossTab.bins
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cross-tab swing × TIR</p>
      <p className="mt-1 text-xs text-slate-500">
        Mediana da valência por célula (TIR em colunas, swing em linhas). Células com n&lt;{PK_VARIABILITY_LOW_POWER_CELL_N} ficam marcadas.
      </p>
      <div className="mt-3 overflow-x-auto">
        <div
          className="grid min-w-[420px] gap-1"
          style={{ gridTemplateColumns: `80px repeat(${bins}, minmax(0, 1fr))` }}
        >
          <span />
          {Array.from({ length: bins }, (_, i) => (
            <span key={`tir-${i}`} className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
              TIR {i + 1}
            </span>
          ))}
          {Array.from({ length: bins }, (_, swingBin) => (
            <Fragment key={`row-${swingBin}`}>
              <span className="flex items-center justify-end pr-2 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
                Swing {swingBin + 1}
              </span>
              {Array.from({ length: bins }, (_, tirBin) => {
                const cell = crossTab.cells.find((x) => x.swingBin === swingBin && x.tirBin === tirBin)
                return (
                  <div
                    key={`cell-${swingBin}-${tirBin}`}
                    className={`rounded-md border px-2 py-2 text-center text-xs ${
                      cell?.lowPower ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50/70'
                    }`}
                  >
                    <div className="font-mono text-slate-800">{cell?.moodMedian == null ? '—' : cell.moodMedian.toFixed(2)}</div>
                    <div className="text-[0.62rem] text-slate-500">n={cell?.n ?? 0}</div>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">{crossTab.hypothesisCheck.note}</p>
    </div>
  )
}

export function PKVariabilityHumorLab({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
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
  const { data: rangeExposurePayload } = useRangeExposureSeries(
    effectiveSubstanceId,
    analysisWindow.fromIso,
    analysisWindow.toIso,
    weightKg,
  )

  const { hypotheses, substanceName, totalRealMoodDays, swingTirCrossTab, inversionCount } = useMemo(() => {
    const substance = subs.find((s) => s.id === effectiveSubstanceId)
    if (!substance) {
      return {
        hypotheses: null,
        substanceName: '',
        totalRealMoodDays: 0,
        swingTirCrossTab: null,
        inversionCount: 0,
      }
    }
    const med = substanceToPKMedication(substance)
    if (!med) {
      return {
        hypotheses: null,
        substanceName: substance.display_name.split(' ')[0],
        totalRealMoodDays: 0,
        swingTirCrossTab: null,
        inversionCount: 0,
      }
    }

    const series: ConcentrationSeriesPoint[] = pkPayload?.series ?? []
    if (series.length === 0) {
      return {
        hypotheses: null,
        substanceName: substance.display_name.split(' ')[0],
        totalRealMoodDays: 0,
        swingTirCrossTab: null,
        inversionCount: 0,
      }
    }

    const subDoses = toPKDoses(doses.filter((d) => d.substance === substance.id))
    const shortName = substance.display_name.split(' ')[0]

    const rangeExposureOverride = rangeExposurePayload?.range_available
      ? mapRangeExposureSeries(rangeExposurePayload.series)
      : undefined

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
        rangeExposureOverride,
      )
    }

    applyFdrToCorrelations(PK_VARIABILITY_METRICS.flatMap((metric) => byMetric[metric].rows.map((row) => row.result)))

    const moodByDate = new Map(
      snapshots
        .filter((snapshot) => !snapshot.forecasted && !snapshot.interpolated)
        .map((snapshot) => [snapshot.date, snapshot.mood?.valence ?? null] as const),
    )
    const moodSeries = series.map((point) => moodByDate.get(point.date) ?? null)
    const swingSeries = buildPkVariabilitySeries('swing', med, subDoses, series, weightKg)
    const tirSeries = buildPkVariabilitySeries(
      'tir',
      med,
      subDoses,
      series,
      weightKg,
      rangeExposureOverride,
    )

    return {
      hypotheses: byMetric,
      substanceName: shortName,
      totalRealMoodDays: byMetric.cv.realMoodDays,
      swingTirCrossTab: buildSwingTirCrossTab(swingSeries, tirSeries, moodSeries, 3),
      inversionCount: PK_VARIABILITY_METRICS.flatMap((metric) => byMetric[metric].rows).filter((row) => row.replication.signInversion).length,
    }
  }, [subs, effectiveSubstanceId, pkPayload, rangeExposurePayload, doses, snapshots, weightKg])

  const seriesLength = pkPayload?.series.length ?? 0

  const peakKey = useMemo<string | null>(() => {
    if (!hypotheses) return null
    let bestKey: string | null = null
    let bestScore = -Infinity

    const tierWeight = (tier: SignalTier) => (tier === 'robust' ? 2 : tier === 'watch' ? 1 : 0)
    for (const metric of PK_VARIABILITY_METRICS) {
      for (const row of hypotheses[metric].rows) {
        if (!row.result) continue
        const tier = classifyRowTier(row, hypotheses[metric])
        const qBonus = row.result.qValueFdr != null && row.result.qValueFdr < 0.05 ? 0.3 : 0
        const score = tierWeight(tier) * 10 + Math.abs(row.result.r) + qBonus
        if (score > bestScore) {
          bestScore = score
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
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Concentrações irregulares afetam humor?</h3>
        <p className="mt-3 text-sm text-slate-500">Sem substâncias com PK completo (Lexapro, Lamictal, Venvanse). Carregando catálogo…</p>
      </section>
    )
  }

  const lagObservations = LAGS.map((lag) => {
    if (!hypotheses) return null
    const rowsByMetric = Object.fromEntries(
      PK_VARIABILITY_METRICS.map((metric) => [metric, hypotheses[metric].rows.find((row) => row.lagDays === lag)]),
    ) as Record<PKVariabilityMetric, PKVariabilityRow | undefined>
    return { lag, text: describeLag(lag, rowsByMetric, hypotheses, substanceName) }
  }).filter((x): x is { lag: LagDay; text: string } => x != null)

  const censorship = hypotheses?.swing_transgressor.censorship ?? hypotheses?.swing.censorship ?? null
  const coherenceWarnings = hypotheses
    ? Array.from(
        new Set(
          PK_VARIABILITY_METRICS
            .map((metric) => hypotheses[metric].coherenceWarning)
            .filter((warning): warning is string => typeof warning === 'string' && warning.length > 0),
        ),
      )
    : []

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
            PK Variability Lab
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Variabilidade da concentração × humor</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Critério de destaque: replicação cross-janela (30/60/90), consistência cross-lag e FDR como informação adicional.
            Achado isolado fica registrado, sem promoção para hipótese principal.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          <FlaskConical className="h-3.5 w-3.5" />
          janela {analysisWindow.spanDays}d · humor pareado {totalRealMoodDays}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Substância</label>
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
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: SUBSTANCE_COLORS[effectiveSubstanceId] ?? '#8b5cf6' }} aria-hidden />
        </div>
      </div>

      {inversionCount > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <span className="font-semibold">⚠ Inversão de sinal entre janelas detectada:</span> {inversionCount} célula(s) mudaram direção entre 30/60/90d. Tratado como sinal frágil.
        </div>
      )}

      {censorship && (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${censorship.censoredForPlateau ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          <span className="font-semibold">Censura amostral:</span>{' '}
          plateau_baixo={censorship.lowPlateauDays} · vale_breve={censorship.briefValleyDays}.{' '}
          {censorship.censoredForPlateau
            ? 'Sem períodos sustentados fora do range em quantidade mínima; análises transgressoras ficam censuradas para evitar overclaim.'
            : 'Quantidade de plateau_baixo suficiente para análises transgressoras.'}
        </div>
      )}

      {coherenceWarnings.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <span className="font-semibold">⚠ Coerência front↔back:</span>{' '}
          {coherenceWarnings.map((warning, index) => (
            <span key={warning}>
              {index > 0 ? ' ' : ''}{warning}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {hypotheses ? (
            <>
              <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[860px] gap-1.5" style={{ gridTemplateColumns: `64px repeat(${PK_VARIABILITY_METRICS.length}, minmax(0, 1fr))` }}>
                  <span />
                  {PK_VARIABILITY_METRICS.map((metric) => (
                    <span key={metric} className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500" title={PK_VARIABILITY_METRIC_DESCRIPTIONS[metric]}>
                      {PK_VARIABILITY_METRIC_LABELS[metric]}
                      <span className="ml-1 text-slate-400">({PK_VARIABILITY_METRIC_UNITS[metric]})</span>
                    </span>
                  ))}

                  {LAGS.map((lag) => (
                    <Fragment key={`row-${lag}`}>
                      <span className="flex items-center justify-end pr-2 text-xs font-semibold text-slate-600">{lag === 0 ? '0d' : `+${lag}d`}</span>
                      {PK_VARIABILITY_METRICS.map((metric) => {
                        const row = hypotheses[metric].rows.find((r) => r.lagDays === lag)
                        const estimate = rowToEstimate(row)
                        const key = `${metric}-${lag}`
                        const label = `${substanceName} · ${PK_VARIABILITY_METRIC_LABELS[metric]} · ${lag === 0 ? '0d' : `+${lag}d`}`
                        const tier = classifyRowTier(row, hypotheses[metric])

                        return (
                          <div key={key} className="relative">
                            <HeatmapCell
                              label={label}
                              estimate={estimate}
                              isPeak={peakKey === key}
                              significanceThreshold={0.05}
                              tone={tier === 'robust' ? 'default' : tier === 'watch' ? 'watch' : 'noise'}
                              selected={selectedHeatmapCell?.key === key}
                              onSelect={estimate ? () => setSelectedHeatmapCell({
                                key,
                                label,
                                detail: describeEstimate(estimate, row),
                              }) : undefined}
                            />
                            {row && row.n > 0 && row.n < PK_VARIABILITY_LOW_POWER_CELL_N && (
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-amber-100 px-1 text-[0.55rem] font-semibold text-amber-700">n&lt;5</span>
                            )}
                          </div>
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

              <SwingTirCrossTabCard crossTab={swingTirCrossTab} />

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
                <span className="font-semibold">Metodologia:</span> pipeline detalhada em
                {' '}
                <span className="font-mono text-[0.72rem] text-slate-700">frontend/src/utils/README.md</span>
                {' '}
                e análise bruta de referência em
                {' '}
                <span className="font-mono text-[0.72rem] text-slate-700">docs/PK_HUMOR_SLOPE_ANALYSIS_2026-05-15.md</span>.
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-400">
              {isFetching ? 'Carregando série…' : 'Sem dados disponíveis pra essa combinação.'}
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-slate-900/10 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Legenda</p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            <span className="font-semibold text-slate-700">Robusto</span>: replica cross-janela + consistência cross-lag.{' '}
            <span className="font-semibold text-slate-700">A vigiar</span>: direcional, mas incompleto.{' '}
            <span className="font-semibold text-slate-700">Ruído</span>: pico isolado, inversão de sinal ou baixa potência.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">★ = q&lt;0,05 (FDR) · badge n&lt;5 = célula de baixa potência estatística.</p>
          <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-700">Pareamento único:</span> toda métrica é pareada por data ISO com humor diário real (sem forecast/interpolação).
          </div>
          <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-700">Glossário rápido:</span>{' '}
            r = correlação linear de Pearson; ρ = correlação de Spearman; FDR = controle de falsos positivos em múltiplos testes; IQR = intervalo interquartil (Q3−Q1); MAPE = erro percentual médio absoluto (usado no card de forecast).
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-lg bg-white/80 p-2 text-slate-500">
              dias série
              <strong className="block font-mono text-slate-800">{seriesLength}</strong>
            </span>
            <span className="rounded-lg bg-white/80 p-2 text-slate-500">
              fonte
              <strong className="block font-mono text-slate-800">{pkPayload?.source === 'regimen_fallback' ? 'fallback' : 'dose log'}</strong>
            </span>
          </div>
        </aside>
      </div>
    </section>
  )
}
