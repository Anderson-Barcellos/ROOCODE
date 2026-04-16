import { format, parseISO } from 'date-fns'

import type { DailySnapshot, MedicationRow } from '@/types/apple-health'
import { mean, roundTo, toDayKey } from '@/utils/date'
import { buildDailyConcentrations, buildMedGroups } from '@/utils/medication-bridge'
import { findPresetKey, PK_PRESETS } from '@/utils/pharmacokinetics'
import { pearson, type CorrelationResult } from '@/utils/statistics'

const MED_COLORS: Record<string, string> = {
  escitalopram: '#0f766e',
  lisdexamfetamine: '#7c3aed',
  lamotrigine: '#2563eb',
  clonazepam: '#d97706',
  bacopa: '#16a34a',
  magnesium: '#0891b2',
  omega3: '#ea580c',
  vitamind3: '#ca8a04',
  piracetam: '#e11d48',
}

const DEFAULT_HEATMAP_DAYS = 21
const COVERAGE_RATIO = 0.35

export type PharmaHeatmapStatus = 'taken' | 'skipped' | 'ignored' | 'none'

export interface PharmaHeatmapCell {
  date: string
  label: string
  status: PharmaHeatmapStatus
  doseCount: number
  mood: number | null
  deltaMinutes: number | null
}

export interface PharmaHeatmapRow {
  presetKey: string
  name: string
  color: string
  adherencePct: number | null
  takenCount: number
  skippedCount: number
  ignoredCount: number
  cells: PharmaHeatmapCell[]
}

export interface PharmaHeatmap {
  dates: string[]
  rows: PharmaHeatmapRow[]
}

export interface PharmaWindowSummary {
  presetKey: string
  name: string
  color: string
  eventCount: number
  skipCount: number
  beforeMood: number | null
  sameDayMood: number | null
  nextDayMood: number | null
  sameDayShift: number | null
  nextDayShift: number | null
  skippedDayMood: number | null
  skippedDelta: number | null
}

export interface PharmaCoverageSummary {
  presetKey: string
  name: string
  color: string
  activeDays: number
  coveredDays: number
  coveragePct: number | null
  medianTimingDriftMinutes: number | null
  peakConcentration: number | null
  moodOnCoveredDays: number | null
  moodOnUncoveredDays: number | null
  coverageMoodDelta: number | null
  coverageMoodCorrelation: CorrelationResult | null
}

export interface PharmaAnalyticsPayload {
  heatmap: PharmaHeatmap
  windowSummaries: PharmaWindowSummary[]
  coverageSummaries: PharmaCoverageSummary[]
}

interface MedicationDayBucket {
  takenCount: number
  skippedCount: number
  ignoredCount: number
  deltaMinutes: number[]
}

interface MedicationEventGroup {
  presetKey: string
  name: string
  color: string
  days: Map<string, MedicationDayBucket>
}

function isTakenStatus(status: string | null | undefined): boolean {
  return /^(tomado|taken|completed|yes|sim)/i.test(status ?? '')
}

