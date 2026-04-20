/**
 * Bridge entre MedicationRow[] (CSV Apple Health) e a engine PK.
 * Transforma as linhas parsadas em medicamentos + doses com timestamps.
 */

import type { DailySnapshot, MedicationRow } from '../types/apple-health'
import type {
  ExpandedPKDose,
  MedicationRegimenEntry,
  PKLagCorrelationRow,
  PKTimelinePoint,
  PKTimelineSeries,
} from '../types/pharmacology'
import {
  buildPKMedication,
  calculateConcentration,
  computeTrendFromSamples,
  DEFAULT_PK_BODY_WEIGHT_KG,
  findPresetKey,
  getTrendWindowMs,
  mgFromCount,
  PK_PRESETS,
  singleDoseConcentrationAtHours,
  type PKDose,
  type PKMedication,
} from './pharmacokinetics'
import { pearson } from './statistics'

export interface MedGroup {
  medication: PKMedication
  doses: PKDose[]
  presetKey: string
}

export interface ExpandedMedGroup {
  medication: PKMedication
  doses: ExpandedPKDose[]
  presetKey: string
  color: string
}

export interface PKOverlayChartDatum {
  timestamp: number
  date: string
  label: string
  mood: number | null
  [key: string]: string | number | null
}

export interface PKTimelinePayload {
  series: PKTimelineSeries[]
  chartData: PKOverlayChartDatum[]
  correlations: PKLagCorrelationRow[]
}

interface PKTimelineOptions {
  startTime?: number
  endTime?: number
  resolutionMinutes?: number
  bodyWeightKg?: number
  maxLagDays?: number
}

