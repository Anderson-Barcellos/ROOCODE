/**
 * PKVariabilityHeatmap — visão panorâmica 3×3 (substância × métrica de
 * variabilidade). Complementa o PKVariabilityHumorLab mostrando o melhor
 * lag de cada combinação de uma vez só.
 *
 * Cada célula = Pearson r no lag de pico (entre 0-3d). Estrela ★ quando
 * q-FDR (Benjamini-Hochberg sobre os 9 testes) < 0.05.
 *
 * IMPORTANTE: leituras inter-substância NÃO são comparáveis em absoluto.
 * Lexapro/Lamictal são LHL (swing baixo natural); Venvanse é SHL (swing
 * alto fisiológico). Cada célula deve ser lida DENTRO do contexto da
 * substância da linha — nunca cruzando.
 */

import { useMemo, useState } from 'react'

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
  benjaminiHochbergFdr,
} from '@/utils/intraday-correlation'
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
} from '@/utils/pk-variability'
import { HeatmapCell, type HeatmapCellEstimate } from '@/components/charts/shared/heatmap-cell'
import { formatCi, formatP, formatR } from '@/components/charts/shared/heatmap-helpers'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'

const SUBSTANCE_IDS = ['lexapro', 'lamictal', 'venvanse'] as const

interface SubstanceCell {
  substanceId: string
  substanceName: string
  estimates: Record<PKVariabilityMetric, HeatmapCellEstimate | null>
  bestMetric: PKVariabilityMetric | null
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

export function PKVariabilityHeatmap({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState<SelectedHeatmapCell | null>(null)
  const { data: substances = [] } = useSubstances()
  const analysisWindow = useMemo(() => getPkVariabilityAnalysisWindow(snapshots), [snapshots])
  const { data: doses = [] } = useDoses(analysisWindow.doseHours)

  // 3 hooks pra cobrir as 3 substâncias. TanStack Query dedup por queryKey.
  const lex = useConcentrationSeries('lexapro', analysisWindow.fromIso, analysisWindow.toIso, weightKg)
  const lam = useConcentrationSeries('lamictal', analysisWindow.fromIso, analysisWindow.toIso, weightKg)
  const lis = useConcentrationSeries('venvanse', analysisWindow.fromIso, analysisWindow.toIso, weightKg)

  const seriesByKey = useMemo<Record<string, ConcentrationSeriesPoint[]>>(() => ({
    lexapro: lex.data?.series ?? [],
    lamictal: lam.data?.series ?? [],
    venvanse: lis.data?.series ?? [],
  }), [lex.data, lam.data, lis.data])

  const isFetching = lex.isFetching || lam.isFetching || lis.isFetching

  const cells = useMemo<SubstanceCell[]>(() => {
    const result: SubstanceCell[] = []

    // Coleta todas as hipóteses por (substância × métrica)
    const flat: Array<{
      substanceId: string
      substanceName: string
      metric: PKVariabilityMetric
      hypothesis: PKVariabilityHypothesis | null
    }> = []

    for (const subId of SUBSTANCE_IDS) {
      const sub: Substance | undefined = substances.find((s) => s.id === subId)
      const subName = sub?.display_name.split(' ')[0] ?? subId
      const med = sub ? substanceToPKMedication(sub) : null
      const series = seriesByKey[subId] ?? []
      const subDoses = toPKDoses(doses.filter((d) => d.substance === subId))

      for (const metric of PK_VARIABILITY_METRICS) {
        const hypothesis =
          med && series.length > 0
            ? analyzePkVariabilityVsMood(
                subId,
                subName,
                metric,
                snapshots,
                series,
                med,
                subDoses,
                weightKg,
              )
            : null
        flat.push({ substanceId: subId, substanceName: subName, metric, hypothesis })
      }
    }

    // FDR Benjamini-Hochberg sobre os 9 melhores p-values
    const pValues = flat.map((item) => item.hypothesis?.bestResult?.pValue ?? null)
    const qValues = benjaminiHochbergFdr(pValues)

    for (const subId of SUBSTANCE_IDS) {
      const subItems = flat.filter((it) => it.substanceId === subId)
      const estimates: Record<PKVariabilityMetric, HeatmapCellEstimate | null> = {
        cv: null,
        swing: null,
        tir: null,
      }

      for (const item of subItems) {
        const best = item.hypothesis?.bestResult
        const idx = flat.indexOf(item)
        if (best && Number.isFinite(best.r)) {
          estimates[item.metric] = {
            r: best.r,
            n: best.n,
            p: best.pValue,
            qFdr: qValues[idx],
          }
        }
      }

      // bestMetric = a métrica com maior |r| pra dar destaque visual
      let bestMetric: PKVariabilityMetric | null = null
      let bestAbs = 0
      for (const m of PK_VARIABILITY_METRICS) {
        const est = estimates[m]
        if (est && Math.abs(est.r) > bestAbs) {
          bestAbs = Math.abs(est.r)
          bestMetric = m
        }
      }

      result.push({
        substanceId: subId,
        substanceName: subItems[0]?.substanceName ?? subId,
        estimates,
        bestMetric,
      })
    }

    return result
  }, [substances, seriesByKey, doses, snapshots, weightKg])

  const totalSignals = cells.flatMap((c) =>
    PK_VARIABILITY_METRICS.map((m) => c.estimates[m]?.qFdr ?? null),
  ).filter((q) => q != null && Number.isFinite(q) && q < 0.05).length

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Heatmap PK Variability
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Substância × métrica de variabilidade
      </h3>
      <p className="mt-1 text-xs text-slate-500 leading-5">
        r de Pearson no lag de pico (0–3d) entre a métrica de variabilidade e humor diário. FDR Benjamini-Hochberg sobre as 9 células. Base de cálculo: {analysisWindow.spanDays} dias reais disponíveis.
      </p>
      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        <span>Sinais significativos (q &lt; 0.05):</span>
        <span>{totalSignals}</span>
      </p>

      <div className="mt-4 overflow-x-auto">
        <div
          className="grid min-w-[480px] gap-x-1 gap-y-2"
          style={{ gridTemplateColumns: '160px repeat(3, minmax(96px, 1fr))' }}
        >
          <div />
          {PK_VARIABILITY_METRICS.map((m) => (
            <div
              key={m}
              className="text-center text-[0.65rem] font-semibold uppercase tracking-wider text-slate-700"
            >
              {PK_VARIABILITY_METRIC_LABELS[m]}
            </div>
          ))}

          {cells.map((row) => (
            <div key={row.substanceId} className="contents">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: SUBSTANCE_COLORS[row.substanceId] ?? '#8b5cf6' }}
                />
                {row.substanceName}
              </div>
              {PK_VARIABILITY_METRICS.map((m) => {
                const estimate = row.estimates[m]
                const label = `${row.substanceName} · ${PK_VARIABILITY_METRIC_LABELS[m]}`
                const key = `${row.substanceId}-${m}`
                return (
                  <HeatmapCell
                    key={m}
                    label={label}
                    estimate={estimate}
                    isPeak={row.bestMetric === m && estimate != null}
                    selected={selectedHeatmapCell?.key === key}
                    onSelect={estimate ? () => setSelectedHeatmapCell({
                      key,
                      label,
                      detail: describeEstimate(estimate),
                    }) : undefined}
                  />
                )
              })}
            </div>
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
            <span className="font-semibold text-teal-700">Verde/↑</span> = mais variabilidade → humor melhor ·{' '}
            <span className="font-semibold text-red-500">Vermelho/↓</span> = mais variabilidade → humor pior
          </li>
          <li>
            <span className="font-semibold text-amber-600">★</span> = q FDR &lt; 0.05 cross 9 testes ·{' '}
            <span className="font-semibold text-amber-600">borda âmbar</span> = métrica de maior |r| da substância
          </li>
          <li>
            <span className="font-semibold">Cuidado interpretativo:</span> compare apenas DENTRO da mesma substância. LHL drugs (Lexapro/Lamictal) têm swing baixo natural; Venvanse (t½=11h) tem swing alto fisiológico — não são equivalentes em absoluto.
          </li>
          {isFetching && (
            <li className="text-violet-600">Carregando séries de concentração…</li>
          )}
        </ul>
      </div>
    </section>
  )
}
