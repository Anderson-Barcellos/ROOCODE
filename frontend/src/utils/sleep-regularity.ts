import { isWeekend } from 'date-fns'

import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

const REGULARITY_WINDOW_DAYS = 14
const REGULARITY_MIN_NIGHTS = 5
const SOCIAL_JET_LAG_WINDOW_DAYS = 30

export interface SleepTimingPoint {
  date: string
  sleepStartAt: string
  sleepEndAt: string
  midpointMinutes: number
  durationHours: number
  weekend: boolean
}

export interface SleepRegularityPoint {
  date: string
  score: number | null
  confidence: number
  nightsUsed: number
  onsetDeviationMinutes: number | null
  offsetDeviationMinutes: number | null
  reason?: 'timing_missing' | 'insufficient_nights'
  evidence: IndexEvidenceReport
}

export interface SocialJetLagSummary {
  hours: number | null
  signedHours: number | null
  confidence: number
  weekdayNights: number
  weekendNights: number
  exploratory: boolean
  weekdayMidpointMinutes: number | null
  weekendMidpointMinutes: number | null
  reason?: 'timing_missing' | 'insufficient_split'
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function localMinutesSinceMidnight(input: string): number | null {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return null
  return date.getHours() * 60 + date.getMinutes()
}

function circularDistanceMinutes(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1440
  return Math.min(diff, 1440 - diff)
}

function signedCircularDeltaMinutes(from: number, to: number): number {
  let diff = (to - from) % 1440
  if (diff > 720) diff -= 1440
  if (diff < -720) diff += 1440
  return diff
}

function circularMeanMinutes(values: number[]): number {
  const vectors = values.map((value) => {
    const angle = (value / 1440) * 2 * Math.PI
    return { x: Math.cos(angle), y: Math.sin(angle) }
  })
  const meanX = vectors.reduce((sum, vector) => sum + vector.x, 0) / vectors.length
  const meanY = vectors.reduce((sum, vector) => sum + vector.y, 0) / vectors.length
  let angle = Math.atan2(meanY, meanX)
  if (angle < 0) angle += 2 * Math.PI
  return (angle / (2 * Math.PI)) * 1440
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function extractSleepTimingPoints(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepTimingPoint[] {
  return snapshots
    .map((snapshot) => {
      const sleepStartAt = snapshot.health?.sleepStartAt ?? null
      const sleepEndAt = snapshot.health?.sleepEndAt ?? null
      if (!sleepStartAt || !sleepEndAt) return null

      const startDate = new Date(sleepStartAt)
      const endDate = new Date(sleepEndAt)
      const midpoint = new Date((startDate.getTime() + endDate.getTime()) / 2)
      const midpointMinutes = midpoint.getHours() * 60 + midpoint.getMinutes()
      const durationHours = (endDate.getTime() - startDate.getTime()) / 3_600_000
      if (!Number.isFinite(durationHours) || durationHours <= 0) return null

      return {
        date: snapshot.date,
        sleepStartAt,
        sleepEndAt,
        midpointMinutes,
        durationHours,
        weekend: isWeekend(new Date(`${snapshot.date}T12:00:00`)),
      }
    })
    .filter((point): point is SleepTimingPoint => point !== null)
}

export function computeSleepRegularitySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepRegularityPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.sleepRegularityIndex,
    'SleepRegularity',
  )
  const timing = extractSleepTimingPoints(snapshots)
  const timingByDate = new Map(timing.map((point) => [point.date, point]))

  return snapshots.map((snapshot, index) => {
    const current = timingByDate.get(snapshot.date)
    if (!current) {
      return {
        date: snapshot.date,
        score: null,
        confidence: 0,
        nightsUsed: 0,
        onsetDeviationMinutes: null,
        offsetDeviationMinutes: null,
        reason: 'timing_missing',
        evidence: buildIndexEvidenceReport({
          eligible: false,
          reason: 'inputs_missing',
          inputsUsed: [],
          inputsMissing: ['sleepStartAt', 'sleepEndAt'],
          proxiesUsed: [],
          usedInterpolated: false,
          confidencePenalty: 0,
          readiness: readiness.status,
        }),
      }
    }

    const recent = snapshots
      .slice(Math.max(0, index - REGULARITY_WINDOW_DAYS + 1), index + 1)
      .map((item) => timingByDate.get(item.date) ?? null)
      .filter((point): point is SleepTimingPoint => point !== null)

    if (recent.length < REGULARITY_MIN_NIGHTS) {
      return {
        date: snapshot.date,
        score: null,
        confidence: recent.length / REGULARITY_WINDOW_DAYS,
        nightsUsed: recent.length,
        onsetDeviationMinutes: null,
        offsetDeviationMinutes: null,
        reason: 'insufficient_nights',
        evidence: buildIndexEvidenceReport({
          eligible: false,
          reason: 'insufficient_readiness',
          inputsUsed: ['sleepStartAt', 'sleepEndAt'],
          inputsMissing: [],
          proxiesUsed: [],
          usedInterpolated: false,
          confidencePenalty: recent.length / REGULARITY_WINDOW_DAYS,
          readiness: readiness.status,
        }),
      }
    }

    const onsetMinutes = recent
      .map((point) => localMinutesSinceMidnight(point.sleepStartAt))
      .filter((value): value is number => value != null)
    const offsetMinutes = recent
      .map((point) => localMinutesSinceMidnight(point.sleepEndAt))
      .filter((value): value is number => value != null)

    const onsetCenter = circularMeanMinutes(onsetMinutes)
    const offsetCenter = circularMeanMinutes(offsetMinutes)
    const onsetDeviation = mean(onsetMinutes.map((value) => circularDistanceMinutes(value, onsetCenter)))
    const offsetDeviation = mean(offsetMinutes.map((value) => circularDistanceMinutes(value, offsetCenter)))
    const combinedDeviation = ((onsetDeviation ?? 0) + (offsetDeviation ?? 0)) / 2
    const score = 100 * (1 - clamp(combinedDeviation / 180, 0, 1))

    const eligible = readiness.status !== 'standby'
    return {
      date: snapshot.date,
      score: eligible ? score : null,
      confidence: Math.min(1, recent.length / REGULARITY_WINDOW_DAYS),
      nightsUsed: recent.length,
      onsetDeviationMinutes: onsetDeviation,
      offsetDeviationMinutes: offsetDeviation,
      reason: eligible ? undefined : 'insufficient_nights',
      evidence: buildIndexEvidenceReport({
        eligible,
        reason: eligible ? 'ok' : 'insufficient_readiness',
        inputsUsed: ['sleepStartAt', 'sleepEndAt'],
        inputsMissing: [],
        proxiesUsed: [],
        usedInterpolated: false,
        confidencePenalty: Math.min(1, recent.length / REGULARITY_WINDOW_DAYS),
        readiness: readiness.status,
      }),
    }
  })
}

export function computeLatestSocialJetLag(
  snapshots: ReadonlyArray<DailySnapshot>,
): SocialJetLagSummary {
  const timing = extractSleepTimingPoints(snapshots).slice(-SOCIAL_JET_LAG_WINDOW_DAYS)
  if (!timing.length) {
    return {
      hours: null,
      signedHours: null,
      confidence: 0,
      weekdayNights: 0,
      weekendNights: 0,
      exploratory: true,
      weekdayMidpointMinutes: null,
      weekendMidpointMinutes: null,
      reason: 'timing_missing',
    }
  }

  const weekday = timing.filter((point) => !point.weekend)
  const weekend = timing.filter((point) => point.weekend)
  if (weekday.length < 3 || weekend.length < 2) {
    return {
      hours: null,
      signedHours: null,
      confidence: Math.min(1, timing.length / SOCIAL_JET_LAG_WINDOW_DAYS),
      weekdayNights: weekday.length,
      weekendNights: weekend.length,
      exploratory: true,
      weekdayMidpointMinutes: null,
      weekendMidpointMinutes: null,
      reason: 'insufficient_split',
    }
  }

  const weekdayMean = circularMeanMinutes(weekday.map((point) => point.midpointMinutes))
  const weekendMean = circularMeanMinutes(weekend.map((point) => point.midpointMinutes))
  const signedDeltaMinutes = signedCircularDeltaMinutes(weekdayMean, weekendMean)

  return {
    hours: Math.abs(signedDeltaMinutes) / 60,
    signedHours: signedDeltaMinutes / 60,
    confidence: Math.min(1, (weekday.length + weekend.length) / SOCIAL_JET_LAG_WINDOW_DAYS),
    weekdayNights: weekday.length,
    weekendNights: weekend.length,
    exploratory: weekday.length < 7 || weekend.length < 3,
    weekdayMidpointMinutes: weekdayMean,
    weekendMidpointMinutes: weekendMean,
  }
}