const DEFAULT_RESOLUTION_MINUTES = 60
const MAX_WARMUP_DAYS = 90
export const REGIMEN_REPLACEMENT_WINDOW_MS = 4 * 60 * 60 * 1000

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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dayKeyFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function labelFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dayStartTimestamp(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00`).getTime()
}

function timestampForDateTime(dateKey: string, time: string): number {
  return new Date(`${dateKey}T${time}:00`).getTime()
}

function medFromPresetKey(presetKey: string): PKMedication | null {
  const preset = PK_PRESETS[presetKey]
  if (!preset) return null
  return { id: presetKey, ...preset }
}

function colorForPreset(presetKey: string, color?: string | null): string {
  return color ?? MED_COLORS[presetKey] ?? '#64748b'
}

function isMoodAnchor(timestamp: number): boolean {
  const date = new Date(timestamp)
  return date.getHours() === 12 && date.getMinutes() === 0
}

function uniqueSortedDates(snapshots: DailySnapshot[]): string[] {
  return [...new Set(snapshots.map((snapshot) => snapshot.date))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
}

function doseToMg(presetKey: string, amount: number | null, unit: string | null): number | null {
  if (amount == null || !Number.isFinite(amount)) return null

  const normalizedUnit = unit?.trim().toLowerCase()
  if (!normalizedUnit) {
    return mgFromCount(presetKey, amount)
  }

  if (normalizedUnit === 'mg' || normalizedUnit === 'miligrama' || normalizedUnit === 'miligramas') {
    return amount
  }
  if (normalizedUnit === 'mcg' || normalizedUnit === 'µg' || normalizedUnit === 'ug') {
    return amount / 1000
  }
  if (normalizedUnit === 'g' || normalizedUnit === 'grama' || normalizedUnit === 'gramas') {
    return amount * 1000
  }

  return mgFromCount(presetKey, amount)
}

/** Transforma MedicationRow[] em grupos por medicamento com doses timestampadas. */
export function buildMedGroups(rows: MedicationRow[]): MedGroup[] {
  const groups = new Map<string, MedGroup>()

  for (const row of rows) {
    if (!row.date || !row.medication) continue
    if (row.status && !/^(tomado|taken|completed|yes|sim)/i.test(row.status)) continue

    const presetKey = findPresetKey(row.medication)
    if (!presetKey) continue

    const med = buildPKMedication(row.medication)
    if (!med) continue

    const timestamp = new Date(row.date).getTime()
    if (!Number.isFinite(timestamp)) continue

    const sourceDose = row.dosage ?? row.scheduledDosage ?? 1
    const doseAmount = doseToMg(presetKey, sourceDose, row.unit)
    if (doseAmount == null || doseAmount <= 0) continue

    if (!groups.has(presetKey)) {
      groups.set(presetKey, { medication: med, doses: [], presetKey })
    }

    groups.get(presetKey)!.doses.push({
      medicationId: presetKey,
      timestamp,
      doseAmount,
    })
  }

  // Deduplica por dateOnly+presetKey: agrupa doses do mesmo dia, soma doseAmount.
  // Evita double-counting quando o Apple Health registra múltiplas entradas/dia.
  for (const group of groups.values()) {
    const dedupMap = new Map<string, PKDose>()
    for (const dose of group.doses) {
      const dateKey = new Date(dose.timestamp).toISOString().slice(0, 10)
      const existing = dedupMap.get(dateKey)
      if (!existing) {
        dedupMap.set(dateKey, { ...dose })
      } else {
        existing.doseAmount += dose.doseAmount
      }
    }
    group.doses = [...dedupMap.values()].sort((a, b) => a.timestamp - b.timestamp)
  }

  return [...groups.values()]
}

function buildLoggedExpandedDoses(rows: MedicationRow[]): ExpandedPKDose[] {
  const doses: ExpandedPKDose[] = []

  for (const row of rows) {
    if (!row.date || !row.medication) continue
    if (row.status && !/^(tomado|taken|completed|yes|sim)/i.test(row.status)) continue

    const presetKey = findPresetKey(row.medication)
    if (!presetKey) continue

    const timestamp = new Date(row.date).getTime()
    if (!Number.isFinite(timestamp)) continue

    const sourceDose = row.dosage ?? row.scheduledDosage ?? 1
    const doseAmount = doseToMg(presetKey, sourceDose, row.unit)
    if (doseAmount == null || doseAmount <= 0) continue

    doses.push({
      medicationId: presetKey,
      timestamp,
      doseAmount,
      source: 'logged',
      loggedDoseId: row.id != null ? String(row.id) : null,
    })
  }

  return doses.sort((left, right) => left.timestamp - right.timestamp)
}

export function expandRegimenDoses(
  regimen: MedicationRegimenEntry[],
  medicationRows: MedicationRow[],
  windowStart: number,
  windowEnd: number,
  replacementWindowMs = REGIMEN_REPLACEMENT_WINDOW_MS,
): ExpandedPKDose[] {
  const logged = buildLoggedExpandedDoses(medicationRows)
  const usedLogged = new Set<number>()
  const result: ExpandedPKDose[] = []

  const startDateKey = dayKeyFromTimestamp(windowStart)
  const endDateKey = dayKeyFromTimestamp(windowEnd)
  const cursor = new Date(`${startDateKey}T00:00:00`)
  const endDay = new Date(`${endDateKey}T00:00:00`).getTime()

  while (cursor.getTime() <= endDay) {
    const dateKey = dayKeyFromTimestamp(cursor.getTime())
    const dayOfWeek = cursor.getDay()

    for (const entry of regimen) {
      if (!entry.active) continue
      if (entry.start_date && dateKey < entry.start_date) continue
      if (entry.end_date && dateKey > entry.end_date) continue
      if (!entry.days_of_week.includes(dayOfWeek)) continue

      const presetKey = findPresetKey(entry.substance)
      if (!presetKey) continue

      for (const time of entry.times) {
        const scheduledTimestamp = timestampForDateTime(dateKey, time)
        if (!Number.isFinite(scheduledTimestamp)) continue
        if (scheduledTimestamp < windowStart || scheduledTimestamp > windowEnd) continue

        const matchedLoggedIndex = logged.findIndex((dose, index) => (
          !usedLogged.has(index) &&
          dose.medicationId === presetKey &&
          Math.abs(dose.timestamp - scheduledTimestamp) <= replacementWindowMs
        ))

        if (matchedLoggedIndex >= 0) {
          usedLogged.add(matchedLoggedIndex)
          result.push({
            ...logged[matchedLoggedIndex],
            scheduledTimestamp,
          })
        } else {
          result.push({
            medicationId: presetKey,
            timestamp: scheduledTimestamp,
            doseAmount: entry.dose_mg,
            source: 'regimen',
            scheduledTimestamp,
          })
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  for (let index = 0; index < logged.length; index++) {
    const dose = logged[index]
    if (usedLogged.has(index)) continue
    if (dose.timestamp < windowStart || dose.timestamp > windowEnd) continue
    result.push(dose)
  }

  return result.sort((left, right) => left.timestamp - right.timestamp)
}

export function buildExpandedMedGroups(
  regimen: MedicationRegimenEntry[],
  medicationRows: MedicationRow[],
  windowStart: number,
  windowEnd: number,
): ExpandedMedGroup[] {
  const expandedDoses = expandRegimenDoses(regimen, medicationRows, windowStart, windowEnd)
  const groups = new Map<string, ExpandedMedGroup>()
  const colorByPreset = new Map<string, string>()

  for (const entry of regimen) {
    const presetKey = findPresetKey(entry.substance)
    if (presetKey) colorByPreset.set(presetKey, colorForPreset(presetKey, entry.color))
  }

  for (const dose of expandedDoses) {
    const medication = medFromPresetKey(dose.medicationId)
    if (!medication) continue

    const existing = groups.get(dose.medicationId)
    if (existing) {
      existing.doses.push(dose)
    } else {
      groups.set(dose.medicationId, {
        medication,
        doses: [dose],
        presetKey: dose.medicationId,
        color: colorByPreset.get(dose.medicationId) ?? colorForPreset(dose.medicationId),
      })
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    doses: group.doses.sort((left, right) => left.timestamp - right.timestamp),
  }))
}

export function estimateReferenceCmax(
  medication: PKMedication,
  referenceDose: number,
  bodyWeightKg = DEFAULT_PK_BODY_WEIGHT_KG,
): number {
  const maxHours = Math.min(14 * 24, Math.max(24, medication.halfLife * 3))
  let max = 0
  for (let hour = 0; hour <= maxHours; hour += 0.25) {
    max = Math.max(
      max,
      singleDoseConcentrationAtHours(medication, referenceDose, hour, bodyWeightKg),
    )
  }
  return max
}

export function buildConcentrationByConvolution(
  medication: PKMedication,
  doses: ExpandedPKDose[],
  timestamps: number[],
  resolutionMinutes = DEFAULT_RESOLUTION_MINUTES,
  bodyWeightKg = DEFAULT_PK_BODY_WEIGHT_KG,
): number[] {
  if (!timestamps.length) return []

  const stepMs = resolutionMinutes * 60 * 1000
  const stepHours = resolutionMinutes / 60
  const gridStart = timestamps[0]
  const gridEnd = timestamps[timestamps.length - 1]
  const kernelHours = Math.min(MAX_WARMUP_DAYS * 24, Math.max(24, medication.halfLife * 5))
  const kernelSteps = Math.ceil(kernelHours / stepHours)
  const unitKernel = Array.from({ length: kernelSteps + 1 }, (_, index) => (
    singleDoseConcentrationAtHours(medication, 1, index * stepHours, bodyWeightKg)
  ))
  const output = new Array(timestamps.length).fill(0)
  const impulseByGridIndex = new Map<number, number>()

  for (const dose of doses) {
    if (dose.timestamp > gridEnd) continue
    if (dose.timestamp < gridStart - kernelHours * 60 * 60 * 1000) continue
    const gridIndex = Math.round((dose.timestamp - gridStart) / stepMs)
    impulseByGridIndex.set(
      gridIndex,
      (impulseByGridIndex.get(gridIndex) ?? 0) + dose.doseAmount,
    )
  }

  for (const [doseGridIndex, doseAmount] of impulseByGridIndex.entries()) {
    const firstKernelIndex = Math.max(0, -doseGridIndex)
    const lastKernelIndex = Math.min(unitKernel.length - 1, output.length - 1 - doseGridIndex)
    for (let kernelIndex = firstKernelIndex; kernelIndex <= lastKernelIndex; kernelIndex++) {
      output[doseGridIndex + kernelIndex] += doseAmount * unitKernel[kernelIndex]
    }
  }

  return output
}

function buildTimelineTimestamps(startTime: number, endTime: number, resolutionMinutes: number): number[] {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return []
  const stepMs = resolutionMinutes * 60 * 1000
  const out: number[] = []
  for (let timestamp = startTime; timestamp <= endTime; timestamp += stepMs) {
    out.push(timestamp)
  }
  if (out[out.length - 1] !== endTime) out.push(endTime)
  return out
}

function resolveVisibleWindow(snapshots: DailySnapshot[], options?: PKTimelineOptions): [number, number] | null {
  if (options?.startTime != null && options?.endTime != null) {
    return [options.startTime, options.endTime]
  }

  const dates = uniqueSortedDates(snapshots)
  if (!dates.length) return null

  const start = dayStartTimestamp(dates[0])
  const end = dayStartTimestamp(dates[dates.length - 1]) + 23 * 60 * 60 * 1000
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return [start, end]
}

function maxWarmupMs(regimen: MedicationRegimenEntry[], medicationRows: MedicationRow[]): number {
  const presetKeys = new Set<string>()
  for (const entry of regimen) {
    const presetKey = findPresetKey(entry.substance)
    if (presetKey) presetKeys.add(presetKey)
  }
  for (const row of medicationRows) {
    if (!row.medication) continue
    const presetKey = findPresetKey(row.medication)
    if (presetKey) presetKeys.add(presetKey)
  }

  let maxHours = 24
  for (const presetKey of presetKeys) {
    const med = medFromPresetKey(presetKey)
    if (!med) continue
    maxHours = Math.max(maxHours, Math.min(MAX_WARMUP_DAYS * 24, med.halfLife * 5))
  }
  return maxHours * 60 * 60 * 1000
}

function referenceDoseForPreset(
  presetKey: string,
  regimen: MedicationRegimenEntry[],
  doses: ExpandedPKDose[],
): number {
  const regimenDose = regimen.find((entry) => (
    entry.active && findPresetKey(entry.substance) === presetKey && entry.dose_mg > 0
  ))?.dose_mg
  return regimenDose ?? doses.find((dose) => dose.doseAmount > 0)?.doseAmount ?? 1
}

export function buildPKTimelinePayload(
  regimen: MedicationRegimenEntry[],
  medicationRows: MedicationRow[],
  snapshots: DailySnapshot[],
  options: PKTimelineOptions = {},
): PKTimelinePayload {
  const visibleWindow = resolveVisibleWindow(snapshots, options)
  if (!visibleWindow) return { series: [], chartData: [], correlations: [] }

  const [visibleStart, visibleEnd] = visibleWindow
  const resolutionMinutes = options.resolutionMinutes ?? DEFAULT_RESOLUTION_MINUTES
  const bodyWeightKg = options.bodyWeightKg ?? DEFAULT_PK_BODY_WEIGHT_KG
  const warmupStart = visibleStart - maxWarmupMs(regimen, medicationRows)
  const groups = buildExpandedMedGroups(regimen, medicationRows, warmupStart, visibleEnd)
  const timestamps = buildTimelineTimestamps(visibleStart, visibleEnd, resolutionMinutes)
  const regimenOrder = new Map<string, number>()

  regimen.forEach((entry, index) => {
    const presetKey = findPresetKey(entry.substance)
    if (presetKey && !regimenOrder.has(presetKey)) regimenOrder.set(presetKey, index)
  })

  const series = groups
    .map((group): PKTimelineSeries | null => {
      const referenceDose = referenceDoseForPreset(group.presetKey, regimen, group.doses)
      const referenceCmax = estimateReferenceCmax(group.medication, referenceDose, bodyWeightKg)
      if (referenceCmax <= 0) return null

      const rawValues = buildConcentrationByConvolution(
        group.medication,
        group.doses,
        timestamps,
        resolutionMinutes,
        bodyWeightKg,
      )

      const points: PKTimelinePoint[] = timestamps.map((timestamp, index) => {
        const raw = rawValues[index] > 0.0001 ? rawValues[index] : null
        const normalized = raw != null ? (raw / referenceCmax) * 100 : null
        return {
          timestamp,
          date: dayKeyFromTimestamp(timestamp),
          normalizedPct: normalized,
          rawConcentration: raw,
        }
      })

      return {
        presetKey: group.presetKey,
        name: group.medication.name,
        color: group.color,
        referenceCmax,
        referenceDose,
        doses: group.doses,
        points,
      }
    })
    .filter((item): item is PKTimelineSeries => item !== null)
    .sort((left, right) => {
      const leftOrder = regimenOrder.get(left.presetKey) ?? 999
      const rightOrder = regimenOrder.get(right.presetKey) ?? 999
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return left.name.localeCompare(right.name)
    })

  return {
    series,
    chartData: buildPKOverlayChartData(series, snapshots),
    correlations: buildPKLagCorrelations(series, snapshots, options.maxLagDays ?? 7),
  }
}

export function buildPKOverlayChartData(
  series: PKTimelineSeries[],
  snapshots: DailySnapshot[],
): PKOverlayChartDatum[] {
  const moodByDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot.mood?.valence ?? null]))
  const basePoints = series[0]?.points ?? []

  return basePoints.map((point, index) => {
    const datum: PKOverlayChartDatum = {
      timestamp: point.timestamp,
      date: point.date,
      label: labelFromTimestamp(point.timestamp),
      mood: isMoodAnchor(point.timestamp) ? moodByDate.get(point.date) ?? null : null,
    }

    for (const item of series) {
      const itemPoint = item.points[index]
      datum[item.presetKey] = itemPoint?.normalizedPct ?? null
      datum[`${item.presetKey}Raw`] = itemPoint?.rawConcentration ?? null
    }

    return datum
  })
}

function dailyAverages(series: PKTimelineSeries, dates: string[]): Array<number | null> {
  return dates.map((date) => {
    const values = series.points
      .filter((point) => point.date === date && point.normalizedPct != null)
      .map((point) => point.normalizedPct as number)
    if (!values.length) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  })
}

export function buildPKLagCorrelations(
  series: PKTimelineSeries[],
  snapshots: DailySnapshot[],
  maxLagDays = 7,
): PKLagCorrelationRow[] {
  const sortedSnapshots = [...snapshots].sort((left, right) => left.date.localeCompare(right.date))
  const dates = sortedSnapshots.map((snapshot) => snapshot.date)
  const moodValues = sortedSnapshots.map((snapshot) => snapshot.mood?.valence ?? null)
  const rows: PKLagCorrelationRow[] = []

  for (const item of series) {
    const concentrationValues = dailyAverages(item, dates)
    for (let lag = 0; lag <= maxLagDays; lag++) {
      const xs: number[] = []
      const ys: number[] = []

      for (let index = 0; index < concentrationValues.length - lag; index++) {
        const x = concentrationValues[index]
        const y = moodValues[index + lag]
        if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
          xs.push(x)
          ys.push(y)
        }
      }

      rows.push({
        presetKey: item.presetKey,
        name: item.name,
        color: item.color,
        lagDays: lag,
        n: xs.length,
        result: xs.length >= 10 ? pearson(xs, ys) : null,
      })
    }
  }

  return rows
}

/**
 * Para cada snapshot diário, calcula uma série PK diária em modo trend.
 * Primeiro amostra a concentração ao meio-dia; depois aplica janela móvel
 * compatível com medicações crônicas para suavizar correlações dia a dia.
 */
export function buildDailyConcentrations(
  groups: MedGroup[],
  dates: string[],
  bodyWeight = 70,
): Record<string, Array<number | null>> {
  const result: Record<string, Array<number | null>> = {}

  for (const group of groups) {
    const { medication, doses, presetKey } = group
    const timestamps = dates.map((date) => new Date(`${date}T12:00:00`).getTime())
    const instantSeries = timestamps.map((noon) => {
      if (!Number.isFinite(noon)) return null
      const relevantDoses = doses.filter((d) => d.timestamp <= noon)
      if (!relevantDoses.length) return null
      const conc = calculateConcentration(medication, relevantDoses, noon, bodyWeight)
      return conc > 0.01 ? conc : null
    })
    const trendSeries = computeTrendFromSamples(
      timestamps,
      instantSeries,
      getTrendWindowMs(medication),
      3,
    )
    result[presetKey] = trendSeries.some((value) => value != null) ? trendSeries : instantSeries
  }

  return result
}
