import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { format, getDay, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Activity, Compass, MoonStar, FlaskConical, Pill, Telescope } from 'lucide-react'
import { TabNav, type TabKey, type RangeOption } from '@/components/navigation/TabNav'
import type { ForecastMode } from '@/hooks/useForecast'
import type { InterpolationMode } from '@/hooks/useInterpolation'
import { ForecastReportModal } from '@/components/charts/ForecastReportModal'
import { SurfaceFrame, MetricGrid, EmptyAnalyticsState } from '@/components/analytics/shared'
import type { AnalyticsMetric, AnalyticsTone } from '@/components/analytics/types'
import DoseLogger from '@/components/DoseLogger'
import DoseCalendarView from '@/components/DoseCalendarView'
import MedicationCatalogEditor from '@/components/MedicationCatalogEditor'
import { ActivityBars } from '@/components/charts/activity-bars'
import { CorrelationHeatmap } from '@/components/charts/correlation-heatmap'
import { SleepDebtHrvCard } from '@/components/charts/sleep-debt-hrv-card'
import { AutonomicBalanceChart } from '@/components/charts/autonomic-balance-chart'
import { MoodTimeline } from '@/components/charts/mood-timeline'
import { PKMedicationGrid } from '@/components/charts/pk-medication-grid'
import { PKHumorCorrelation } from '@/components/charts/pk-humor-correlation'
import { ScatterCorrelation } from '@/components/charts/scatter-correlation'
import { SleepDebtChart } from '@/components/charts/sleep-debt-chart'
import { SleepStagesChart } from '@/components/charts/sleep-stages-chart'
import { Spo2Chart } from '@/components/charts/spo2-chart'
import { LagCorrelationChart } from '@/components/charts/lag-correlation-chart'
import { PKMoodScatterChart } from '@/components/charts/pk-mood-scatter-chart'
import { PKVariabilityHumorLab } from '@/components/charts/pk-variability-humor-lab'
import { PKVariabilityHeatmap } from '@/components/charts/pk-variability-heatmap'
import { PKVariabilityReportCard } from '@/components/cards/pk-variability-report-card'
import { TempHumorCorrelation } from '@/components/charts/temp-humor-correlation'
import { CardioRecoveryChart } from '@/components/charts/cardio-recovery-chart'
import { RespiratoryDisturbancesChart } from '@/components/charts/respiratory-disturbances-chart'
import { HRRangeChart } from '@/components/charts/hr-range-chart'
import { StepsChart } from '@/components/charts/steps-chart'
import { VitalSignsTimeline } from '@/components/charts/vital-signs-timeline'
import { RecoveryScoreChart } from '@/components/charts/recovery-score-chart'
import { LimitingFactorCard } from '@/components/cards/limiting-factor-card'
import { NightQualityCard } from '@/components/cards/night-quality-card'
import { PKCoverageCard } from '@/components/cards/pk-coverage-card'
import { ActivityReadinessCard } from '@/components/cards/activity-readiness-card'
import { WeekdayWeekendCard } from '@/components/charts/weekday-weekend-card'
import { ForecastAccuracyCard } from '@/components/charts/forecast-accuracy-card'
import { Vo2MaxChart } from '@/components/charts/vo2-max-chart'
import { WalkingVitalityChart } from '@/components/charts/walking-vitality-chart'
import { HrvVariabilityChart } from '@/components/charts/hrv-variability-chart'
import { HeartRateReserveChart } from '@/components/charts/heart-rate-reserve-chart'
import { ChronotropicResponseChart } from '@/components/charts/chronotropic-response-chart'
import { InterpolationDemo } from '@/pages/InterpolationDemo'
import { useCardioAnalysis } from '@/hooks/useCardioAnalysis'
import { useRooCodeData } from '@/hooks/useRooCodeData'
import type { DailySnapshot, OverviewMetrics } from '@/types/apple-health'
import { selectSnapshotRange } from '@/utils/aggregation'
import { FULL_HISTORY_DOSE_HOURS, useDoses, useRegimen } from '@/lib/api'
import { computeCoverageStatus } from '@/utils/pk-coverage'
import { computeRecoveryScoreSeries } from '@/utils/recovery-score'
import { rankLimitingFactors, type RecoveryComponentKey } from '@/utils/recovery-score-ranking'

const AI_INTERPOLATION_ENABLED = import.meta.env.VITE_ENABLE_AI_INTERPOLATION === 'true'

function toneFor(value: number | null, positive: number, watch: number, lowerIsBetter = false): AnalyticsTone {
  if (value == null) return 'neutral'
  if (lowerIsBetter) {
    if (value <= positive) return 'positive'
    if (value <= watch) return 'watch'
    return 'negative'
  }
  if (value >= positive) return 'positive'
  if (value >= watch) return 'watch'
  return 'negative'
}

