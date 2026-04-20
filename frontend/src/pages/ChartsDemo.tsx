import { useMemo } from 'react'

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
import { Sparkline } from '@/components/charts/sparkline'
import { Spo2Chart } from '@/components/charts/spo2-chart'
import { TimelineChart } from '@/components/charts/timeline-chart'
import { WeeklyPatternChart } from '@/components/charts/weekly-pattern-chart'

import { buildTimelineSeries } from '@/utils/aggregation'
import { buildPKMedication, type PKDose } from '@/utils/pharmacokinetics'
import { MOCK_DOSES, MOCK_MED_ROWS, MOCK_REGIMEN } from '@/mocks/doseMock'
import { MOCK_SNAPSHOTS } from '@/mocks/snapshotMock'
import type { WeeklyDayStats } from '@/hooks/useActivityAnalysis'
import type { DailySnapshot } from '@/types/apple-health'

/**
 * Agrega snapshots por dia da semana para alimentar WeeklyPatternChart.
 */
function buildWeeklyPattern(snapshots: DailySnapshot[]): WeeklyDayStats[] {
  const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const acc: Record<number, { exercise: number[]; energy: number[]; daylight: number[] }> = {}

  for (let i = 0; i < 7; i++) acc[i] = { exercise: [], energy: [], daylight: [] }

  for (const snap of snapshots) {
    const dow = new Date(snap.date).getDay()
    if (snap.health?.exerciseMinutes != null) acc[dow].exercise.push(snap.health.exerciseMinutes)
    if (snap.health?.activeEnergyKcal != null) acc[dow].energy.push(snap.health.activeEnergyKcal)
    if (snap.health?.daylightMinutes != null) acc[dow].daylight.push(snap.health.daylightMinutes)
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

  return names.map((dayName, dayIndex) => ({
    dayName,
    dayIndex,
    avgExercise: avg(acc[dayIndex].exercise),
    avgEnergy: avg(acc[dayIndex].energy),
    avgDaylight: avg(acc[dayIndex].daylight),
    count: acc[dayIndex].exercise.length,
  }))
}

/**
 * Converte DoseRecord[] do RooCode em PKDose[] que o pk-individual-chart consome.
 * Filtra por substância específica.
 */
function buildPKDosesForSubstance(substance: string): PKDose[] {
  const canonical: Record<string, string> = {
    lexapro: 'escitalopram',
    venvanse: 'lisdexamfetamine',
    vyvanse: 'lisdexamfetamine',
    lamictal: 'lamotrigine',
  }
  const medId = canonical[substance] ?? substance
  return MOCK_DOSES.filter((d) => {
    const mapped = canonical[d.substance] ?? d.substance
    return mapped === medId
  }).map((d) => ({
    medicationId: medId,
    timestamp: new Date(d.taken_at).getTime(),
    doseAmount: d.dose_mg,
  }))
}

function DemoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.35rem] border border-slate-900/10 bg-white/80 p-4 shadow-[0_16px_34px_rgba(17,35,30,0.06)] backdrop-blur">
      <h3 className="mb-3 font-serif text-lg font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  )
}

export function ChartsDemo() {
  const weeklyPattern = useMemo(() => buildWeeklyPattern(MOCK_SNAPSHOTS), [])
  const timelinePoints = useMemo(
    () => buildTimelineSeries(MOCK_SNAPSHOTS, ['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']),
    [],
  )
  const lexapro = useMemo(() => buildPKMedication('lexapro'), [])
  const lexaproDoses = useMemo(() => buildPKDosesForSubstance('lexapro'), [])
  const sparklineData = useMemo(
    () => MOCK_SNAPSHOTS.map((s) => s.health?.restingHeartRate ?? null),
    [],
  )

  return (
    <div className="app-shell">
      <header className="mb-6">
        <span className="eyebrow">Demo Harness</span>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-slate-900">
          Charts Demo — Fase 2+3
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Renderização isolada de todos os 14 charts portados, alimentados por{' '}
          <code>MOCK_SNAPSHOTS</code> (14 dias determinísticos). A correlação HRV × Valence do mock
          foi construída com R ≈ 0.45 — deve aparecer verde forte no heatmap.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DemoCard title="Sparkline (RHR 14d)">
          <Sparkline data={sparklineData} width={320} height={60} color="#0f766e" />
        </DemoCard>

        <DemoCard title="Timeline Chart (sleep + HRV + RHR)">
          <TimelineChart
            data={timelinePoints}
            seriesKeys={['sleepTotalHours', 'hrvSdnn', 'restingHeartRate']}
            labels={{
              sleepTotalHours: 'Sono (h)',
              hrvSdnn: 'HRV (ms)',
              restingHeartRate: 'FC Repouso (bpm)',
              spo2: 'SpO₂',
              activeEnergyKcal: 'Energia Ativa',
              exerciseMinutes: 'Exercício',
              movementMinutes: 'Movimento',
              standingMinutes: 'Em Pé',
              daylightMinutes: 'Luz Natural',
              sleepEfficiencyPct: 'Eficiência Sono',
              valence: 'Humor',
            }}
          />
        </DemoCard>

        <DemoCard title="Sleep Stages">
          <SleepStagesChart snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="HRV Analysis">
          <HrvAnalysis snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="Heart Rate Bands">
          <HeartRateBands snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="SpO₂">
          <Spo2Chart snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="Activity Bars">
          <ActivityBars snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="Weekly Pattern">
          <WeeklyPatternChart pattern={weeklyPattern} snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="Mood Timeline">
          <MoodTimeline snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="Mood Donut">
          <MoodDonut snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="Correlation Heatmap">
          <CorrelationHeatmap snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="Scatter Correlation">
          <ScatterCorrelation snapshots={MOCK_SNAPSHOTS} />
        </DemoCard>

        <DemoCard title="PK Concentration (all meds)">
          <PKConcentrationChart
            medicationRows={MOCK_MED_ROWS}
            regimen={MOCK_REGIMEN}
            snapshots={MOCK_SNAPSHOTS}
          />
        </DemoCard>

        <DemoCard title="PK Individual (Lexapro 40mg)">
          {lexapro ? (
            <PKIndividualChart
              medication={lexapro}
              doses={lexaproDoses}
              snapshots={MOCK_SNAPSHOTS}
              color="#0f766e"
              daysRange={7}
            />
          ) : (
            <p className="text-sm text-slate-500">Lexapro não encontrado em PK_PRESETS.</p>
          )}
        </DemoCard>
      </div>
    </div>
  )
}
