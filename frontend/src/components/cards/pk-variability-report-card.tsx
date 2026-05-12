/**
 * PKVariabilityReportCard — bloco textual destacável que surge SOMENTE
 * quando há sinal forte (|r|≥0.3, n≥20, p<0.05) em ao menos 1 das 9
 * combinações (3 substâncias × 3 métricas) sobre 60 dias.
 *
 * Pareado com PKVariabilityHumorLab e PKVariabilityHeatmap; serve como
 * resumo proativo de "vale a pena olhar". Se zero sinais, retorna null
 * (componente invisível, sem ruído visual).
 *
 * IMPORTANTE: o texto explicita "não causal" e "variabilidade inclui
 * efeito de adesão". Decisão consciente do plano (Anders 2026-05-12) —
 * sem filtro de adesão.
 */

import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  useConcentrationSeries,
  useDoses,
  useSubstances,
  type ConcentrationSeriesPoint,
} from '@/lib/api'
import { DEFAULT_PK_BODY_WEIGHT_KG } from '@/utils/pharmacokinetics'
import {
  substanceToPKMedication,
  toPKDoses,
} from '@/utils/intraday-correlation'
import {
  analyzePkVariabilityVsMood,
  hasStrongVariabilitySignal,
  PK_VARIABILITY_METRICS,
  PK_VARIABILITY_METRIC_LABELS,
  type PKVariabilityHypothesis,
  type PKVariabilityMetric,
  type PKVariabilityRow,
} from '@/utils/pk-variability'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'

const SUBSTANCE_IDS = ['escitalopram', 'lamotrigine', 'lisdexamfetamine'] as const
const ANALYSIS_DAYS = 60
const DOSES_HOURS = 24 * 90

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

interface StrongSignal {
  substanceId: string
  substanceName: string
  metric: PKVariabilityMetric
  bestRow: PKVariabilityRow
  bestLagDays: number
  hypothesis: PKVariabilityHypothesis
}

function metricVerb(metric: PKVariabilityMetric): string {
  if (metric === 'tir') return 'tempo no range terapêutico'
  if (metric === 'swing') return 'swing intra-dia'
  return 'variabilidade do pico (CV%)'
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
  return (
    `${substanceName} · ${metricVerb(metric)}: quando ${metric === 'tir' ? 'aumenta' : 'sobe'}, ` +
    `humor ${direction} ${lagText} (r=${r.toFixed(2)}, n=${bestRow.n}, p=${bestRow.result!.pValue.toFixed(3)}).${q1q4}.`
  )
}

interface Props {
  snapshots: DailySnapshot[]
  weightKg?: number
}

export function PKVariabilityReportCard({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: substances = [] } = useSubstances()
  const { data: doses = [] } = useDoses(DOSES_HOURS)

  const fromIso = useMemo(() => isoDaysAgo(ANALYSIS_DAYS), [])
  const toIso = useMemo(() => isoToday(), [])

  const lex = useConcentrationSeries('escitalopram', fromIso, toIso, weightKg)
  const lam = useConcentrationSeries('lamotrigine', fromIso, toIso, weightKg)
  const lis = useConcentrationSeries('lisdexamfetamine', fromIso, toIso, weightKg)

  const lexSeries = lex.data?.series
  const lamSeries = lam.data?.series
  const lisSeries = lis.data?.series

  const signals = useMemo<StrongSignal[]>(() => {
    const seriesByKey: Record<string, ConcentrationSeriesPoint[]> = {
      escitalopram: lexSeries ?? [],
      lamotrigine: lamSeries ?? [],
      lisdexamfetamine: lisSeries ?? [],
    }
    const result: StrongSignal[] = []
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
        )
        const bestRow = hypothesis.rows.find((r) => r.lagDays === hypothesis.bestLagDays)
        if (hasStrongVariabilitySignal(bestRow) && bestRow && hypothesis.bestLagDays != null) {
          result.push({
            substanceId: subId,
            substanceName: hypothesis.substanceName,
            metric,
            bestRow,
            bestLagDays: hypothesis.bestLagDays,
            hypothesis,
          })
        }
      }
    }
    return result.sort(
      (a, b) => Math.abs(b.bestRow.result!.r) - Math.abs(a.bestRow.result!.r),
    )
  }, [substances, lexSeries, lamSeries, lisSeries, doses, snapshots, weightKg])

  if (signals.length === 0) return null

  return (
    <section className="rounded-[1.5rem] border border-teal-300/60 bg-gradient-to-br from-teal-50 via-white to-violet-50 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-teal-700">
          <Sparkles className="h-3 w-3" />
          Sinal de variabilidade detectado
        </span>
        <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">
          {signals.length === 1 ? '1 hipótese' : `${signals.length} hipóteses`}
        </span>
      </div>
      <h3 className="mt-3 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-900">
        Variabilidade da concentração × humor ({ANALYSIS_DAYS}d)
      </h3>
      <ul className="mt-3 space-y-2.5">
        {signals.map((sig) => (
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
                {sig.bestRow.quality} · lag pico {sig.bestLagDays}d
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.7rem] leading-5 text-slate-500">
        <span className="font-semibold text-slate-700">Como ler:</span> hipóteses
        exploratórias, não causalidade. Variabilidade aqui mistura farmacocinética com
        adesão — dose esquecida derruba cmax e pode confundir o sinal. Apple State of
        Mind tem sampling bias. Use o PK Variability Lab abaixo pra explorar lag e
        análise quartil em detalhe.
      </p>
    </section>
  )
}
