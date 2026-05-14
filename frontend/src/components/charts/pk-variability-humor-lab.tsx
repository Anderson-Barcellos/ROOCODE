/**
 * PKVariabilityHumorLab — Investiga se VARIABILIDADE da concentração
 * (não o nível) correlaciona com humor.
 *
 * 3 métricas selecionáveis:
 *   - CV% inter-dia: consistência do pico (drug forgiveness, Boissel 2002)
 *   - Swing intra-dia: amplitude diária empírica (Cmax−Cmin)
 *   - Time in Range: horas/dia dentro do therapeutic_range
 *
 * Para cada (substância, métrica), faz lag sweep 0-3d com Pearson + análise
 * quartil Q1×Q4 (capta sweet-spot em U que correlação linear perde).
 *
 * Estética e mental model copiados do MoodLagHypothesisLab (mesma aba Insights).
 */

import { useMemo, useState } from 'react'
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
import {
  analyzePkVariabilityVsMood,
  getPkVariabilityAnalysisWindow,
  hasStrongVariabilitySignal,
  PK_VARIABILITY_METRICS,
  PK_VARIABILITY_METRIC_DESCRIPTIONS,
  PK_VARIABILITY_METRIC_LABELS,
  PK_VARIABILITY_METRIC_UNITS,
  type PKVariabilityHypothesis,
  type PKVariabilityMetric,
  type PKVariabilityQuality,
  type PKVariabilityRow,
} from '@/utils/pk-variability'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'

// Substâncias com farmacocinética relevante pra análise de variabilidade.
// Clonazepam fora: dose ansiolítica baixa não gera swing detectável (ACHADO #1+#2 BACKLOG).
const VARIABILITY_SUBSTANCE_IDS = ['lexapro', 'lamictal', 'venvanse']

const QUALITY_LABEL: Record<PKVariabilityQuality, string> = {
  insufficient: 'dados insuficientes',
  partial: 'parcial',
  observable: 'observável',
}

