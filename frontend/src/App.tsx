import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { format, getDay, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Activity, Compass, FlaskConical, HeartPulse, Pill, Telescope } from 'lucide-react'
import { TabNav, type TabKey, type RangeOption } from '@/components/navigation/TabNav'
import type { ForecastMode } from '@/hooks/useForecast'
import type { InterpolationMode } from '@/hooks/useInterpolation'
import { ForecastReportModal } from '@/components/charts/ForecastReportModal'
import { SurfaceFrame, EmptyAnalyticsState } from '@/components/analytics/shared'
import DoseLogger from '@/components/DoseLogger'
import DoseCalendarView from '@/components/DoseCalendarView'
import MedicationCatalogEditor from '@/components/MedicationCatalogEditor'
import { CorrelationHeatmap } from '@/components/charts/correlation-heatmap'
import { AutonomicBalanceChart } from '@/components/charts/autonomic-balance-chart'
import { MoodTimeline } from '@/components/charts/mood-timeline'
import { PKMedicationGrid } from '@/components/charts/pk-medication-grid'
import { PKHumorCorrelation } from '@/components/charts/pk-humor-correlation'
import { SleepDebtChart } from '@/components/charts/sleep-debt-chart'
import { SleepStagesChart } from '@/components/charts/sleep-stages-chart'
import { Spo2Chart } from '@/components/charts/spo2-chart'
import { LagCorrelationChart } from '@/components/charts/lag-correlation-chart'
import { PKMoodScatterChart } from '@/components/charts/pk-mood-scatter-chart'
import { PKVariabilityHumorLab } from '@/components/charts/pk-variability-humor-lab'
import { PKVariabilityReportCard } from '@/components/cards/pk-variability-report-card'
import { TempHumorCorrelation } from '@/components/charts/temp-humor-correlation'
import { RespiratoryDisturbancesChart } from '@/components/charts/respiratory-disturbances-chart'
import { HRRangeChart } from '@/components/charts/hr-range-chart'
import { VitalSignsTimeline } from '@/components/charts/vital-signs-timeline'
import { NightQualityCard } from '@/components/cards/night-quality-card'
import { PKCoverageCard } from '@/components/cards/pk-coverage-card'
import { ActivityReadinessCard } from '@/components/cards/activity-readiness-card'
import { ForecastAccuracyCard } from '@/components/charts/forecast-accuracy-card'
import { HrvVariabilityChart } from '@/components/charts/hrv-variability-chart'
import {
  CapacityCardiovascularPanel,
  CircadianRobustnessCard,
  FunctionalCapacityIndexCard,
  MovementEfficiencyPanel,
  RealLoadPanel,
} from '@/components/charts/capacity-panels'
import { RecoveryIndexCard } from '@/components/cards/recovery-index-card'
import { RecoveryIndexChart } from '@/components/charts/recovery-index-chart'
import { SleepRegularityCard } from '@/components/cards/sleep-regularity-card'
import { CardiovascularAgeCard } from '@/components/cards/cardiovascular-age-card'
import { RecoveryWeekCard } from '@/components/cards/recovery-week-card'
import { PanoramaSparkline } from '@/components/charts/panorama-sparkline'
import { PanoramaHistoryChart } from '@/components/charts/panorama-history-chart'
import { PanoramaWeeklyRegimeCard } from '@/components/charts/panorama-weekly-regime-card'
import { InterpolationDemo } from '@/pages/InterpolationDemo'
import { useRooCodeData } from '@/hooks/useRooCodeData'
import type { DailySnapshot } from '@/types/apple-health'
import { selectSnapshotRange } from '@/utils/aggregation'
import { FULL_HISTORY_DOSE_HOURS } from '@/lib/api'
import {
  buildPanoramaModel,
  formatMoodAverage,
  trendArrow,
} from '@/utils/panorama-model'

const AI_INTERPOLATION_ENABLED = import.meta.env.VITE_ENABLE_AI_INTERPOLATION === 'true'

const PK_HOURS_BY_RANGE: Record<RangeOption, number> = {
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
  '1y': 24 * 365,
  all: FULL_HISTORY_DOSE_HOURS,
}

