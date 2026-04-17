import { useMemo } from 'react'

import { useDoses, useMetrics, useMood, useSleep, type DoseRecord } from '@/lib/api'
import { MOCK_DOSES, MOCK_DATES, MOCK_MED_ROWS } from '@/mocks/doseMock'
import { MOCK_SNAPSHOTS } from '@/mocks/snapshotMock'
import type { DailySnapshot, MedicationRow, OverviewMetrics } from '@/types/apple-health'
import { buildOverviewMetrics } from '@/utils/aggregation'
import { buildMedGroups, type MedGroup } from '@/utils/medication-bridge'
import {
  buildSnapshotsFromAPI,
  detectMoodDataQuality,
  type MoodDataQuality,
} from '@/utils/roocode-adapter'
import type { WeeklyDayStats } from './useActivityAnalysis'

export interface RooCodeData {
  snapshots: DailySnapshot[]
  medicationRows: MedicationRow[]
  doses: DoseRecord[]
  dates: string[]
  pkGroups: MedGroup[]
  overview: OverviewMetrics
  weeklyPattern: WeeklyDayStats[]
  moodQuality: MoodDataQuality
  loading: boolean
  error: boolean
  usedMock: boolean
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function buildWeeklyPattern(snapshots: DailySnapshot[]): WeeklyDayStats[] {
  const acc: Record<number, { exercise: number[]; energy: number[]; daylight: number[]; count: number }> = {}
  for (let i = 0; i < 7; i++) acc[i] = { exercise: [], energy: [], daylight: [], count: 0 }

  for (const snap of snapshots) {
    const dow = new Date(snap.date).getDay()
    if (snap.health) acc[dow].count += 1
    if (snap.health?.exerciseMinutes != null) acc[dow].exercise.push(snap.health.exerciseMinutes)
    if (snap.health?.activeEnergyKcal != null) acc[dow].energy.push(snap.health.activeEnergyKcal)
    if (snap.health?.daylightMinutes != null) acc[dow].daylight.push(snap.health.daylightMinutes)
  }

  const avg = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null

  return DAY_NAMES.map((dayName, dayIndex) => ({
    dayName,
    dayIndex,
    avgExercise: avg(acc[dayIndex].exercise),
    avgEnergy: avg(acc[dayIndex].energy),
    avgDaylight: avg(acc[dayIndex].daylight),
    count: acc[dayIndex].count,
  }))
}

function buildLast14Days(): string[] {
  const out: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 14; i >= 1; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export function useRooCodeData(): RooCodeData {
  const sleepQuery = useSleep()
  const metricsQuery = useMetrics()
  const moodQuery = useMood()
  const dosesQuery = useDoses(14 * 24)

  const loading =
    !USE_MOCK &&
    (sleepQuery.isLoading || metricsQuery.isLoading || moodQuery.isLoading || dosesQuery.isLoading)
  const error =
    !USE_MOCK &&
    Boolean(sleepQuery.error || metricsQuery.error || moodQuery.error || dosesQuery.error)

  const resolved = useMemo(() => {
    if (USE_MOCK) {
      return {
        snapshots: MOCK_SNAPSHOTS,
        medicationRows: MOCK_MED_ROWS,
        doses: MOCK_DOSES,
        moodQuality: detectMoodDataQuality(undefined),
        usedMock: true,
      }
    }

    const adapterOut = buildSnapshotsFromAPI({
      sleep: sleepQuery.data,
      metrics: metricsQuery.data,
      mood: moodQuery.data,
      doses: dosesQuery.data,
    })

    return {
      snapshots: adapterOut.snapshots,
      medicationRows: adapterOut.medicationRows,
      doses: dosesQuery.data ?? [],
      moodQuality: adapterOut.moodQuality,
      usedMock: false,
    }
  }, [sleepQuery.data, metricsQuery.data, moodQuery.data, dosesQuery.data])

  const pkGroups = useMemo(() => buildMedGroups(resolved.medicationRows), [resolved.medicationRows])
  const overview = useMemo(() => buildOverviewMetrics(resolved.snapshots), [resolved.snapshots])
  const weeklyPattern = useMemo(() => buildWeeklyPattern(resolved.snapshots), [resolved.snapshots])
  const dates = useMemo(() => (USE_MOCK ? MOCK_DATES : buildLast14Days()), [])

  return {
    snapshots: resolved.snapshots,
    medicationRows: resolved.medicationRows,
    doses: resolved.doses,
    dates,
    pkGroups,
    overview,
    weeklyPattern,
    moodQuality: resolved.moodQuality,
    loading,
    error,
    usedMock: resolved.usedMock,
  }
}