const QUALITY_CLASS: Record<PKVariabilityQuality, string> = {
  insufficient: 'border-slate-200 bg-slate-50 text-slate-500',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  observable: 'border-teal-200 bg-teal-50 text-teal-800',
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'sem dado'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatNumber(value, digits)}`
}

function describeBestLag(hypothesis: PKVariabilityHypothesis): string {
  const { bestLagDays, bestResult, metric, substanceName } = hypothesis
  if (bestLagDays == null || bestResult == null) {
    return `Sem lag com ≥10 pares pareados (substância × humor). Aumente o range ou logue mais doses.`
  }
  const direction = bestResult.r > 0 ? 'sobe' : 'cai'
  const verbo = metric === 'tir' ? 'tempo no range' : 'variabilidade'
  const quando = bestLagDays === 0 ? 'no mesmo dia' : `${bestLagDays}d depois`
  return `Quando ${verbo} de ${substanceName} aumenta, humor tende a ${direction} ${quando} (r=${bestResult.r.toFixed(2)}, n=${bestResult.n}).`
}

function describeQuartile(row: PKVariabilityRow | undefined, metric: PKVariabilityMetric): string {
  if (!row || row.q1q4Delta == null) {
    return 'Quartis indisponíveis (precisa ≥8 dias pareados pra Q1 e Q4).'
  }
  const metricName = metric === 'tir' ? 'tempo no range' : 'variabilidade'
  if (Math.abs(row.q1q4Delta) < 0.05) {
    return `Q1 (baixo ${metricName}) e Q4 (alto ${metricName}) têm humor parecido — sem extremo doloroso detectado.`
  }
  const direction = row.q1q4Delta > 0 ? 'maior' : 'menor'
  return `Dias com mais ${metricName} têm humor médio ${direction} que dias com menos ${metricName} (Δ=${formatSigned(row.q1q4Delta, 2)}).`
}

function availableSubstances(substances: Substance[]): Substance[] {
  return substances.filter((s) => {
    if (!VARIABILITY_SUBSTANCE_IDS.includes(s.id)) return false
    if (s.bioavailability == null || s.half_life_hours == null) return false
    if (s.ka_per_hour == null) return false
    if (s.vd_l_per_kg == null && s.vd_l == null) return false
    return true
  })
}

interface Props {
  snapshots: DailySnapshot[]
  weightKg?: number
}

export function PKVariabilityHumorLab({ snapshots, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: substances = [] } = useSubstances()
  const analysisWindow = useMemo(() => getPkVariabilityAnalysisWindow(snapshots), [snapshots])
  const { data: doses = [] } = useDoses(analysisWindow.doseHours)

  const subs = useMemo(() => availableSubstances(substances), [substances])

  const [substanceId, setSubstanceId] = useState<string>(VARIABILITY_SUBSTANCE_IDS[0])
  const [metric, setMetric] = useState<PKVariabilityMetric>('cv')

  // Garante que substanceId aponta pra algo disponível assim que carregar
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

  const hypothesis = useMemo<PKVariabilityHypothesis | null>(() => {
    const substance = subs.find((s) => s.id === effectiveSubstanceId)
    if (!substance) return null
    const med = substanceToPKMedication(substance)
    if (!med) return null
    const series: ConcentrationSeriesPoint[] = pkPayload?.series ?? []
    if (series.length === 0) return null
    const subDoses = toPKDoses(doses.filter((d) => d.substance === substance.id))
    return analyzePkVariabilityVsMood(
      substance.id,
      substance.display_name.split(' ')[0],
      metric,
      snapshots,
      series,
      med,
      subDoses,
      weightKg,
    )
  }, [subs, effectiveSubstanceId, pkPayload, doses, snapshots, metric, weightKg])

  const lag0 = hypothesis?.rows.find((r) => r.lagDays === 0)
  const bestRow = hypothesis?.rows.find((r) => r.lagDays === hypothesis?.bestLagDays)
  const showStrongBanner = hasStrongVariabilitySignal(bestRow)

  const seriesLength = pkPayload?.series.length ?? 0

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
            Testa se concentrações irregulares OU muito estáveis correlacionam com humor. CV% inter-dia, swing intra-dia e tempo no range terapêutico — em lags 0–3d.
            Análise quartil Q1×Q4 capta sweet spot em U que Pearson sozinho perde.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          <FlaskConical className="h-3.5 w-3.5" />
          base {analysisWindow.spanDays}d · humor pareado: {hypothesis?.realMoodDays ?? 0}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {PK_VARIABILITY_METRICS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                metric === m
                  ? 'bg-violet-700 text-white'
                  : 'border border-slate-900/10 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {PK_VARIABILITY_METRIC_LABELS[m]}
            </button>
          ))}
        </div>

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

      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        <span className="font-semibold text-slate-700">{PK_VARIABILITY_METRIC_LABELS[metric]}</span>{' '}
        ({PK_VARIABILITY_METRIC_UNITS[metric]}) — {PK_VARIABILITY_METRIC_DESCRIPTIONS[metric]}
      </p>

      {showStrongBanner && bestRow?.result && (
        <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900">
          <span className="font-semibold">Sinal forte detectado:</span> r={bestRow.result.r.toFixed(2)}, n={bestRow.n}, p={bestRow.result.pValue.toFixed(3)} em lag {hypothesis?.bestLagDays}d. Variabilidade aqui inclui efeito de adesão — não causal.
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-900/10 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                <th className="py-2 pr-3">Lag</th>
                <th className="px-3 py-2">R</th>
                <th className="px-3 py-2">n</th>
                <th className="px-3 py-2">Qualidade</th>
                <th className="px-3 py-2">Humor Q1</th>
                <th className="px-3 py-2">Humor Q4</th>
                <th className="py-2 pl-3">Δ Q4−Q1</th>
              </tr>
            </thead>
            <tbody>
              {hypothesis?.rows.map((row) => (
                <tr key={row.lagDays} className="border-b border-slate-900/5 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">
                    {row.lagDays === 0 ? '0d' : `+${row.lagDays}d`}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">
                    {row.result ? row.result.r.toFixed(3) : 'sem dado'}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.n}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-bold ${QUALITY_CLASS[row.quality]}`}
                    >
                      {QUALITY_LABEL[row.quality]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatNumber(row.q1Mood)}</td>
                  <td className="px-3 py-2 text-slate-500">{formatNumber(row.q4Mood)}</td>
                  <td className="py-2 pl-3 font-mono text-xs font-semibold text-slate-700">
                    {formatSigned(row.q1q4Delta)}
                  </td>
                </tr>
              ))}
              {!hypothesis && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-slate-400">
                    {isFetching ? 'Carregando série…' : 'Sem dados disponíveis pra essa combinação.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-slate-900/10 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Hipótese atual
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {hypothesis?.metricLabel ?? PK_VARIABILITY_METRIC_LABELS[metric]}{' '}
            <span className="font-normal text-slate-500">
              ({hypothesis?.substanceName ?? 'substância'})
            </span>
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {hypothesis ? describeBestLag(hypothesis) : 'Selecione substância e métrica acima.'}
          </p>
          {lag0 && (
            <p className="mt-2 text-xs leading-5 text-slate-500">{describeQuartile(lag0, metric)}</p>
          )}
          <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-700">Ressalvas:</span> emoções momentâneas têm
            sampling bias (logadas quando algo chama atenção). LHL drugs (Lexapro/Lamictal) têm
            swing baixo natural — desvios são sinal real. Venvanse (t½=11h) tem swing alto
            fisiológico. Variabilidade mistura PK + adesão — não causal. Base de cálculo: todo
            histórico real disponível no dashboard, mesmo que a UI esteja exibindo um recorte.
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