type MetricCluster = {
  title: string
  metrics: AnalyticsMetric[]
}

function buildExecutiveMetrics(
  ov: OverviewMetrics,
  days: { validRealDays: number; validMoodDays: number },
  activity: { steps7d: number | null; vo2Max7d: number | null; walkingSpeed7d: number | null },
  physiology: { respiratoryRate7d: number | null; pulseTemperatureC7d: number | null },
  cardio: { recoveryScore: number | null },
): MetricCluster[] {
  // Fase 5d: KPIs de média-7d só fazem sentido com 7+ dias reais.
  // Abaixo disso, value vira null → MetricGrid mostra "Sem dados".
  const enoughReal = days.validRealDays >= 7
  const enoughMood = days.validMoodDays >= 7
  const sleep = enoughReal ? ov.sleep7dHours : null
  const hrv = enoughReal ? ov.hrv7d : null
  const rhr = enoughReal ? ov.restingHeartRate7d : null
  const mood = enoughMood ? ov.mood7d : null
  // Score composto HRV(40%) + FC(30%) + Sono(30%) já calculado em useCardioAnalysis;
  // resgatado aqui pra encabeçar o cluster como métrica consolidada.
  const recovery = enoughReal ? cardio.recoveryScore : null
  const moodScale5 = mood != null ? ((Math.max(-1, Math.min(1, mood)) + 1) / 2) * 5 : null
  const moodText =
    moodScale5 != null
      ? moodScale5.toFixed(1).replace('.', ',')
      : null
  const moodDetail =
    mood == null
      ? null
      : mood >= 0.35
        ? 'tendência positiva'
        : mood >= -0.1
          ? 'estável'
          : 'em baixa'
  const kcal = enoughReal ? ov.activeEnergy7dKcal : null
  const exMin = enoughReal ? ov.exercise7dMinutes : null
  // Fase 8A — novos KPIs Activity/Physiology
  const steps = enoughReal ? activity.steps7d : null
  const vo2 = enoughReal ? activity.vo2Max7d : null
  const walkingSpeed = enoughReal ? activity.walkingSpeed7d : null
  // Fase 9D — vitals sem viz dedicada, exibidos como KPIs clínicos
  const rpm = enoughReal ? physiology.respiratoryRate7d : null
  const wristTemp = enoughReal ? physiology.pulseTemperatureC7d : null
  return [
    {
      title: 'Sono e Recuperação',
      metrics: [
        { label: 'Recuperação 7d', value: recovery, unit: '', tone: toneFor(recovery, 70, 40) },
        { label: 'Sono 7d', value: sleep, unit: 'h', tone: toneFor(sleep, 7, 6) },
        { label: 'HRV 7d', value: hrv, unit: 'ms', tone: toneFor(hrv, 40, 25) },
        { label: 'FC Repouso 7d', value: rhr, unit: 'bpm', tone: toneFor(rhr, 60, 70, true) },
        {
          // Freq. respiratória em repouso adulto: 12-20 rpm normal; acima = taquipneia.
          // Bradipneia <12 raro neste perfil farmacológico, mas tratado como 'watch'.
          label: 'Freq. resp. 7d',
          value: rpm,
          unit: 'rpm',
          tone: rpm == null
            ? 'neutral'
            : rpm > 20
            ? 'negative'
            : rpm >= 16
            ? 'watch'
            : rpm >= 12
            ? 'positive'
            : 'watch',
        },
        {
          // Temperatura de pulso noturna (wrist temp absoluto °C) — faixa estável
          // 35.5-36.8 em repouso. >37.0 sinaliza possível febre incipiente; <35.5
          // merece atenção ('watch') mas pode ser variação normal de periferia.
          label: 'Temp. pulso 7d',
          value: wristTemp,
          unit: '°C',
          tone: wristTemp == null
            ? 'neutral'
            : wristTemp >= 37.0
            ? 'negative'
            : wristTemp >= 36.8
            ? 'watch'
            : wristTemp >= 35.5
            ? 'positive'
            : 'watch',
        },
      ],
    },
    {
      title: 'Atividade e Energia',
      metrics: [
        {
          label: 'Passos 7d',
          value: steps != null ? Math.round(steps) : null,
          unit: '',
          tone: toneFor(steps, 10000, 7500),
        },
        {
          label: 'Exercício 7d',
          value: exMin,
          unit: 'min',
          tone: exMin == null ? 'neutral' : exMin >= 30 ? 'positive' : 'watch',
        },
        { label: 'Energia ativa 7d', value: kcal, unit: 'kcal', tone: toneFor(kcal, 400, 200) },
        { label: 'VO2 Máx 7d', value: vo2, unit: '', tone: toneFor(vo2, 45, 37) },
        { label: 'Vel. marcha 7d', value: walkingSpeed, unit: 'km/h', tone: toneFor(walkingSpeed, 5.5, 4.5) },
      ],
    },
    {
      title: 'Humor',
      metrics: [
        {
          label: 'Humor médio 7d',
          value: moodText,
          unit: '/5',
          detail: moodDetail,
          tone: mood == null
            ? 'neutral'
            : mood >= 0.35
            ? 'positive'
            : mood >= -0.1
            ? 'watch'
            : 'negative',
        },
      ],
    },
  ]
}

