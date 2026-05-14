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
import type { OverviewMetrics } from '@/types/apple-health'
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

function computeWeekSignal(snapshots: Parameters<typeof computeRecoveryScoreSeries>[0]) {
  const real = snapshots.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted)
  const hrvWeekday = mean(
    real
      .filter((snapshot) => {
        const day = getDay(parseISO(snapshot.date))
        return day >= 1 && day <= 5
      })
      .map((snapshot) => snapshot.health?.hrvSdnn ?? null),
  )
  const hrvWeekend = mean(
    real
      .filter((snapshot) => {
        const day = getDay(parseISO(snapshot.date))
        return day === 0 || day === 6
      })
      .map((snapshot) => snapshot.health?.hrvSdnn ?? null),
  )
  const rhrWeekday = mean(
    real
      .filter((snapshot) => {
        const day = getDay(parseISO(snapshot.date))
        return day >= 1 && day <= 5
      })
      .map((snapshot) => snapshot.health?.restingHeartRate ?? null),
  )
  const rhrWeekend = mean(
    real
      .filter((snapshot) => {
        const day = getDay(parseISO(snapshot.date))
        return day === 0 || day === 6
      })
      .map((snapshot) => snapshot.health?.restingHeartRate ?? null),
  )

  const hrvDeltaPct =
    hrvWeekend != null && hrvWeekday != null && hrvWeekday > 0
      ? ((hrvWeekend - hrvWeekday) / hrvWeekday) * 100
      : null
  const rhrWeekVsWeekendDelta =
    rhrWeekday != null && rhrWeekend != null
      ? rhrWeekday - rhrWeekend
      : null

  return { hrvDeltaPct, rhrWeekVsWeekendDelta }
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
    const series = computeRecoveryScoreSeries(allWithForecast)
    const latest = [...series].reverse().find((point) => point.score != null && point.components != null)
    const topFactor = latest?.components
      ? rankLimitingFactors(latest.components)[0]?.component
      : null

    const coverageStatuses = computeCoverageStatus(dosesQuery.data ?? [], regimenQuery.data ?? [])
    const adequateCount = coverageStatuses.filter((status) => status.klass === 'adequada').length
    const totalCoverage = coverageStatuses.length
    const weekSignal = computeWeekSignal(data.snapshots)
    const dayRef = latest?.date ?? todayIso
    const dayLabel = format(parseISO(dayRef), 'd MMM', { locale: ptBR })
    const scoreText = latest?.score != null ? `${latest.score.toFixed(0)}/100` : 'em construção'
    const limiterText = topFactor ? LIMITING_LABEL[topFactor] : 'dados ainda incompletos'
    const pkText =
      totalCoverage > 0
        ? `${adequateCount}/${totalCoverage} substâncias em faixa adequada`
        : 'sem cobertura PK suficiente para classificar'

    const stressText =
      weekSignal.rhrWeekVsWeekendDelta != null
        ? `FC repouso de semana ${Math.abs(Math.round(weekSignal.rhrWeekVsWeekendDelta))} bpm ${
            weekSignal.rhrWeekVsWeekendDelta >= 0 ? 'acima' : 'abaixo'
          } do fim de semana`
        : 'sem contraste semana × FDS ainda'

    const hrvText =
      weekSignal.hrvDeltaPct != null
        ? `Δ HRV FDS ${weekSignal.hrvDeltaPct >= 0 ? '+' : ''}${Math.round(weekSignal.hrvDeltaPct)}%`
        : null

    return `Hoje (${dayLabel}): recovery ${scoreText}. Limitador principal: ${limiterText}. Farmacoterapia: ${pkText}. Atenção: ${stressText}${hrvText ? ` · ${hrvText}` : ''}.`
  }, [allWithForecast, dosesQuery.data, regimenQuery.data, data.snapshots, todayIso])
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
                  {executiveMetrics.map((cluster) => (
                    <div key={cluster.title} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {cluster.title}
                      </h3>
                      <MetricGrid metrics={cluster.metrics} />
                    </div>
                  ))}

                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    <span className="font-semibold">Veredito do dia:</span> {dailyVerdict}
                  </p>

                  <WeekdayWeekendCard snapshots={data.snapshots} />

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
