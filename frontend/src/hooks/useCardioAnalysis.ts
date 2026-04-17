import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { mean } from '@/utils/date'

export interface HrvBaselineBand {
  date: string
  mean: number
  upper: number
  lower: number
}

export interface OvertrainingStatus {
  isOvertrained: boolean
  daysElevated: number
  baselineMean: number
  baselineUpper: number
}

export interface RecoveryScore {
  score: number | null
  hrvComponent: number | null
  fcComponent: number | null
  sleepComponent: number | null
  tone: 'positive' | 'neutral' | 'negative'
  label: string
  sparkline: Array<number | null>
}

const BASELINE_WINDOW = 14
const OVERTRAINING_MIN_DAYS = 7

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function computeHrvBaselineBands(snapshots: DailySnapshot[]): HrvBaselineBand[] {
  const bands: HrvBaselineBand[] = []

  for (let i = 0; i < snapshots.length; i++) {
    const start = Math.max(0, i - BASELINE_WINDOW)
    const windowSlice = snapshots.slice(start, i)
    const hrvValues = windowSlice
      .map((s) => s.health?.hrvSdnn ?? null)
      .filter((v): v is number => v != null && Number.isFinite(v))

    if (hrvValues.length < 2) continue

    const avg = hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length
    const sd = stdDev(hrvValues)
    bands.push({
      date: snapshots[i].date,
      mean: avg,
      upper: avg + sd,
      lower: avg - sd,
    })
  }

  return bands
}

function computeOvertrainingStatus(snapshots: DailySnapshot[]): OvertrainingStatus | null {
  const rhrWithDates = snapshots
    .map((s) => ({ date: s.date, rhr: s.health?.restingHeartRate ?? null }))
    .filter((x): x is { date: string; rhr: number } => x.rhr != null && Number.isFinite(x.rhr))

  if (rhrWithDates.length < OVERTRAINING_MIN_DAYS) return null

  const baselineEndIndex = Math.max(0, rhrWithDates.length - OVERTRAINING_MIN_DAYS)
  const baselinePool =
    baselineEndIndex > 0 ? rhrWithDates.slice(0, baselineEndIndex) : rhrWithDates
  const baselineValues = baselinePool.map((x) => x.rhr)
  const baselineMean = baselineValues.reduce((sum, v) => sum + v, 0) / baselineValues.length
  const baselineUpper = baselineMean + stdDev(baselineValues)

  let daysElevated = 0
  for (let i = rhrWithDates.length - 1; i >= 0; i--) {
    if (rhrWithDates[i].rhr > baselineUpper) {
      daysElevated += 1
    } else {
      break
    }
  }

  return {
    isOvertrained: daysElevated >= OVERTRAINING_MIN_DAYS,
    daysElevated,
    baselineMean,
    baselineUpper,
  }
}

function computeDayScore(
  snapshot: DailySnapshot,
  hrvBaseline: number | null,
  rhrBaseline: number | null,
): number | null {
  const health = snapshot.health
  if (!health) return null

  const components: Array<{ value: number; weight: number }> = []

  if (hrvBaseline && health.hrvSdnn != null && Number.isFinite(health.hrvSdnn)) {
    const ratio = clamp(health.hrvSdnn / hrvBaseline, 0, 2)
    components.push({ value: clamp(ratio * 50, 0, 100), weight: 0.4 })
  }

  if (rhrBaseline && health.restingHeartRate != null && Number.isFinite(health.restingHeartRate)) {
    const ratio = clamp(rhrBaseline / health.restingHeartRate, 0, 2)
    components.push({ value: clamp(ratio * 50, 0, 100), weight: 0.3 })
  }

  const sleepParts: number[] = []
  if (health.sleepTotalHours != null && Number.isFinite(health.sleepTotalHours)) {
    sleepParts.push(clamp((health.sleepTotalHours / 8) * 100, 0, 100))
  }
  if (health.sleepEfficiencyPct != null && Number.isFinite(health.sleepEfficiencyPct)) {
    sleepParts.push(clamp(health.sleepEfficiencyPct, 0, 100))
  }
  if (sleepParts.length > 0) {
    const sleepAvg = sleepParts.reduce((sum, v) => sum + v, 0) / sleepParts.length
    components.push({ value: sleepAvg, weight: 0.3 })
  }

  if (components.length === 0) return null

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0)
  const weightedSum = components.reduce((sum, c) => sum + c.value * c.weight, 0)
  return Math.round(weightedSum / totalWeight)
}