const LIMITING_LABEL: Record<RecoveryComponentKey, string> = {
  hrv: 'autonômico baixo (HRV)',
  sleepEff: 'sono fragmentado',
  rhr: 'FC de repouso elevada',
  sleepDebt: 'débito de sono acumulado',
  mood: 'humor em baixa',
}

function mean(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (!numeric.length) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

function computeSleepSummaryLine(snapshots: Parameters<typeof computeRecoveryScoreSeries>[0]): string {
  const real = snapshots.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted)
  const recent = real
    .filter((snapshot) => (snapshot.health?.sleepTotalHours ?? 0) > 0)
    .slice(-7)

  const avgSleep = mean(recent.map((snapshot) => snapshot.health?.sleepTotalHours ?? null))
  const avgEfficiency = mean(recent.map((snapshot) => snapshot.health?.sleepEfficiencyPct ?? null))

  const weekdaySleep = mean(
    real
      .filter((snapshot) => {
        const day = getDay(parseISO(snapshot.date))
        return day >= 1 && day <= 5
      })
      .map((snapshot) => snapshot.health?.sleepTotalHours ?? null),
  )
  const weekendSleep = mean(
    real
      .filter((snapshot) => {
        const day = getDay(parseISO(snapshot.date))
        return day === 0 || day === 6
      })
      .map((snapshot) => snapshot.health?.sleepTotalHours ?? null),
  )

  const fmt1 = (value: number) => value.toFixed(1).replace('.', ',')
  const target = 7.5

  const summaryLead =
    avgSleep != null
      ? `Últimas 7 noites: média ${fmt1(avgSleep)}h (${avgSleep - target >= 0 ? '+' : ''}${fmt1(avgSleep - target)}h vs meta ${fmt1(target)}h).`
      : 'Últimas 7 noites: dados ainda insuficientes para média robusta.'

  const efficiencyText =
    avgEfficiency != null
      ? ` Eficiência ${Math.round(avgEfficiency)}% (alvo 85%).`
      : ' Eficiência sem dados suficientes no período.'

  const patternText =
    weekdaySleep != null && weekendSleep != null
      ? weekendSleep - weekdaySleep >= 0.8
        ? ' Padrão: você dorme melhor no fim de semana que nos dias úteis.'
        : weekendSleep - weekdaySleep <= -0.8
          ? ' Padrão: sono pior no fim de semana do que nos dias úteis.'
          : ' Padrão: sem diferença relevante entre úteis e fim de semana.'
      : ' Padrão semanal ainda em coleta.'

  return `${summaryLead}${efficiencyText}${patternText}`
}

type PanoramaConfidenceTier = 'robusta' | 'parcial' | 'baixa'

interface PanoramaConfidence {
  tier: PanoramaConfidenceTier
  label: string
  detail: string
  className: string
}