function isSkippedStatus(status: string | null | undefined): boolean {
  return /^(pulado|skipped|missed|no|nao|não)/i.test(status ?? '')
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function normalizePresetKey(name: string): string {
  return findPresetKey(name) ?? name.trim().toLowerCase().replace(/\s+/g, '-')
}

function resolveMedicationName(name: string): string {
  const presetKey = findPresetKey(name)
  if (!presetKey) return name
  return PK_PRESETS[presetKey]?.name ?? name
}

function resolveMedicationColor(presetKey: string): string {
  return MED_COLORS[presetKey] ?? '#94a3b8'
}

function formatShortDate(date: string): string {
  try {
    return format(parseISO(date), 'dd/MM')
  } catch {
    return date
  }
}

function getTimingDeltaMinutes(row: MedicationRow): number | null {
  if (!row.date || !row.scheduledDate) return null
  const actual = new Date(row.date).getTime()
  const scheduled = new Date(row.scheduledDate).getTime()
  if (!Number.isFinite(actual) || !Number.isFinite(scheduled)) return null

  const deltaMinutes = Math.round((actual - scheduled) / 60000)
  return Math.abs(deltaMinutes) <= 720 ? deltaMinutes : null
}

function buildMedicationEventGroups(rows: MedicationRow[]): Map<string, MedicationEventGroup> {
  const groups = new Map<string, MedicationEventGroup>()

  for (const row of rows) {
    if (!row.medication) continue
    const date = toDayKey(row.date)
    if (!date) continue

    const presetKey = normalizePresetKey(row.medication)
    const group = groups.get(presetKey) ?? {
      presetKey,
      name: resolveMedicationName(row.medication),
      color: resolveMedicationColor(presetKey),
      days: new Map<string, MedicationDayBucket>(),
    }

    const bucket = group.days.get(date) ?? {
      takenCount: 0,
      skippedCount: 0,
      ignoredCount: 0,
      deltaMinutes: [],
    }

    if (isTakenStatus(row.status)) {
      bucket.takenCount += 1
      const deltaMinutes = getTimingDeltaMinutes(row)
      if (deltaMinutes != null) {
        bucket.deltaMinutes.push(deltaMinutes)
      }
    } else if (isSkippedStatus(row.status)) {
      bucket.skippedCount += 1
    } else {
      bucket.ignoredCount += 1
    }

    group.days.set(date, bucket)
    groups.set(presetKey, group)
  }

  return groups
}

function buildTimelineDates(
  dates: string[],
  snapshots: DailySnapshot[],
  eventGroups: Map<string, MedicationEventGroup>,
  heatmapDays: number,
): string[] {
  const availableDates = new Set<string>()
  for (const date of dates) {
    if (date) availableDates.add(date)
  }
  for (const snapshot of snapshots) {
    if (snapshot.date) availableDates.add(snapshot.date)
  }
  for (const group of eventGroups.values()) {
    for (const date of group.days.keys()) {
      availableDates.add(date)
    }
  }

  return [...availableDates]
    .sort((left, right) => left.localeCompare(right))
    .slice(-heatmapDays)
}

function averageMoodForDates(dateKeys: string[], moodByDate: Map<string, number | null>): number | null {
  return roundTo(mean(dateKeys.map((date) => moodByDate.get(date) ?? null)), 2)
}

function buildWindowSummaries(
  sortedDates: string[],
  moodByDate: Map<string, number | null>,
  eventGroups: Map<string, MedicationEventGroup>,
): PharmaWindowSummary[] {
  const dateIndex = new Map(sortedDates.map((date, index) => [date, index]))

  return [...eventGroups.values()]
    .map((group) => {
      const takenDates: string[] = []
      const skippedDates: string[] = []

      for (const [date, bucket] of group.days.entries()) {
        if (bucket.takenCount > 0) takenDates.push(date)
        if (bucket.skippedCount > 0) skippedDates.push(date)
      }

      const previousDates = takenDates
        .map((date) => {
          const index = dateIndex.get(date)
          return index != null && index > 0 ? sortedDates[index - 1] : null
        })
        .filter((date): date is string => Boolean(date))

      const nextDates = takenDates
        .map((date) => {
          const index = dateIndex.get(date)
          return index != null && index < sortedDates.length - 1 ? sortedDates[index + 1] : null
        })
        .filter((date): date is string => Boolean(date))

      const beforeMood = averageMoodForDates(previousDates, moodByDate)
      const sameDayMood = averageMoodForDates(takenDates, moodByDate)
      const nextDayMood = averageMoodForDates(nextDates, moodByDate)
      const skippedDayMood = averageMoodForDates(skippedDates, moodByDate)

      return {
        presetKey: group.presetKey,
        name: group.name,
        color: group.color,
        eventCount: takenDates.length,
        skipCount: skippedDates.length,
        beforeMood,
        sameDayMood,
        nextDayMood,
        sameDayShift: beforeMood != null && sameDayMood != null ? roundTo(sameDayMood - beforeMood, 2) : null,
        nextDayShift: beforeMood != null && nextDayMood != null ? roundTo(nextDayMood - beforeMood, 2) : null,
        skippedDayMood,
        skippedDelta: skippedDayMood != null && sameDayMood != null ? roundTo(sameDayMood - skippedDayMood, 2) : null,
      }
    })
    .filter((summary) => summary.eventCount > 0)
    .sort((left, right) => right.eventCount - left.eventCount)
}

function buildCoverageSummaries(
  medicationRows: MedicationRow[],
  sortedDates: string[],
  moodByDate: Map<string, number | null>,
  eventGroups: Map<string, MedicationEventGroup>,
): PharmaCoverageSummary[] {
  if (!sortedDates.length) return []

  const medGroups = buildMedGroups(medicationRows)
  if (!medGroups.length) return []

  const dailyConcentrations = buildDailyConcentrations(medGroups, sortedDates)

  return medGroups
    .map((group) => {
      const concentrations = dailyConcentrations[group.presetKey] ?? []
      const validConcentrations = concentrations.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value),
      )
      if (!validConcentrations.length) return null

      const peakConcentration = Math.max(...validConcentrations)
      const therapeuticMin = group.medication.therapeuticRange?.min ?? null
      const coverageFloor = therapeuticMin ?? peakConcentration * COVERAGE_RATIO

      const coverageBinary = concentrations.map((value) => {
        if (value == null || !Number.isFinite(value)) return null
        return value >= coverageFloor ? 1 : 0
      })

      const moodValues = sortedDates.map((date) => moodByDate.get(date) ?? null)
      const coveredMood = mean(
        moodValues.map((value, index) => (coverageBinary[index] === 1 ? value : null)),
      )
      const uncoveredMood = mean(
        moodValues.map((value, index) => (coverageBinary[index] === 0 ? value : null)),
      )
      const coverageDays = coverageBinary.filter((value) => value === 1).length

      const timingValues = [...(eventGroups.get(group.presetKey)?.days.values() ?? [])]
        .flatMap((bucket) => bucket.deltaMinutes)
      const correlation = pearson(coverageBinary, moodValues)

      return {
        presetKey: group.presetKey,
        name: group.medication.name,
        color: resolveMedicationColor(group.presetKey),
        activeDays: validConcentrations.length,
        coveredDays: coverageDays,
        coveragePct: roundTo((coverageDays / validConcentrations.length) * 100, 1),
        medianTimingDriftMinutes: roundTo(median(timingValues), 0),
        peakConcentration: roundTo(peakConcentration, 1),
        moodOnCoveredDays: roundTo(coveredMood, 2),
        moodOnUncoveredDays: roundTo(uncoveredMood, 2),
        coverageMoodDelta:
          coveredMood != null && uncoveredMood != null ? roundTo(coveredMood - uncoveredMood, 2) : null,
        coverageMoodCorrelation: correlation,
      }
    })
    .filter((summary): summary is PharmaCoverageSummary => summary !== null)
    .sort((left, right) => (right.coveragePct ?? 0) - (left.coveragePct ?? 0))
}

