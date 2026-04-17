import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Compass, BrainCircuit, MoonStar, Orbit } from 'lucide-react'
import { TabNav, type TabKey, type RangeOption } from '@/components/navigation/TabNav'
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
import { useCardioAnalysis } from '@/hooks/useCardioAnalysis'
import { useRooCodeData } from '@/hooks/useRooCodeData'
import type { OverviewMetrics, TimelineSeriesKey } from '@/types/apple-health'
import { buildTimelineSeries, selectSnapshotRange } from '@/utils/aggregation'

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

function buildExecutiveMetrics(ov: OverviewMetrics): AnalyticsMetric[] {
  const moodPct = ov.mood7d != null ? Math.round(ov.mood7d * 100) : null
  return [
    { label: 'Sono 7d', value: ov.sleep7dHours, unit: 'h', tone: toneFor(ov.sleep7dHours, 7, 6) },
    { label: 'HRV 7d', value: ov.hrv7d, unit: 'ms', tone: toneFor(ov.hrv7d, 40, 25) },
    {
      label: 'FC Repouso 7d',
      value: ov.restingHeartRate7d,
      unit: 'bpm',
      tone: toneFor(ov.restingHeartRate7d, 60, 70, true),
    },
    {
      label: 'Humor 7d',
      value: moodPct,
      unit: '%',
      tone: ov.mood7d == null
        ? 'neutral'
        : ov.mood7d >= 0.35
        ? 'positive'
        : ov.mood7d >= -0.1
        ? 'watch'
        : 'negative',
    },
    {
      label: 'Energia ativa 7d',
      value: ov.activeEnergy7dKcal,
      unit: 'kcal',
      tone: toneFor(ov.activeEnergy7dKcal, 400, 200),
    },
    {
      label: 'Exercício 7d',
      value: ov.exercise7dMinutes,
      unit: 'min',
      tone: ov.exercise7dMinutes == null
        ? 'neutral'
        : ov.exercise7dMinutes >= 30
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('executive')
  const [range, setRange] = useState<RangeOption>('30d')
  const [hash, setHash] = useState(() => window.location.hash)
  const data = useRooCodeData()
  const ranged = useMemo(() => selectSnapshotRange(data.snapshots, range), [data.snapshots, range])
  const cardio = useCardioAnalysis(ranged)
  const executiveMetrics = useMemo(() => buildExecutiveMetrics(data.overview), [data.overview])
  const timelineData = useMemo(() => buildTimelineSeries(ranged, EXEC_SERIES), [ranged])
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

  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <>
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} range={range} onRangeChange={setRange} />

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
                      <TimelineChart data={timelineData} seriesKeys={EXEC_SERIES} labels={TIMELINE_LABELS} />
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
                    <WeeklyPatternChart pattern={data.weeklyPattern} />
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
                  <WeeklyPatternChart pattern={data.weeklyPattern} />
                </div>
              )}
            </SurfaceFrame>
          )}
        </div>
      </main>
    </>
  )
}