function computePanoramaConfidence({
  snapshotsInRange,
  score,
  completeness,
  confidence,
  derivedFromInterpolated,
}: {
  snapshotsInRange: DailySnapshot[]
  score: number | null
  completeness: number
  confidence: number
  derivedFromInterpolated: boolean
}): PanoramaConfidence {
  const realDays = snapshotsInRange.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted).length
  const interpolatedDays = snapshotsInRange.filter((snapshot) => snapshot.interpolated).length
  const completenessPct = Math.round(completeness * 100)
  const confidencePct = Math.round(confidence * 100)

  if (score == null || realDays < 3) {
    return {
      tier: 'baixa',
      label: 'Confiança baixa',
      detail: `${realDays} dias reais na janela · score ${score == null ? 'indisponível' : 'parcial'}`,
      className: 'border-rose-200 bg-rose-50 text-rose-800',
    }
  }

  if (realDays < 7 || completeness < 0.8 || confidence < 0.9 || derivedFromInterpolated || interpolatedDays > 0) {
    const caveats = [
      realDays < 7 ? `${realDays} dias reais` : null,
      completeness < 0.8 ? `${completenessPct}% dos inputs` : null,
      confidence < 0.9 ? `${confidencePct}% confiança` : null,
      derivedFromInterpolated || interpolatedDays > 0 ? `${interpolatedDays} dia(s) interpolado(s)` : null,
    ].filter(Boolean)

    return {
      tier: 'parcial',
      label: 'Confiança parcial',
      detail: caveats.join(' · '),
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }

  return {
    tier: 'robusta',
    label: 'Confiança robusta',
    detail: `${realDays} dias reais · ${completenessPct}% dos inputs · sem interpolação relevante`,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
}

function buildPanoramaActions({
  status,
  limiter,
  pkConcern,
}: {
  status: 'green' | 'yellow' | 'red' | 'neutral'
  limiter: RecoveryComponentKey | null
  pkConcern: string | null
}): string[] {
  const actions: string[] = []

  if (status === 'red') {
    actions.push('Priorizar recuperação nas próximas 24h: baixa carga, sono e regularidade.')
  } else if (status === 'yellow') {
    actions.push('Manter carga moderada e evitar treino/decisão de alto custo se sintomas aparecerem.')
  } else if (status === 'green') {
    actions.push('Janela favorável para carga planejada, mantendo checagem subjetiva antes de intensificar.')
  } else {
    actions.push('Aguardar dados suficientes antes de tomar decisão pelo painel.')
  }

  const limiterAction: Partial<Record<RecoveryComponentKey, string>> = {
    hrv: 'Limitante autonômico: preferir Z2 leve, respiração/descanso e monitorar HRV amanhã.',
    sleepEff: 'Sono fragmentado: reduzir estimulantes tardios e proteger janela de dormir hoje.',
    rhr: 'FC repouso elevada: tratar como sinal de carga sistêmica; hidratação e menor intensidade.',
    sleepDebt: 'Débito de sono: pagar parte da dívida antes de buscar performance.',
    mood: 'Humor em baixa: priorizar rotina simples, luz/manhã e reduzir decisões pesadas.',
  }
  if (limiter) actions.push(limiterAction[limiter] ?? `Fator limitante: ${LIMITING_LABEL[limiter]}.`)

  if (pkConcern === 'vulnerabilidade') {
    actions.push('PK subterapêutico: conferir log/regime antes de interpretar queda de humor como primária.')
  } else if (pkConcern === 'queda') {
    actions.push('PK em queda: monitorar próxima janela de dose e sintomas de vale.')
  } else if (pkConcern === 'acima_faixa') {
    actions.push('PK acima da faixa: considerar concentração como confundidor de sono/humor hoje.')
  } else if (pkConcern === 'cobertura_incompleta') {
    actions.push('Cobertura incompleta: revisar registros de dose antes de concluir falha farmacológica.')
  }

  return actions.slice(0, 3)
}

function MockBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <span className="font-semibold">Dados simulados</span>
      <span className="text-amber-700/80">
        — 14 dias mock (VITE_USE_MOCK=true). Configure AutoExport para dados reais.
      </span>
    </div>
  )
}

function DecisionSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
        <h3 className="mt-1 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