function computeRecoveryScore(snapshots: DailySnapshot[]): RecoveryScore | null {
  if (snapshots.length === 0) {
    return null
  }

  const withHealth = snapshots.filter((s) => s.health != null)
  if (withHealth.length === 0) {
    return {
      score: null,
      hrvComponent: null,
      fcComponent: null,
      sleepComponent: null,
      tone: 'neutral',
      label: 'Sem dados',
      sparkline: snapshots.map(() => null),
    }
  }

  const today = withHealth[withHealth.length - 1]
  const historyPool = withHealth.slice(0, -1).slice(-BASELINE_WINDOW)

  const hrvHistory = historyPool
    .map((s) => s.health?.hrvSdnn ?? null)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const rhrHistory = historyPool
    .map((s) => s.health?.restingHeartRate ?? null)
    .filter((v): v is number => v != null && Number.isFinite(v))

  const hrvBaseline = hrvHistory.length > 0 ? mean(hrvHistory) : null
  const rhrBaseline = rhrHistory.length > 0 ? mean(rhrHistory) : null

  const hrvComponent =
    hrvBaseline && today.health?.hrvSdnn != null
      ? Math.round(clamp((today.health.hrvSdnn / hrvBaseline) * 50, 0, 100))
      : null
  const fcComponent =
    rhrBaseline && today.health?.restingHeartRate != null
      ? Math.round(clamp((rhrBaseline / today.health.restingHeartRate) * 50, 0, 100))
      : null

  const sleepParts: number[] = []
  if (today.health?.sleepTotalHours != null && Number.isFinite(today.health.sleepTotalHours)) {
    sleepParts.push(clamp((today.health.sleepTotalHours / 8) * 100, 0, 100))
  }
  if (today.health?.sleepEfficiencyPct != null && Number.isFinite(today.health.sleepEfficiencyPct)) {
    sleepParts.push(clamp(today.health.sleepEfficiencyPct, 0, 100))
  }
  const sleepComponent =
    sleepParts.length > 0
      ? Math.round(sleepParts.reduce((sum, v) => sum + v, 0) / sleepParts.length)
      : null

  const score = computeDayScore(today, hrvBaseline, rhrBaseline)
  const sparkline = snapshots.map((snap) => computeDayScore(snap, hrvBaseline, rhrBaseline))

  let tone: RecoveryScore['tone'] = 'neutral'
  let label = 'Recuperação moderada'
  if (score == null) {
    tone = 'neutral'
    label = 'Sem dados'
  } else if (score > 70) {
    tone = 'positive'
    label = score > 85 ? 'Recuperação excelente' : 'Recuperação boa'
  } else if (score < 40) {
    tone = 'negative'
    label = 'Recuperação baixa'
  }

  return {
    score,
    hrvComponent,
    fcComponent,
    sleepComponent,
    tone,
    label,
    sparkline,
  }
}

export function useCardioAnalysis(snapshots: DailySnapshot[]): {
  hrvBaselineBands: HrvBaselineBand[]
  overtrainingStatus: OvertrainingStatus | null
  recoveryScore: RecoveryScore | null
} {
  return useMemo(
    () => ({
      hrvBaselineBands: computeHrvBaselineBands(snapshots),
      overtrainingStatus: computeOvertrainingStatus(snapshots),
      recoveryScore: computeRecoveryScore(snapshots),
    }),
    [snapshots],
  )
}
