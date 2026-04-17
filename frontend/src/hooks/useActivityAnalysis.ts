import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { correlate } from '@/utils/correlations'
import type { CorrelationResult } from '@/utils/statistics'

export interface WeeklyDayStats {
  dayName: string
  dayIndex: number
  avgExercise: number | null
  avgEnergy: number | null
  avgDaylight: number | null
  count: number
}

export interface LoadBalancePoint {
  date: string
  load: number | null
  recovery: number | null
  balance: number | null
}

export interface ActivityImpact {
  label: string
  description: string
  correlation: CorrelationResult | null
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function buildWeeklyPattern(snapshots: DailySnapshot[]): WeeklyDayStats[] {
  const buckets: Record<number, { exercise: number[]; energy: number[]; daylight: number[]; count: number }> = {}
  for (let i = 0; i < 7; i++) {
    buckets[i] = { exercise: [], energy: [], daylight: [], count: 0 }
  }

  for (const snap of snapshots) {
    const dow = new Date(snap.date).getDay()
    if (snap.health) buckets[dow].count += 1
    if (snap.health?.exerciseMinutes != null) buckets[dow].exercise.push(snap.health.exerciseMinutes)
    if (snap.health?.activeEnergyKcal != null) buckets[dow].energy.push(snap.health.activeEnergyKcal)
    if (snap.health?.daylightMinutes != null) buckets[dow].daylight.push(snap.health.daylightMinutes)
  }

  return DAY_NAMES.map((dayName, dayIndex) => ({
    dayName,
    dayIndex,
    avgExercise: avg(buckets[dayIndex].exercise),
    avgEnergy: avg(buckets[dayIndex].energy),
    avgDaylight: avg(buckets[dayIndex].daylight),
    count: buckets[dayIndex].count,
  }))
}

function buildLoadBalance(snapshots: DailySnapshot[]): LoadBalancePoint[] {
  return snapshots
    .filter((s) => s.health != null)
    .map((s) => {
      const health = s.health!
      const exerciseNorm = health.exerciseMinutes != null ? health.exerciseMinutes / 60 : null
      const energyNorm = health.activeEnergyKcal != null ? health.activeEnergyKcal / 500 : null
      const hrvNorm = health.hrvSdnn != null ? health.hrvSdnn / 60 : null
      const sleepNorm = health.sleepTotalHours != null ? health.sleepTotalHours / 8 : null

      const loadParts = [exerciseNorm, energyNorm].filter((v): v is number => v != null)
      const recoveryParts = [hrvNorm, sleepNorm].filter((v): v is number => v != null)

      const load = loadParts.length > 0 ? loadParts.reduce((a, b) => a + b, 0) / loadParts.length : null
      const recovery =
        recoveryParts.length > 0 ? recoveryParts.reduce((a, b) => a + b, 0) / recoveryParts.length : null
      const balance = load != null && recovery != null ? load - recovery : null

      return { date: s.date, load, recovery, balance }
    })
}

function buildImpacts(snapshots: DailySnapshot[]): ActivityImpact[] {
  return [
    {
      label: 'Exercício → Humor amanhã',
      description: 'Dias com exercício vs humor no dia seguinte',
      correlation: correlate(snapshots, 'exerciseMinutes', 'valence', 1),
    },
    {
      label: 'Energia ativa → HRV',
      description: 'Gasto energético vs variabilidade cardíaca no dia seguinte',
      correlation: correlate(snapshots, 'activeEnergyKcal', 'hrvSdnn', 1),
    },
    {
      label: 'Luz do dia → Sono',
      description: 'Exposição solar vs horas de sono na mesma noite',
      correlation: correlate(snapshots, 'daylightMinutes', 'sleepTotalHours', 0),
    },
    {
      label: 'Exercício → Sono',
      description: 'Minutos de exercício vs duração do sono na mesma noite',
      correlation: correlate(snapshots, 'exerciseMinutes', 'sleepTotalHours', 0),
    },
  ]
}

export function useActivityAnalysis(snapshots: DailySnapshot[]): {
  weeklyPattern: WeeklyDayStats[]
  loadBalance: LoadBalancePoint[]
  impacts: ActivityImpact[]
} {
  return useMemo(
    () => ({
      weeklyPattern: buildWeeklyPattern(snapshots),
      loadBalance: buildLoadBalance(snapshots),
      impacts: buildImpacts(snapshots),
    }),
    [snapshots],
  )
}