function LabGroup({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[1.75rem] border border-slate-900/10 bg-slate-50/70 p-4 shadow-inner shadow-white/50">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
        <h3 className="mt-1 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

interface InterpolationBannerProps {
  mode: InterpolationMode
  loading: boolean
  error: boolean
  filledCount: number
}

function InterpolationBanner({ mode, loading, error, filledCount }: InterpolationBannerProps) {
  if (mode === 'off') return null

  const palette =
    mode === 'claude'
      ? { border: 'border-teal-200', bg: 'bg-teal-50', strong: 'text-teal-900', soft: 'text-teal-700/80' }
      : { border: 'border-amber-200', bg: 'bg-amber-50', strong: 'text-amber-900', soft: 'text-amber-700/80' }

  const label = mode === 'claude' ? 'Interpolação IA' : 'Interpolação linear'
  const status = loading
    ? ' — modelo de IA preenchendo lacunas…'
    : error
    ? ' — Erro na chamada IA, usando linear como fallback.'
    : filledCount > 0
    ? ` — ${filledCount} ${filledCount === 1 ? 'dia preenchido' : 'dias preenchidos'}. Pontos estimados aparecem tracejados nos charts.`
    : ' — sem lacunas no intervalo atual.'

  return (
    <div className={`mb-4 flex items-center gap-2 rounded-xl border ${palette.border} ${palette.bg} px-4 py-2.5 text-sm ${palette.strong}`}>
      <span className="font-semibold">{label}</span>
      <span className={palette.soft}>{status}</span>
    </div>
  )
}

interface ForecastBannerProps {
  mode: ForecastMode
  loading: boolean
  error: boolean
  errorMessage: string | null
  forecastedCount: number
}

function ForecastBanner({ mode, loading, error, errorMessage, forecastedCount }: ForecastBannerProps) {
  if (mode === 'off') return null
  const status = loading
    ? ' — modelo de IA gerando projeção…'
    : error
    ? ` — ${errorMessage ?? 'Erro na chamada IA. Tente novamente.'}`
    : forecastedCount > 0
    ? ` — ${forecastedCount} dias projetados. Pontos pontilhados indicam estimativas futuras.`
    : ' — Aguardando dados suficientes (≥7 dias reais).'
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
      <span className="font-semibold">🔮 Projeção IA</span>
      <span className="text-violet-700/80">{status}</span>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('panorama')
  const [range, setRange] = useState<RangeOption>('30d')
  const [hash, setHash] = useState(() => window.location.hash)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [interpolation, setInterpolationState] = useState<InterpolationMode>(() => {
    const saved = localStorage.getItem('roocode-interpolation')
    if (saved === 'off' || saved === 'linear') return saved
    if (saved === 'claude' && AI_INTERPOLATION_ENABLED) return saved
    return 'linear'
  })
  const setInterpolation = (mode: InterpolationMode) => {
    const nextMode = mode === 'claude' && !AI_INTERPOLATION_ENABLED ? 'linear' : mode
    setInterpolationState(nextMode)
    localStorage.setItem('roocode-interpolation', nextMode)
  }
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const data = useRooCodeData(interpolation, 'on')
  const dosesQuery = useDoses(FULL_HISTORY_DOSE_HOURS)
  const regimenQuery = useRegimen(true)
  const ranged = useMemo(() => selectSnapshotRange(data.snapshots, range), [data.snapshots, range])
  const todayIso = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const rangedWithForecast = useMemo(
    () =>
      data.forecastedSnapshots.length > 0
        ? [...ranged, ...data.forecastedSnapshots]
        : ranged,
    [ranged, data.forecastedSnapshots],
  )
  const allWithForecast = useMemo(
    () =>
      data.forecastedSnapshots.length > 0
        ? [...data.snapshots, ...data.forecastedSnapshots]
        : data.snapshots,
    [data.snapshots, data.forecastedSnapshots],
  )
  const cardio = useCardioAnalysis(data.snapshots)
  // Fase 8A — agregações 7d pros novos KPIs Activity/Physiology
  // Fase 9D — adicionada physiology (vitals sem chart dedicado)
  const { activitySummary, physiologySummary } = useMemo(() => {
    const last7 = selectSnapshotRange(data.snapshots, '7d').filter((s) => !s.interpolated)
    const avg = (values: Array<number | null | undefined>): number | null => {
      const numeric = values.filter((v): v is number => typeof v === 'number')
      return numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null
    }
    return {
      activitySummary: {
        steps7d: avg(last7.map((s) => s.health?.steps)),
        vo2Max7d: avg(last7.map((s) => s.health?.vo2Max)),
        walkingSpeed7d: avg(last7.map((s) => s.health?.walkingSpeedKmh)),
      },
      physiologySummary: {
        respiratoryRate7d: avg(last7.map((s) => s.health?.respiratoryRate)),
        pulseTemperatureC7d: avg(last7.map((s) => s.health?.pulseTemperatureC)),
      },
    }
  }, [data.snapshots])
  const executiveMetrics = useMemo(
    () =>
      buildExecutiveMetrics(
        data.overview,
        {
          validRealDays: data.validRealDays,
          validMoodDays: data.validMoodDays,
        },
        activitySummary,
        physiologySummary,
        { recoveryScore: cardio.recoveryScore?.score ?? null },
      ),
    [
      data.overview,
      data.validRealDays,
      data.validMoodDays,
      activitySummary,
      physiologySummary,
      cardio.recoveryScore,
    ],
  )
  const dailyVerdict = useMemo(() => {
    // Usa apenas snapshots reais para evitar drift com forecast no resumo diário.
    const series = computeRecoveryScoreSeries(data.snapshots)
    const latestIdx = [...series].reverse().findIndex((point) => point.score != null && point.components != null)
    const idxFromEnd = latestIdx >= 0 ? latestIdx : null
    const idx = idxFromEnd != null ? series.length - 1 - idxFromEnd : null
    const latest = idx != null ? series[idx] : null
    const latestDate = idx != null ? data.snapshots[idx]?.date ?? null : null
    const topFactor = latest?.components
      ? rankLimitingFactors(latest.components)[0]?.component
      : null

    const score = latest?.score ?? null
    let status: 'green' | 'yellow' | 'red' | 'neutral' = 'neutral'
    let title = 'Aguardando dados'

    if (score != null) {
      if (score >= 66) {
        status = 'green'
        title = 'Pronto para impacto'
      } else if (score >= 33) {
        status = 'yellow'
        title = 'Carga moderada recomendada'
      } else {
        status = 'red'
        title = 'Dia de recuperação prioritária'
      }
    }

    const limiterText = topFactor ? LIMITING_LABEL[topFactor] : null

    const coverageStatuses = computeCoverageStatus(dosesQuery.data ?? [], regimenQuery.data ?? [])
    const adequateCount = coverageStatuses.filter((status) => status.klass === 'adequada').length
    const totalCoverage = coverageStatuses.length
    const pkConcern = ['vulnerabilidade', 'acima_faixa', 'cobertura_incompleta', 'queda']
      .find((klass) => coverageStatuses.some((status) => status.klass === klass)) ?? null
    const pkText = totalCoverage > 0 ? `${adequateCount}/${totalCoverage} substâncias na faixa` : 'Sem dados PK'
    const actions = buildPanoramaActions({ status, limiter: topFactor, pkConcern })

    return {
      status,
      title,
      score,
      limiter: topFactor,
      limiterText,
      pkText,
      pkConcern,
      latestDate,
      actions,
      completeness: latest?.completeness ?? 0,
      confidence: latest?.confidence ?? 0,
      derivedFromInterpolated: latest?.derivedFromInterpolated ?? false,
    }
  }, [data.snapshots, dosesQuery.data, regimenQuery.data])
  const panoramaConfidence = useMemo(
    () => computePanoramaConfidence({
      snapshotsInRange: ranged,
      score: dailyVerdict.score,
      completeness: dailyVerdict.completeness,
      confidence: dailyVerdict.confidence,
      derivedFromInterpolated: dailyVerdict.derivedFromInterpolated,
    }),
    [ranged, dailyVerdict.score, dailyVerdict.completeness, dailyVerdict.confidence, dailyVerdict.derivedFromInterpolated],
  )
  const sleepSummaryLine = useMemo(() => computeSleepSummaryLine(data.snapshots), [data.snapshots])
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (hash === '#interpolation-demo') return <InterpolationDemo />

  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <>
      <TabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        range={range}
        onRangeChange={setRange}
        interpolation={interpolation}
        onInterpolationChange={setInterpolation}
        interpolationLoading={data.interpolationLoading}
        onAnalyzeClick={() => setReportModalOpen(true)}
      />

      <main className="app-shell">
        {/* Hero panel */}
        <section className="hero-panel">
          <span className="eyebrow">
            RooCode · Dashboard de Saúde Pessoal
          </span>
          <h1>Neuropsiquiatria, farmacocinética e dados de Apple Watch — sob o mesmo teto.</h1>
          <p>
            Correlações clínicas entre concentração plasmática, humor, sono e fisiologia cardiovascular.
            Janela atual: <strong>{range}</strong> · {today}.
          </p>
        </section>

        <div className="mt-6">
          {data.usedMock && <MockBanner />}
          <InterpolationBanner
            mode={data.interpolationMode}
            loading={data.interpolationLoading}
            error={data.interpolationError}
            filledCount={data.interpolationFilledCount}
          />
          <ForecastBanner
            mode={data.forecastMode}
            loading={data.forecastLoading}
            error={data.forecastError}
            errorMessage={data.forecastErrorMessage}
            forecastedCount={data.forecastedCount}
          />

          {activeTab === 'panorama' && (
            <SurfaceFrame
              icon={<Compass className="h-4 w-4" />}
              kicker="Panorama"
              title="Como estou no geral?"
              description="Visão consolidada de sono, atividade, humor e medicação nos últimos dias."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Agora</p>
                      <p className="mt-1 font-semibold text-slate-900">Decisão diária</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {dailyVerdict.latestDate
                          ? `Último score válido: ${format(parseISO(dailyVerdict.latestDate), 'd MMM', { locale: ptBR })}`
                          : 'Aguardando score válido'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Janela</p>
                      <p className="mt-1 font-semibold text-slate-900">{range}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Tendência e padrão semanal usam {ranged.length} dia(s) selecionado(s).
                      </p>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${panoramaConfidence.className}`}>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-70">Confiança</p>
                      <p className="mt-1 font-semibold">{panoramaConfidence.label}</p>
                      <p className="mt-1 text-xs leading-5 opacity-80">{panoramaConfidence.detail}</p>
                    </div>
                  </div>

                  {executiveMetrics.map((cluster) => (
                    <div key={cluster.title} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {cluster.title}
                      </h3>
                      <MetricGrid metrics={cluster.metrics} />
                    </div>
                  ))}

                  {(() => {
                    const { status, title, score, limiterText, pkText, latestDate, actions } = dailyVerdict
                    const palette = {
                      green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
                      yellow: 'border-amber-200 bg-amber-50 text-amber-900',
                      red: 'border-rose-200 bg-rose-50 text-rose-900',
                      neutral: 'border-slate-200 bg-slate-50 text-slate-900',
                    }[status]

                    const icon = {
                      green: '🟢',
                      yellow: '🟡',
                      red: '🔴',
                      neutral: '⚪',
                    }[status]

                    return (
                      <div className={`rounded-2xl border px-4 py-3 ${palette}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <span className="text-xl">{icon}</span>
                            <div>
                              <p className="font-semibold text-base tracking-tight">{title}</p>
                              {latestDate && (
                                <p className="text-[0.75rem] opacity-75">
                                  Dados de {format(parseISO(latestDate), 'd MMM', { locale: ptBR })}
                                  {latestDate !== todayIso && ' · último dia completo'}
                                </p>
                              )}
                              {status !== 'neutral' && limiterText && (
                                <p className="text-sm opacity-90">
                                  Fator limitante: <span className="font-bold">{limiterText}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          {score != null && (
                            <div className="flex gap-4 text-sm font-medium opacity-80 sm:text-right">
                              <div className="flex flex-col">
                                <span>Recovery</span>
                                <span>{score.toFixed(0)}/100</span>
                              </div>
                              <div className="flex flex-col">
                                <span>Farmaco</span>
                                <span>{pkText}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {actions.length > 0 && (
                          <div className="mt-3 rounded-xl border border-current/10 bg-white/45 px-3 py-2">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] opacity-65">Próximas 24h</p>
                            <ul className="mt-1 space-y-1 text-xs leading-5 opacity-90">
                              {actions.map((action) => (
                                <li key={action}>• {action}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <WeekdayWeekendCard snapshots={ranged} />

                  <DecisionSection
                    eyebrow="Decisão diária"
                    title="O que mais merece atenção hoje?"
                    description="Cards priorizados por ação: primeiro o gargalo fisiológico do dia, depois noite e cobertura medicamentosa."
                  >
                    <LimitingFactorCard snapshots={data.snapshots} variant="summary" />

                    <div className="grid gap-4 xl:grid-cols-2">
                      <NightQualityCard snapshots={data.snapshots} variant="summary" />
                      <PKCoverageCard variant="summary" />
                    </div>
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Tendência"
                    title="A direção geral está melhorando ou piorando?"
                    description="Trajetória e padrões semanais — complementam a foto do dia mostrada acima."
                  >
                    <RecoveryScoreChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />
                  </DecisionSection>

                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'farmaco' && (
            <SurfaceFrame
              icon={<Pill className="h-4 w-4" />}
              kicker="Farmaco"
              title="A medicação está funcionando?"
              description="Humor, cobertura medicamentosa e registro de doses em uma leitura única e prática."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              <div className="min-w-0 space-y-4">
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-700">
                  <span className="font-semibold">Nota importante:</span> as concentrações exibidas são estimativas de um modelo farmacocinético baseado no regime registrado, não medições laboratoriais.
                </p>

                <div className="flex justify-end">
                  <button
                    onClick={() => setCatalogOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-900/15 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white hover:shadow-md"
                    type="button"
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Catálogo de substâncias
                  </button>
                </div>
                <MedicationCatalogEditor open={catalogOpen} onOpenChange={setCatalogOpen} />

                <MoodTimeline snapshots={ranged} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />

                <PKCoverageCard />

                <PKMedicationGrid hoursWindow={168} />

                <PKHumorCorrelation snapshots={ranged} />

                <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)]">
                  <div className="min-w-0 rounded-[1.25rem] border border-slate-900/10 bg-white/85 p-4 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
                    <DoseLogger />
                  </div>
                  <div className="min-w-0 rounded-[1.25rem] border border-slate-900/10 bg-white/85 p-4 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur" style={{ minHeight: 420 }}>
                    <DoseCalendarView />
                  </div>
                </div>
              </div>
            </SurfaceFrame>
          )}

          {activeTab === 'sono' && (
            <SurfaceFrame
              icon={<MoonStar className="h-4 w-4" />}
              kicker="Sono"
              title="Como foram minhas noites?"
              description="Arquitetura do sono, qualidade respiratória noturna e regulação circadiana."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-4">
                  <p className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900">
                    <span className="font-semibold">Leitura rápida:</span> {sleepSummaryLine}
                  </p>

                  <NightQualityCard snapshots={data.snapshots} />

                  <SleepStagesChart snapshots={ranged} />

                  <SleepDebtChart snapshots={ranged} baselineSnapshots={data.snapshots} />

                  <Spo2Chart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <RespiratoryDisturbancesChart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                    <VitalSignsTimeline snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                  </div>
                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'coracao' && (
            <SurfaceFrame
              icon={<Compass className="h-4 w-4" />}
              kicker="Coração"
              title="Como está meu sistema nervoso autônomo?"
              description="HRV, FC em repouso, ranges diários e recuperação cardíaca pós-esforço."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-4">
                  <AutonomicBalanceChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />

                  <HrvVariabilityChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />

                  <HRRangeChart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />

                  <HeartRateReserveChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />

                  <ChronotropicResponseChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />

                  <CardioRecoveryChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'atividade' && (
            <SurfaceFrame
              icon={<Activity className="h-4 w-4" />}
              kicker="Atividade"
              title="Estou me movendo bem?"
              description="Energia, exercício, marcha e capacidade cardiorrespiratória."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-4">
                  <ActivityReadinessCard snapshots={ranged} />

                  <ActivityBars snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />

                  <StepsChart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Vo2MaxChart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                    <WalkingVitalityChart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                  </div>
                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'insights' && (
            <SurfaceFrame
              icon={<Telescope className="h-4 w-4" />}
              kicker="Insights"
              title="O que a IA vê nos meus dados?"
              description="Correlações Pearson entre métricas + análises intraday concentração × humor. Observações, não diagnósticos."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <span className="font-semibold">⚠ Análise exploratória.</span>{' '}
                  <span className="text-amber-700/90">
                    Correlação ≠ causalidade. n pequeno = r ruidoso. Emoções momentâneas têm sampling bias
                    (tu loga quando a emoção é forte). Use como hipótese, não evidência. Precisa ~60 dias de
                    dados pra conclusão robusta.
                  </span>
                </div>
                {ranged.length > 0 && (
                  <>
                    <LabGroup
                      eyebrow="Hipóteses acionáveis"
                      title="Quais drivers parecem mais ligados ao humor?"
                      description="Começa pelos cards mais interpretáveis e deixa o heatmap como suporte visual, não como decisão isolada."
                    >
                      <PKVariabilityReportCard snapshots={ranged} />
                      <CorrelationHeatmap snapshots={ranged} />
                    </LabGroup>

                    <LabGroup
                      eyebrow="Cross-domain"
                      title="Sono, autonomia, temperatura e farmacocinética"
                      description="Hipóteses específicas que cruzam domínios: dívida de sono × HRV e temperatura do pulso × humor (lag sweep)."
                    >
                      <SleepDebtHrvCard snapshots={ranged} />
                      <TempHumorCorrelation snapshots={ranged} />
                    </LabGroup>

                    <LabGroup
                      eyebrow="PK × Humor (variabilidade)"
                      title="Concentrações irregulares ou muito estáveis afetam humor?"
                      description="Testa se a VARIABILIDADE da concentração (CV% inter-dia, swing intra-dia, tempo no range) correlaciona com humor. Análise quartil Q1×Q4 capta sweet spot em U que Pearson sozinho perde."
                    >
                      <PKVariabilityHumorLab snapshots={ranged} />
                      <PKVariabilityHeatmap snapshots={ranged} />
                    </LabGroup>

                    <LabGroup
                      eyebrow="Modo laboratório"
                      title="Exploração interativa e controles de causalidade"
                      description="Ferramentas para investigar sinais promissores sem misturar esses gráficos com o cockpit diário."
                    >
                      <ScatterCorrelation snapshots={ranged} />
                      <PKMoodScatterChart />
                      <LagCorrelationChart />
                    </LabGroup>

                    <details className="rounded-[1.5rem] border border-violet-200 bg-violet-50/60 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-violet-800">
                        Calibração técnica da IA de forecast
                      </summary>
                      <div className="mt-4">
                        <ForecastAccuracyCard snapshots={ranged} />
                      </div>
                    </details>
                  </>
                )}
              </div>
            </SurfaceFrame>
          )}
        </div>
      </main>
      <ForecastReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        snapshots={data.snapshots}
        validRealDays={data.validRealDays}
      />
    </>
  )
}