export function buildPharmaAnalyticsPayload(
  medicationRows: MedicationRow[],
  snapshots: DailySnapshot[],
  dates: string[],
  options?: { heatmapDays?: number },
): PharmaAnalyticsPayload {
  const heatmapDays = options?.heatmapDays ?? DEFAULT_HEATMAP_DAYS
  const eventGroups = buildMedicationEventGroups(medicationRows)
  const timelineDates = buildTimelineDates(dates, snapshots, eventGroups, heatmapDays)
  const moodByDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot.mood?.valence ?? null]))

  const heatmapRows: PharmaHeatmapRow[] = [...eventGroups.values()]
    .map((group) => {
      let takenCount = 0
      let skippedCount = 0
      let ignoredCount = 0

      const cells = timelineDates.map((date) => {
        const bucket = group.days.get(date)
        if (!bucket) {
          return {
            date,
            label: formatShortDate(date),
            status: 'none' as const,
            doseCount: 0,
            mood: moodByDate.get(date) ?? null,
            deltaMinutes: null,
          }
        }

        takenCount += bucket.takenCount
        skippedCount += bucket.skippedCount
        ignoredCount += bucket.ignoredCount

        const status: PharmaHeatmapStatus = bucket.takenCount > 0
          ? 'taken'
          : bucket.skippedCount > 0
            ? 'skipped'
            : bucket.ignoredCount > 0
              ? 'ignored'
              : 'none'

        return {
          date,
          label: formatShortDate(date),
          status,
          doseCount: bucket.takenCount + bucket.skippedCount + bucket.ignoredCount,
          mood: moodByDate.get(date) ?? null,
          deltaMinutes: roundTo(median(bucket.deltaMinutes), 0),
        }
      })

      const decisionCount = takenCount + skippedCount

      return {
        presetKey: group.presetKey,
        name: group.name,
        color: group.color,
        adherencePct: decisionCount > 0 ? roundTo((takenCount / decisionCount) * 100, 1) : null,
        takenCount,
        skippedCount,
        ignoredCount,
        cells,
      }
    })
    .sort((left, right) => (right.takenCount + right.skippedCount) - (left.takenCount + left.skippedCount))

  return {
    heatmap: {
      dates: timelineDates,
      rows: heatmapRows,
    },
    windowSummaries: buildWindowSummaries(
      [...new Set([...dates, ...snapshots.map((snapshot) => snapshot.date)])].sort((left, right) => left.localeCompare(right)),
      moodByDate,
      eventGroups,
    ),
    coverageSummaries: buildCoverageSummaries(
      medicationRows,
      [...new Set([...dates, ...snapshots.map((snapshot) => snapshot.date)])].sort((left, right) => left.localeCompare(right)),
      moodByDate,
      eventGroups,
    ),
  }
}
