/**
 * PKVariabilityReportCard — resumo textual dos sinais com maior robustez.
 *
 * Regra atual de destaque (v2): prioriza replicação cross-janela (30/60/90)
 * + consistência cross-lag. FDR entra como informação adicional no texto,
 * não como gate único.
 *
 * Achados isolados ficam em "a vigiar" e não sobem para hipótese principal.
 * Se não houver sinal robusto/a vigiar, o card retorna null (sem ruído visual).
 */

import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  useConcentrationSeries,
  useDoses,
  useRangeExposureSeries,
  useSubstances,
  type ConcentrationSeriesPoint,
  type RangeExposureSeriesPoint,
} from '@/lib/api'
import { DEFAULT_PK_BODY_WEIGHT_KG } from '@/utils/pharmacokinetics'
import {
  substanceToPKMedication,
  toPKDoses,
} from '@/utils/intraday-correlation'
import {
  analyzePkVariabilityVsMood,
  getPkVariabilityAnalysisWindow,
  PK_VARIABILITY_METRICS,
  PK_VARIABILITY_METRIC_LABELS,
  type PKVariabilityHypothesis,
  type PKVariabilityMetric,
  type PKVariabilityRow,
  type DailyRangeExposure,
} from '@/utils/pk-variability'
import { applyFdrToCorrelations } from '@/utils/correlations'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'

const SUBSTANCE_IDS = ['lexapro', 'lamictal', 'venvanse'] as const

interface StrongSignal {
  substanceId: string
  substanceName: string
  metric: PKVariabilityMetric
  bestRow: PKVariabilityRow
  bestLagDays: number
  hypothesis: PKVariabilityHypothesis
}

type SignalTier = 'robust' | 'watch' | 'noise'

