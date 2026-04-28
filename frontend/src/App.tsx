import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Compass, BrainCircuit, MoonStar, Orbit, FlaskConical, Telescope } from 'lucide-react'
import { TabNav, type TabKey, type RangeOption } from '@/components/navigation/TabNav'
import type { ForecastMode } from '@/hooks/useForecast'
import type { InterpolationMode } from '@/hooks/useInterpolation'
import { SurfaceFrame, MetricGrid, EmptyAnalyticsState } from '@/components/analytics/shared'
import type { AnalyticsMetric, AnalyticsTone } from '@/components/analytics/types'
import DoseLogger from '@/components/DoseLogger'
import DoseCalendarView from '@/components/DoseCalendarView'
import MedicationCatalogEditor from '@/components/MedicationCatalogEditor'
import { ActivityBars } from '@/components/charts/activity-bars'
import { CorrelationHeatmap } from '@/components/charts/correlation-heatmap'
import { HeartRateBands } from '@/components/charts/heart-rate-bands'
import { HrvAnalysis } from '@/components/charts/hrv-analysis'
import { MoodTimeline } from '@/components/charts/mood-timeline'
import { PKMedicationGrid } from '@/components/charts/pk-medication-grid'
import { ScatterCorrelation } from '@/components/charts/scatter-correlation'
import { SleepStagesChart } from '@/components/charts/sleep-stages-chart'
import { Spo2Chart } from '@/components/charts/spo2-chart'
import { LagCorrelationChart } from '@/components/charts/lag-correlation-chart'
import { PKMoodScatterChart } from '@/components/charts/pk-mood-scatter-chart'
import { CardioRecoveryChart } from '@/components/charts/cardio-recovery-chart'
import { RespiratoryDisturbancesChart } from '@/components/charts/respiratory-disturbances-chart'
import { StepsChart } from '@/components/charts/steps-chart'
import { VitalSignsTimeline } from '@/components/charts/vital-signs-timeline'
import { TimelineChart } from '@/components/charts/timeline-chart'
import { Vo2MaxChart } from '@/components/charts/vo2-max-chart'
import { WalkingVitalityChart } from '@/components/charts/walking-vitality-chart'
import { InterpolationDemo } from '@/pages/InterpolationDemo'
import { useCardioAnalysis } from '@/hooks/useCardioAnalysis'
import { useRooCodeData } from '@/hooks/useRooCodeData'
import type { OverviewMetrics, TimelineSeriesKey } from '@/types/apple-health'
import { ForecastSignalsPanel } from '@/components/charts/ForecastSignalsPanel'
import { buildTimelineSeries, selectSnapshotRange } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'

const TIMELINE_LABELS: Record<TimelineSeriesKey, string> = {
  sleepTotalHours: 'Sono (h)',
  sleepEfficiencyPct: 'Eficiência (%)',
  restingHeartRate: 'FC Repouso (bpm)',
  hrvSdnn: 'HRV (ms)',
  spo2: 'SpO₂ (%)',
  activeEnergyKcal: 'Energia ativa (kcal)',
  exerciseMinutes: 'Exercício (min)',
  standingMinutes: 'Em pé (min)',
  daylightMinutes: 'Luz do dia (min)',
  valence: 'Humor',
  // Fase 8A
  steps: 'Passos',
  vo2Max: 'VO2 Máx',
  walkingSpeedKmh: 'Velocidade de marcha (km/h)',
  walkingHeartRateAvg: 'FC caminhada (bpm)',
  respiratoryRate: 'Resp. (rpm)',
  pulseTemperatureC: 'Temp. pulso (°C)',
}

const EXEC_SERIES: TimelineSeriesKey[] = ['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']

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