function mean(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (!numeric.length) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

function computeSleepSummaryLine(snapshots: DailySnapshot[]): string {
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
    : ' — janela atual sem lacunas reais (nenhum ponto interpolado adicionado).'

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
  const pendingCapacityAnchorRef = useRef<string | null>(null)
  const data = useRooCodeData(interpolation, 'on')
  // Política de janela: `ranged` = leitura histórica filtrada; `rangedWithForecast`
  // = gráficos que devem mostrar projeção futura; `data.snapshots` = baseline/dia atual.
  const ranged = useMemo(() => selectSnapshotRange(data.snapshots, range), [data.snapshots, range])
  const recoveryWindow30 = useMemo(
    () => selectSnapshotRange(data.snapshots, '30d'),
    [data.snapshots],
  )
  const pkHoursWindow = PK_HOURS_BY_RANGE[range]
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
  const insightsCoverage = useMemo(() => {
    const realDays = ranged.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted)
    const pairedMoodDays = realDays.filter((snapshot) => snapshot.mood?.valence != null).length
    const coveragePct = realDays.length > 0 ? Math.round((pairedMoodDays / realDays.length) * 100) : 0
    return {
      realDays: realDays.length,
      pairedMoodDays,
      coveragePct,
    }
  }, [ranged])
  const panoramaModel = useMemo(
    () =>
      buildPanoramaModel({
        snapshots: ranged,
        doses: data.doses,
        regimen: data.regimen,
      }),
    [ranged, data.doses, data.regimen],
  )
  const sleepSummaryLine = useMemo(() => computeSleepSummaryLine(data.snapshots), [data.snapshots])
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (activeTab !== 'capacidade') return
    const pendingAnchor = pendingCapacityAnchorRef.current
    if (!pendingAnchor) return
    const el = document.getElementById(pendingAnchor)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      pendingCapacityAnchorRef.current = null
    }
  }, [activeTab])

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
        <section className={`hero-panel ${activeTab === 'panorama' ? 'hero-panel--compact' : ''}`}>
          <span className="eyebrow">
            {activeTab === 'panorama' ? 'RooCode · Panorama' : 'RooCode · Dashboard de Saúde Pessoal'}
          </span>
          <h1>
            {activeTab === 'panorama'
              ? 'Estado geral para decidir o dia.'
              : 'Neuropsiquiatria, farmacocinética e dados de Apple Watch — sob o mesmo teto.'}
          </h1>
          <p>
            {activeTab === 'panorama'
              ? 'Recuperação, sono, atividade e humor em primeiro plano. A parte farmacológica fica no detalhe da aba Farmaco.'
              : 'Correlações clínicas entre concentração plasmática, humor, sono e fisiologia cardiovascular.'}
            {' '}Janela atual: <strong>{range}</strong> · {today}.
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
              title="Como posso usar meu corpo hoje?"
              description="1 número para decidir, 3 índices para diagnosticar e atalhos diretos para investigar."
              metaPanel={
                <div className="grid min-w-[220px] gap-2">
                  <div className="rounded-[1.35rem] border border-slate-900/10 bg-white/65 p-4 shadow-[0_16px_34px_rgba(17,35,30,0.06)] backdrop-blur">
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Dados usados
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-800">{data.usedMock ? 'Mock · 14 dias' : `${ranged.length} dias no recorte`}</div>
                    <div className="mt-1 text-xs text-slate-500">Recorte atual: {range}</div>
                  </div>
                </div>
              }
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-6">
                  {(() => {
                    const { decision, triad, moodBridge, pkBridge, weeklyComparison, history, socialJetLagHours } = panoramaModel
                    const palette = {
                      green: {
                        shell: 'border-emerald-900/10 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,252,246,0.78))] text-emerald-950',
                        dot: 'bg-emerald-500',
                        chip: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                      },
                      yellow: {
                        shell: 'border-amber-900/10 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,252,246,0.78))] text-amber-950',
                        dot: 'bg-amber-500',
                        chip: 'border-amber-200 bg-amber-50 text-amber-800',
                      },
                      red: {
                        shell: 'border-rose-900/10 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,252,246,0.78))] text-rose-950',
                        dot: 'bg-rose-500',
                        chip: 'border-rose-200 bg-rose-50 text-rose-800',
                      },
                      neutral: {
                        shell: 'border-slate-900/10 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,252,246,0.78))] text-slate-950',
                        dot: 'bg-slate-400',
                        chip: 'border-slate-200 bg-slate-50 text-slate-700',
                      },
                    }[decision.status]

                    const pkTone = {
                      green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      yellow: 'border-amber-200 bg-amber-50 text-amber-700',
                      red: 'border-rose-200 bg-rose-50 text-rose-700',
                      white: 'border-slate-200 bg-slate-50 text-slate-700',
                    } as const

                    return (
                      <>
                        <section className={`rounded-[1.65rem] border p-5 shadow-[0_22px_55px_rgba(17,35,30,0.09)] ${palette.shell}`}>
                          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-stretch">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${palette.dot}`} />
                                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] opacity-[0.65]">
                                  Estado de hoje
                                </span>
                                {decision.latestDate && (
                                  <span className="rounded-full border border-current/10 bg-white/45 px-2.5 py-1 text-[0.72rem] font-semibold opacity-75">
                                    {format(parseISO(decision.latestDate), 'd MMM', { locale: ptBR })}
                                    {decision.latestDate !== todayIso && ' · último dia completo'}
                                  </span>
                                )}
                              </div>

                              <h3 className="mt-3 max-w-2xl font-['Fraunces'] text-3xl leading-[1.02] tracking-[-0.055em] sm:text-4xl">
                                {decision.headline}
                              </h3>

                              <p className="mt-3 max-w-3xl text-sm leading-6 opacity-[0.78]">
                                {decision.contextLine}
                              </p>

                              {decision.pkModulation.active && (
                                <p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${palette.chip}`}>
                                  {decision.pkModulation.label}: {decision.pkModulation.detail}
                                </p>
                              )}

                              {decision.actions.length > 0 && (
                                <div className="mt-4 grid gap-2 md:grid-cols-2">
                                  {decision.actions.slice(0, 2).map((action) => (
                                    <div key={action} className="rounded-2xl border border-current/10 bg-white/50 px-3 py-2 text-xs leading-5 shadow-sm">
                                      {action}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <aside className="grid gap-3 rounded-[1.35rem] border border-current/10 bg-white/55 p-4 shadow-inner shadow-white/40">
                              <div>
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] opacity-[0.55]">Estado geral</p>
                                <p className="mt-1 font-['Fraunces'] text-5xl leading-none tracking-[-0.07em]">
                                  {decision.score != null ? decision.score.toFixed(0) : '--'}
                                </p>
                                <p className="mt-1 text-xs font-semibold opacity-[0.60]">{decision.score != null ? '/100' : 'sem score'}</p>
                              </div>
                              <div className={`rounded-2xl border px-3 py-2 text-xs ${palette.chip}`}>
                                <p className="font-semibold">{decision.confidenceLabel}</p>
                                <p className="mt-1 opacity-75">{decision.confidenceDetail}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-900/10 bg-white/60 px-3 py-2 text-xs text-slate-600">
                                <p className="font-semibold text-slate-800">Confiança média</p>
                                <p className="mt-1">{decision.confidencePct}%</p>
                              </div>
                            </aside>
                          </div>
                        </section>

                        <DecisionSection
                          eyebrow="Painel 2"
                          title="Como tão meus três sistemas?"
                          description="Trinca sintética consumindo os índices já calculados nas abas profundas."
                        >
                          <div className="grid gap-4 lg:grid-cols-3">
                            {triad.map((card) => (
                              <button
                                key={card.key}
                                type="button"
                                onClick={() => {
                                  pendingCapacityAnchorRef.current = card.targetAnchor ?? null
                                  setActiveTab(card.targetTab)
                                }}
                                className="text-left rounded-[1.35rem] border border-slate-900/10 bg-white/85 p-4 shadow-[0_14px_32px_rgba(17,35,30,0.07)] transition hover:border-slate-900/20 hover:bg-white"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</span>
                                  <span className="text-sm font-semibold text-slate-600">{trendArrow(card.trend)}</span>
                                </div>
                                <p className="mt-2 font-['Fraunces'] text-4xl tracking-[-0.06em] text-slate-900">
                                  {card.score != null ? card.score.toFixed(0) : '--'}
                                </p>
                                <p className="text-xs text-slate-500">
                                  /100 · {card.confidenceLabel} {card.confidencePct > 0 ? `${card.confidencePct}%` : ''}
                                </p>
                                <div className="mt-3">
                                  <PanoramaSparkline values={card.sparkline} />
                                </div>
                                <p className="mt-2 text-xs text-slate-600">
                                  Limitante: {card.limiterText ?? 'sem limitante dominante'}
                                </p>
                              </button>
                            ))}
                          </div>
                        </DecisionSection>

                        <DecisionSection
                          eyebrow="Painel 3"
                          title="Como tô me sentindo, com o que tô tomando?"
                          description="Ponte rápida para Farmaco sem duplicar concentrações detalhadas."
                        >
                          <div className="grid gap-4 xl:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => setActiveTab('farmaco')}
                              className="text-left rounded-[1.35rem] border border-slate-900/10 bg-white/85 p-4 shadow-[0_14px_32px_rgba(17,35,30,0.07)] transition hover:border-slate-900/20 hover:bg-white"
                            >
                              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Humor 7d</span>
                              <p className="mt-2 font-['Fraunces'] text-4xl tracking-[-0.06em] text-slate-900">
                                {formatMoodAverage(moodBridge.average7d)}
                              </p>
                              <p className="text-xs text-slate-500">escala -1 a +1 · tendência {trendArrow(moodBridge.trend)}</p>
                              <div className="mt-3">
                                <PanoramaSparkline values={moodBridge.sparkline} strokeClassName="stroke-emerald-700" />
                              </div>
                              <p className="mt-2 text-xs text-slate-600">{moodBridge.verdict}</p>
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveTab('farmaco')}
                              className="text-left rounded-[1.35rem] border border-slate-900/10 bg-white/85 p-4 shadow-[0_14px_32px_rgba(17,35,30,0.07)] transition hover:border-slate-900/20 hover:bg-white"
                            >
                              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Cobertura farmacológica</span>
                              <div className="mt-3 grid gap-2">
                                {pkBridge.length === 0 ? (
                                  <p className="text-xs text-slate-500">Sem substâncias críticas na janela atual.</p>
                                ) : (
                                  pkBridge.map((item) => (
                                    <div key={item.substance} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2">
                                      <span className="text-sm font-semibold text-slate-700">{item.substance}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${pkTone[item.tone]}`}>
                                        {item.statusLabel}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </button>
                          </div>
                        </DecisionSection>

                        <DecisionSection
                          eyebrow="Painel 4"
                          title="O padrão está mudando?"
                          description="Leitura de regime útil × fim de semana com os 3 índices sintéticos."
                        >
                          <PanoramaWeeklyRegimeCard rows={weeklyComparison} socialJetLagHours={socialJetLagHours} />
                        </DecisionSection>

                        <DecisionSection
                          eyebrow="Painel 5"
                          title="Como tô em janela longa?"
                          description="Histórico do Estado geral com sobreposição opcional da trinca."
                        >
                          <PanoramaHistoryChart history={history} title="Estado geral · histórico" />
                        </DecisionSection>
                      </>
                    )
                  })()}
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

                <MoodTimeline snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />

                <PKCoverageCard />

                <PKMedicationGrid hoursWindow={pkHoursWindow} windowLabel={range} />

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

          {activeTab === 'recuperacao' && (
            <SurfaceFrame
              icon={<HeartPulse className="h-4 w-4" />}
              kicker="Recuperação"
              title="Meu corpo se reparou?"
              description="Sono, fisiologia noturna e tônus autonômico basal numa única narrativa de restauração."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-6">
                  <p className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900">
                    <span className="font-semibold">Leitura rápida:</span> {sleepSummaryLine}
                  </p>

                  <DecisionSection
                    eyebrow="Painel 1"
                    title="Como foi minha última noite?"
                    description="Headline noturna preservada como leitura clínica imediata."
                  >
                    <NightQualityCard snapshots={ranged} windowLabel={range} />
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 2"
                    title="Quanto recuperei?"
                    description="Índice composto basal para integrar sono, dívida, HRV, FC de repouso e temperatura."
                  >
                    <RecoveryIndexCard snapshots={ranged} windowLabel={range} />
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 3"
                    title="Como dormi?"
                    description="Arquitetura da noite, regularidade circadiana e dívida acumulada no mesmo capítulo."
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                      <SleepStagesChart snapshots={ranged} />
                      <SleepRegularityCard snapshots={ranged} />
                    </div>
                    <SleepDebtChart snapshots={ranged} baselineSnapshots={data.snapshots} />
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 4"
                    title="Como meu corpo se comportou enquanto eu dormia?"
                    description="Respiração, oxigenação e sinais vitais noturnos em leitura integrada."
                  >
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Spo2Chart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                      <RespiratoryDisturbancesChart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                    </div>
                    <VitalSignsTimeline snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                    <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                      <span className="font-semibold text-slate-800">Amplitude diária da temperatura do pulso:</span> ainda indisponível no pipeline atual.
                      Hoje o sistema só recebe o valor noturno agregado, então a aba mostra o desvio noturno com honestidade e não infere amplitude circadiana sem dado real.
                    </p>
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 5"
                    title="Meu sistema nervoso autônomo está em equilíbrio?"
                    description="ABI, HRV, frequência cardíaca basal e idade cardiovascular interpretativa."
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                      <AutonomicBalanceChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />
                      <CardiovascularAgeCard snapshots={ranged} />
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <HrvVariabilityChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />
                      <HRRangeChart snapshots={rangedWithForecast} forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined} />
                    </div>
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 6"
                    title="Quanto a semana me reparou?"
                    description="Fechamento clínico da tendência recente e do histórico de recuperação."
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
                      <RecoveryWeekCard snapshots={recoveryWindow30} />
                      <RecoveryIndexChart snapshots={recoveryWindow30} title="Recovery Index · fechamento de 30 dias" />
                    </div>
                  </DecisionSection>
                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'capacidade' && (
            <SurfaceFrame
              icon={<Activity className="h-4 w-4" />}
              kicker="Capacidade"
              title="Como meu corpo responde quando exigido?"
              description="Capacidade funcional, carga real, resposta cardiovascular, zeitgebers e mecânica de marcha."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-6">
                  <DecisionSection
                    eyebrow="Painel 1"
                    title="Como meu corpo tá pra exigência hoje?"
                    description="Headline de prontidão locomotora, preservando o card atual e seus componentes."
                  >
                    <ActivityReadinessCard snapshots={ranged} baselineSnapshots={data.snapshots} windowLabel={range} />
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 2"
                    title="Quanta capacidade funcional eu tenho?"
                    description="Síntese clínica da reserva cardiopulmonar disponível, com peso zero para inputs ainda ausentes."
                  >
                    <FunctionalCapacityIndexCard snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} />
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 3"
                    title="Como meu coração responde quando eu exijo dele?"
                    description="VO2, reserva cardíaca, resposta cronotrópica e recuperação pós-esforço em uma leitura única."
                  >
                    <CapacityCardiovascularPanel
                      snapshots={rangedWithForecast}
                      baselineSnapshots={allWithForecast}
                      forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined}
                    />
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 4"
                    title="Quanto eu me movi?"
                    description="Carga real: energia, exercício, esforço físico, passos, distância e quebra de sedentarismo."
                  >
                    <RealLoadPanel
                      snapshots={rangedWithForecast}
                      forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined}
                    />
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 5"
                    title="Tô recebendo os zeitgebers que meu relógio precisa?"
                    description="Robustez circadiana parcial usando SRI, luz do dia e contraste cardíaco; amplitude térmica fica pendente até existir dado real."
                  >
                    <div id="capacity-panel-circadian">
                      <CircadianRobustnessCard snapshots={ranged} />
                    </div>
                  </DecisionSection>

                  <DecisionSection
                    eyebrow="Painel 6"
                    title="Como meu corpo se move?"
                    description="Marcha como output motor integrado, com destaque para assimetria persistente e velocidade baixa."
                  >
                    <MovementEfficiencyPanel
                      snapshots={rangedWithForecast}
                      forecastStartDate={data.forecastedSnapshots.length > 0 ? todayIso : undefined}
                    />
                  </DecisionSection>
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
              metaPanel={(
                <div className="grid min-w-[260px] gap-2">
                  <div className="rounded-[1.35rem] border border-slate-900/10 bg-white/65 p-4 shadow-[0_16px_34px_rgba(17,35,30,0.06)] backdrop-blur">
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Dados usados</div>
                    <div className="mt-2 text-sm font-semibold text-slate-800">Janela {range} · {ranged.length} dias no recorte</div>
                    <div className="mt-1 text-xs text-slate-500">Histórico total: {data.snapshots.length} dias</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Cobertura pareada humor×métrica: {insightsCoverage.pairedMoodDays}/{insightsCoverage.realDays} dias reais ({insightsCoverage.coveragePct}%)
                    </div>
                  </div>
                </div>
              )}
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
                      <CorrelationHeatmap snapshots={ranged} />
                      <TempHumorCorrelation snapshots={ranged} />
                    </LabGroup>

                    <LabGroup
                      eyebrow="PK × Humor (variabilidade)"
                      title="Concentrações irregulares ou muito estáveis afetam humor?"
                      description="Testa se a VARIABILIDADE da concentração (CV% inter-dia, swing intra-dia, tempo no range) correlaciona com humor. Análise quartil Q1×Q4 capta sweet spot em U que Pearson sozinho perde."
                    >
                      <PKVariabilityReportCard snapshots={ranged} />
                      <PKVariabilityHumorLab snapshots={ranged} />
                    </LabGroup>

                    <LabGroup
                      eyebrow="Modo laboratório"
                      title="Exploração interativa e controles de causalidade"
                      description="Ferramentas para investigar sinais promissores sem misturar esses gráficos com o cockpit diário."
                    >
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