interface EvaluatedSignal extends StrongSignal {
  tier: SignalTier
  tierReason: string
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

function metricVerb(metric: PKVariabilityMetric): string {
  if (metric === 'tir') return 'tempo no range terapêutico'
  if (metric === 'swing_in_range') return 'swing intra-range'
  if (metric === 'swing_transgressor') return 'swing transgressor'
  if (metric === 'swing') return 'swing intra-dia'
  return 'variabilidade do pico (CV%)'
}

function classifySignalTier(hypothesis: PKVariabilityHypothesis, row: PKVariabilityRow): { tier: SignalTier; reason: string } {
  if (!row.result) return { tier: 'noise', reason: 'sem correlação calculável' }
  if (row.censored) return { tier: 'noise', reason: row.censorReason ?? 'censura amostral' }

  const absR = Math.abs(row.result.r)
  const hasReplication = row.replication.replicates
  const hasCrossLag = hypothesis.crossLagConsistency.consistent
  const signInversion = row.replication.signInversion

  if (signInversion) {
    return { tier: 'noise', reason: 'inversão de sinal entre janelas' }
  }

  if (hasReplication && hasCrossLag && absR >= 0.2 && row.n >= 20) {
    return { tier: 'robust', reason: 'replica cross-janela + consistência cross-lag' }
  }

  if ((hasReplication || hasCrossLag) && absR >= 0.15 && row.n >= 10) {
    return {
      tier: 'watch',
      reason: hasReplication
        ? 'replica entre janelas, mas sem consistência total por lag'
        : 'direção estável em lags, mas sem replicação cross-janela',
    }
  }

  return {
    tier: 'noise',
    reason:
      row.replication.fragileReason === 'single-window'
        ? 'achado isolado em janela única'
        : 'efeito frágil/baixo poder',
  }
}

function describeSignal(sig: StrongSignal): string {
  const { substanceName, metric, bestRow, bestLagDays } = sig
  const r = bestRow.result!.r
  const direction = r > 0 ? 'sobe' : 'cai'
  const lagText =
    bestLagDays === 0 ? 'no mesmo dia' : `${bestLagDays}d depois`
  const q1q4 =
    bestRow.q1q4Delta != null && Math.abs(bestRow.q1q4Delta) >= 0.05
      ? bestRow.q1q4Delta > 0
        ? ' Quartil mais alto teve humor maior que o mais baixo'
        : ' Quartil mais alto teve humor menor que o mais baixo'
      : ''
  const q = bestRow.result?.qValueFdr
  const qText = q == null || !Number.isFinite(q) ? 'q n/d' : `q=${q.toFixed(3)}`
  return (
    `${substanceName} · ${metricVerb(metric)}: quando ${metric === 'tir' ? 'aumenta' : 'sobe'}, ` +
    `humor ${direction} ${lagText} (r=${r.toFixed(2)}, n=${bestRow.n}, p=${bestRow.result!.pValue.toFixed(3)}, ${qText}).${q1q4}.`
  )
}

interface Props {
  snapshots: DailySnapshot[]
  weightKg?: number
}

export function PKVariabilityReportCard({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: substances = [] } = useSubstances()
  const analysisWindow = useMemo(() => getPkVariabilityAnalysisWindow(snapshots), [snapshots])
  const { data: doses = [] } = useDoses(analysisWindow.doseHours)

  const lex = useConcentrationSeries('lexapro', analysisWindow.fromIso, analysisWindow.toIso, weightKg)
  const lam = useConcentrationSeries('lamictal', analysisWindow.fromIso, analysisWindow.toIso, weightKg)
  const lis = useConcentrationSeries('venvanse', analysisWindow.fromIso, analysisWindow.toIso, weightKg)
  const lexRange = useRangeExposureSeries('lexapro', analysisWindow.fromIso, analysisWindow.toIso, weightKg)
  const lamRange = useRangeExposureSeries('lamictal', analysisWindow.fromIso, analysisWindow.toIso, weightKg)
  const lisRange = useRangeExposureSeries('venvanse', analysisWindow.fromIso, analysisWindow.toIso, weightKg)

  const lexSeries = lex.data?.series
  const lamSeries = lam.data?.series
  const lisSeries = lis.data?.series

  const signals = useMemo<EvaluatedSignal[]>(() => {
    const seriesByKey: Record<string, ConcentrationSeriesPoint[]> = {
      lexapro: lexSeries ?? [],
      lamictal: lamSeries ?? [],
      venvanse: lisSeries ?? [],
    }
    const rangeByKey: Record<string, DailyRangeExposure[] | undefined> = {
      lexapro: lexRange.data?.range_available ? mapRangeExposureSeries(lexRange.data?.series) : undefined,
      lamictal: lamRange.data?.range_available ? mapRangeExposureSeries(lamRange.data?.series) : undefined,
      venvanse: lisRange.data?.range_available ? mapRangeExposureSeries(lisRange.data?.series) : undefined,
    }
    const result: EvaluatedSignal[] = []
    const allHypotheses: PKVariabilityHypothesis[] = []

    for (const subId of SUBSTANCE_IDS) {
      const sub = substances.find((s) => s.id === subId)
      if (!sub) continue
      const med = substanceToPKMedication(sub)
      if (!med) continue
      const series = seriesByKey[subId]
      if (!series || series.length === 0) continue
      const subDoses = toPKDoses(doses.filter((d) => d.substance === subId))

      for (const metric of PK_VARIABILITY_METRICS) {
        const hypothesis = analyzePkVariabilityVsMood(
          subId,
          sub.display_name.split(' ')[0],
          metric,
          snapshots,
          series,
            med,
            subDoses,
            weightKg,
            rangeByKey[subId],
          )
          allHypotheses.push(hypothesis)
        }
      }

    applyFdrToCorrelations(
      allHypotheses.flatMap((hypothesis) => hypothesis.rows.map((row) => row.result)),
    )

    for (const subId of SUBSTANCE_IDS) {
      for (const hypothesis of allHypotheses.filter((h) => h.substanceId === subId)) {
        const metric = hypothesis.metric
        const bestRow = hypothesis.rows.find((r) => r.lagDays === hypothesis.bestLagDays)
        if (!bestRow || hypothesis.bestLagDays == null || !bestRow.result) continue
        const tier = classifySignalTier(hypothesis, bestRow)
        result.push({
          substanceId: subId,
          substanceName: hypothesis.substanceName,
          metric,
          bestRow,
          bestLagDays: hypothesis.bestLagDays,
          hypothesis,
          tier: tier.tier,
          tierReason: tier.reason,
        })
      }
    }

    return result.sort(
      (a, b) => {
        const tierScore = (tier: SignalTier) => (tier === 'robust' ? 2 : tier === 'watch' ? 1 : 0)
        const tierDelta = tierScore(b.tier) - tierScore(a.tier)
        if (tierDelta !== 0) return tierDelta
        return Math.abs(b.bestRow.result!.r) - Math.abs(a.bestRow.result!.r)
      },
    )
  }, [
    substances,
    lexSeries,
    lamSeries,
    lisSeries,
    lexRange.data,
    lamRange.data,
    lisRange.data,
    doses,
    snapshots,
    weightKg,
  ])

  const robustSignals = signals.filter((signal) => signal.tier === 'robust')
  const watchSignals = signals.filter((signal) => signal.tier === 'watch')
  const noiseSignals = signals.filter((signal) => signal.tier === 'noise')

  if (robustSignals.length === 0 && watchSignals.length === 0) return null

  return (
    <section className="rounded-[1.5rem] border border-teal-300/60 dark:border-teal-400/30 bg-gradient-to-br from-teal-50 via-white to-violet-50 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 dark:border-teal-400/30 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
          <Sparkles className="h-3 w-3" />
          Sinais de variabilidade (com replicação)
        </span>
        <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">
          robustos {robustSignals.length} · a vigiar {watchSignals.length} · ruído {noiseSignals.length}
        </span>
      </div>
      <h3 className="mt-3 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-900">
        Variabilidade da concentração × humor (base {analysisWindow.spanDays}d)
      </h3>
      <ul className="mt-3 space-y-2.5">
        {robustSignals.map((sig) => (
          <li
            key={`${sig.substanceId}-${sig.metric}`}
            className="flex gap-3 rounded-lg bg-white/70 p-3 text-sm leading-6 text-slate-700"
          >
            <span
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: SUBSTANCE_COLORS[sig.substanceId] ?? '#8b5cf6' }}
              aria-hidden
            />
            <div className="flex-1">
              <p className="text-slate-800">{describeSignal(sig)}</p>
              <p className="mt-1 text-[0.7rem] text-slate-500">
                Métrica: {PK_VARIABILITY_METRIC_LABELS[sig.metric]} · qualidade{' '}
                {sig.bestRow.quality} · lag pico {sig.bestLagDays}d · {sig.tierReason}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {watchSignals.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200">
          <p className="font-semibold uppercase tracking-[0.12em]">A vigiar (não promover como hipótese principal)</p>
          <ul className="mt-1 space-y-1">
            {watchSignals.map((sig) => (
              <li key={`watch-${sig.substanceId}-${sig.metric}`}>
                {sig.substanceName} · {PK_VARIABILITY_METRIC_LABELS[sig.metric]} · lag {sig.bestLagDays}d — {sig.tierReason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[0.7rem] leading-5 text-slate-500">
        <span className="font-semibold text-slate-700">Como ler:</span> hipóteses
        exploratórias, não causalidade. Destaque principal exige replicação cross-janela
        e consistência cross-lag; picos isolados ficam só como "a vigiar". Variabilidade
        mistura farmacocinética com adesão — dose esquecida derruba cmax e pode confundir
        o sinal. Apple State of Mind tem sampling bias.
      </p>
    </section>
  )
}