function buildExecutiveMetrics(
  ov: OverviewMetrics,
  days: { validRealDays: number; validMoodDays: number },
  activity: { steps7d: number | null; vo2Max7d: number | null; walkingSpeed7d: number | null },
  physiology: { respiratoryRate7d: number | null; pulseTemperatureC7d: number | null },
): AnalyticsMetric[] {
  // Fase 5d: KPIs de média-7d só fazem sentido com 7+ dias reais.
  // Abaixo disso, value vira null → MetricGrid mostra "Sem dados".
  const enoughReal = days.validRealDays >= 7
  const enoughMood = days.validMoodDays >= 7
  const sleep = enoughReal ? ov.sleep7dHours : null
  const hrv = enoughReal ? ov.hrv7d : null
  const rhr = enoughReal ? ov.restingHeartRate7d : null
  const mood = enoughMood ? ov.mood7d : null
  const moodPct = mood != null ? Math.round(mood * 100) : null
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
    { label: 'Sono 7d', value: sleep, unit: 'h', tone: toneFor(sleep, 7, 6) },
    { label: 'HRV 7d', value: hrv, unit: 'ms', tone: toneFor(hrv, 40, 25) },
    {
      label: 'FC Repouso 7d',
      value: rhr,
      unit: 'bpm',
      tone: toneFor(rhr, 60, 70, true),
    },
    {
      label: 'Humor 7d',
      value: moodPct,
      unit: '%',
      tone: mood == null
        ? 'neutral'
        : mood >= 0.35
        ? 'positive'
        : mood >= -0.1
        ? 'watch'
        : 'negative',
    },
    {
      label: 'Passos 7d',
      value: steps != null ? Math.round(steps) : null,
      unit: '',
      tone: toneFor(steps, 10000, 7500),
    },
    {
      label: 'VO2 Máx 7d',
      value: vo2,
      unit: '',
      tone: toneFor(vo2, 45, 37),
    },
    {
      label: 'Vel. marcha 7d',
      value: walkingSpeed,
      unit: 'km/h',
      tone: toneFor(walkingSpeed, 5.5, 4.5),
    },
    {
      label: 'Energia ativa 7d',
      value: kcal,
      unit: 'kcal',
      tone: toneFor(kcal, 400, 200),
    },
    {
      label: 'Exercício 7d',
      value: exMin,
      unit: 'min',
      tone: exMin == null
        ? 'neutral'
        : exMin >= 30
        ? 'positive'
        : 'watch',
    },
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
  ]
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

  const label = mode === 'claude' ? 'Interpolação IA (Gemini)' : 'Interpolação linear'
  const status = loading
    ? ' — Gemini preenchendo lacunas…'
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
  forecastedCount: number
}

