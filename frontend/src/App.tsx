import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Compass, BrainCircuit, MoonStar, Orbit } from 'lucide-react'
import { TabNav, type TabKey, type RangeOption } from '@/components/navigation/TabNav'
import type { InterpolationMode } from '@/hooks/useInterpolation'
import { SurfaceFrame, MetricGrid, EmptyAnalyticsState } from '@/components/analytics/shared'
import type { AnalyticsMetric, AnalyticsTone } from '@/components/analytics/types'
import DoseLogger from '@/components/DoseLogger'
import { ActivityBars } from '@/components/charts/activity-bars'
import { CorrelationHeatmap } from '@/components/charts/correlation-heatmap'
import { HeartRateBands } from '@/components/charts/heart-rate-bands'
import { HrvAnalysis } from '@/components/charts/hrv-analysis'
import { MoodDonut } from '@/components/charts/mood-donut'
import { MoodTimeline } from '@/components/charts/mood-timeline'
import { PKConcentrationChart } from '@/components/charts/pk-concentration-chart'
import { PKIndividualChart } from '@/components/charts/pk-individual-chart'
import { ScatterCorrelation } from '@/components/charts/scatter-correlation'
import { SleepStagesChart } from '@/components/charts/sleep-stages-chart'
import { Spo2Chart } from '@/components/charts/spo2-chart'
import { TimelineChart } from '@/components/charts/timeline-chart'
import { WeeklyPatternChart } from '@/components/charts/weekly-pattern-chart'
import { ChartsDemo } from '@/pages/ChartsDemo'
import { InterpolationDemo } from '@/pages/InterpolationDemo'
import { useCardioAnalysis } from '@/hooks/useCardioAnalysis'
import { useRooCodeData } from '@/hooks/useRooCodeData'
import type { OverviewMetrics, TimelineSeriesKey } from '@/types/apple-health'
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
  movementMinutes: 'Movimento (min)',
  standingMinutes: 'Em pé (min)',
  daylightMinutes: 'Luz do dia (min)',
  valence: 'Humor',
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('executive')
  const [range, setRange] = useState<RangeOption>('30d')
  const [hash, setHash] = useState(() => window.location.hash)
  const [interpolation, setInterpolationState] = useState<InterpolationMode>(() => {
    const saved = localStorage.getItem('roocode-interpolation')
    return saved === 'linear' || saved === 'claude' ? saved : 'off'
  })
  const setInterpolation = (mode: InterpolationMode) => {
    setInterpolationState(mode)
    localStorage.setItem('roocode-interpolation', mode)
  }
  const data = useRooCodeData(interpolation)
  const ranged = useMemo(() => selectSnapshotRange(data.snapshots, range), [data.snapshots, range])
  const cardio = useCardioAnalysis(ranged)
  const executiveMetrics = useMemo(
    () =>
      buildExecutiveMetrics(data.overview, {
        validRealDays: data.validRealDays,
        validMoodDays: data.validMoodDays,
      }),
    [data.overview, data.validRealDays, data.validMoodDays],
  )
  const timelineData = useMemo(() => buildTimelineSeries(ranged, EXEC_SERIES), [ranged])
  const timelineReadiness = useMemo(
    () => evaluateReadiness(ranged, CHART_REQUIREMENTS.timelineChart, 'Timeline'),
    [ranged],
  )
  const lexaproGroup = useMemo(
    () => data.pkGroups.find((g) => g.presetKey === 'escitalopram') ?? null,
    [data.pkGroups],
  )

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (hash === '#charts-demo') return <ChartsDemo />
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
                      <TimelineChart data={timelineData} seriesKeys={EXEC_SERIES} labels={TIMELINE_LABELS} readiness={timelineReadiness} />
                    </div>
                    <div>
                      <HrvAnalysis snapshots={ranged} baselineBands={cardio.hrvBaselineBands} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ActivityBars snapshots={ranged} />
                    <HeartRateBands
                      snapshots={ranged}
                      overtraining={cardio.overtrainingStatus ?? undefined}
                    />
                  </div>
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
              <div className="space-y-4">
                <PKConcentrationChart
                  medicationRows={data.medicationRows}
                  dates={data.dates}
                  snapshots={ranged}
                />

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <MoodTimeline snapshots={ranged} />
                  </div>
                  <div>
                    <MoodDonut snapshots={ranged} />
                  </div>
                </div>

                {lexaproGroup && (
                  <PKIndividualChart
                    medication={lexaproGroup.medication}
                    doses={lexaproGroup.doses}
                    snapshots={ranged}
                    color="#0f766e"
                    daysRange={7}
                  />
                )}

                <div className="mt-5 max-w-md">
                  <DoseLogger />
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

                  <div className="grid gap-4 lg:grid-cols-2">
                    <HrvAnalysis snapshots={ranged} baselineBands={cardio.hrvBaselineBands} />
                    <HeartRateBands
                      snapshots={ranged}
                      overtraining={cardio.overtrainingStatus ?? undefined}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Spo2Chart snapshots={ranged} />
                    <WeeklyPatternChart pattern={data.weeklyPattern} snapshots={ranged} interpolatedCount={ranged.filter((s) => s.interpolated).length} />
                  </div>
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
                  <WeeklyPatternChart pattern={data.weeklyPattern} snapshots={ranged} interpolatedCount={ranged.filter((s) => s.interpolated).length} />
                </div>
              )}
            </SurfaceFrame>
          )}
        </div>
      </main>
    </>
  )
}