function ForecastBanner({ mode, loading, error, forecastedCount }: ForecastBannerProps) {
  if (mode === 'off') return null
  const status = loading
    ? ' — Gemini gerando previsão…'
    : error
    ? ' — Erro na chamada IA. Tente novamente.'
    : forecastedCount > 0
    ? ` — ${forecastedCount} dias projetados. Pontos pontilhados indicam estimativas futuras.`
    : ' — Aguardando dados suficientes (≥7 dias reais).'
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
      <span className="font-semibold">🔮 Projeção Gemini</span>
      <span className="text-violet-700/80">{status}</span>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('executive')
  const [range, setRange] = useState<RangeOption>('30d')
  const [hash, setHash] = useState(() => window.location.hash)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [interpolation, setInterpolationState] = useState<InterpolationMode>(() => {
    const saved = localStorage.getItem('roocode-interpolation')
    return saved === 'linear' || saved === 'claude' ? saved : 'off'
  })
  const setInterpolation = (mode: InterpolationMode) => {
    setInterpolationState(mode)
    localStorage.setItem('roocode-interpolation', mode)
  }
  const [forecast, setForecastState] = useState<ForecastMode>(() => {
    const saved = localStorage.getItem('roocode-forecast')
    return saved === 'on' ? 'on' : 'off'
  })
  const setForecast = (mode: ForecastMode) => {
    setForecastState(mode)
    localStorage.setItem('roocode-forecast', mode)
  }
  const data = useRooCodeData(interpolation, forecast)
  const ranged = useMemo(() => selectSnapshotRange(data.snapshots, range), [data.snapshots, range])
  const todayIso = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const rangedWithForecast = useMemo(
    () =>
      forecast === 'on' && data.forecastedSnapshots.length > 0
        ? [...ranged, ...data.forecastedSnapshots]
        : ranged,
    [ranged, data.forecastedSnapshots, forecast],
  )
  const cardio = useCardioAnalysis(ranged)
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
      ),
    [data.overview, data.validRealDays, data.validMoodDays, activitySummary, physiologySummary],
  )
  const timelineData = useMemo(() => buildTimelineSeries(rangedWithForecast, EXEC_SERIES), [rangedWithForecast])
  const timelineReadiness = useMemo(
    () => evaluateReadiness(ranged, CHART_REQUIREMENTS.timelineChart, 'Timeline'),
    [ranged],
  )
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
        forecast={forecast}
        onForecastChange={setForecast}
        forecastLoading={data.forecastLoading}
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
            forecastedCount={data.forecastedCount}
          />

          {activeTab === 'executive' && (
            <SurfaceFrame
              icon={<Compass className="h-4 w-4" />}
              kicker="Executivo"
              title="Visão geral semanal"
              description="Panorama consolidado de sono, atividade, humor e medicação nos últimos dias."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-4">
                  <MetricGrid metrics={executiveMetrics} />

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      <TimelineChart data={timelineData} seriesKeys={EXEC_SERIES} labels={TIMELINE_LABELS} readiness={timelineReadiness} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                    </div>
                    <div>
                      <HrvAnalysis snapshots={rangedWithForecast} baselineBands={cardio.hrvBaselineBands} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ActivityBars snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                    <HeartRateBands
                      snapshots={rangedWithForecast}
                      overtraining={cardio.overtrainingStatus ?? undefined}
                      forecastStartDate={forecast === 'on' ? todayIso : undefined}
                    />
                  </div>

                  {/* Fase 8A — Passos & distância (atividade psicomotora) */}
                  <StepsChart snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />

                  {forecast === 'on' && (
                    <ForecastSignalsPanel
                      signals={data.forecastSignals}
                      loading={data.forecastLoading}
                      error={data.forecastError}
                      maxConfidence={data.forecastMaxConfidence}
                    />
                  )}
                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'moodMedication' && (
            <SurfaceFrame
              icon={<BrainCircuit className="h-4 w-4" />}
              kicker="Humor + Medicação"
              title="Farmacocinética e estado afetivo"
              description="Concentração plasmática (% Cmax) sobreposta ao humor — com doses, lags e regressões."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              <div className="min-w-0 space-y-4">
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

                <MoodTimeline snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />

                <PKMedicationGrid hoursWindow={168} />

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

          {activeTab === 'sleepPhysiology' && (
            <SurfaceFrame
              icon={<MoonStar className="h-4 w-4" />}
              kicker="Sono + Fisiologia"
              title="Arquitetura do sono e recuperação"
              description="Estágios de sono, HRV, FC em repouso, SpO₂ e padrões semanais."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-4">
                  <SleepStagesChart snapshots={ranged} />

                  <Spo2Chart snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />

                  {/* Fase 8A — VO2 Máx + Vitalidade de marcha */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Vo2MaxChart snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                    <WalkingVitalityChart snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                  </div>

                  {/* Fase 10D — Charts clínicos */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <RespiratoryDisturbancesChart snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                    <VitalSignsTimeline snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                  </div>
                  <CardioRecoveryChart snapshots={rangedWithForecast} forecastStartDate={forecast === 'on' ? todayIso : undefined} />
                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'patterns' && (
            <SurfaceFrame
              icon={<Orbit className="h-4 w-4" />}
              kicker="Padrões"
              title="Análise correlacional"
              description="Matriz N×N Pearson entre PK, humor, sono, HRV e atividade. Clique uma célula para ver o scatter detalhado."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · 14 dias' : `${data.snapshots.length} dias`}
            >
              {ranged.length === 0 ? (
                <EmptyAnalyticsState message="Sem snapshots no intervalo selecionado." />
              ) : (
                <div className="space-y-4">
                  <CorrelationHeatmap snapshots={ranged} />
                  <ScatterCorrelation snapshots={ranged} />
                </div>
              )}
            </SurfaceFrame>
          )}

          {activeTab === 'insights' && (
            <SurfaceFrame
              icon={<Telescope className="h-4 w-4" />}
              kicker="Descritivo + Insights"
              title="Exploração intraday e hipóteses clínicas"
              description="Análises em granularidade horária — concentração × humor momentâneo e lag analysis. Observações, não diagnósticos."
              window={{ label: range, coveredDays: ranged.length }}
              status={data.usedMock ? 'Mock · sem eventos momentâneos' : `${data.snapshots.length} dias`}
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
                <PKMoodScatterChart />
                <LagCorrelationChart />
              </div>
            </SurfaceFrame>
          )}
        </div>
      </main>
    </>
  )
}
