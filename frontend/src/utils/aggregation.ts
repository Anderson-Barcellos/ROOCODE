import { differenceInCalendarDays, format, isValid, parseISO, startOfDay, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import type {
  AppleHealthBundle,
  DailyHealthMetrics,
  DailyMedicationMetrics,
  DailyMoodMetrics,
  DailySnapshot,
  HealthAutoExportRow,
  MedicationRow,
  MoodEntryRow,
  OverviewMetrics,
  TimelinePoint,
  TimelineSeriesKey,
  MoodHeatmapDay,
} from '../types/apple-health'
import { mean, roundTo, sum, toDayKey } from './date'

function sumFields(rows: HealthAutoExportRow[], key: keyof HealthAutoExportRow): number | null {
  return sum(rows.map((row) => row[key] as number | null))
}

function meanFields(rows: HealthAutoExportRow[], key: keyof HealthAutoExportRow): number | null {
  return mean(rows.map((row) => row[key] as number | null))
}

function buildHealthMetrics(date: string, rows: HealthAutoExportRow[]): DailyHealthMetrics {
  const sleepInBedHours = sumFields(rows, 'sleepInBedHours')
  const sleepAsleepHours = sumFields(rows, 'sleepAsleepHours')
  const sleepEfficiencyPct =
    sleepInBedHours && sleepInBedHours > 0 && sleepAsleepHours != null
      ? roundTo((sleepAsleepHours / sleepInBedHours) * 100, 1)
      : null

  return {
    date,
    sleepTotalHours: sumFields(rows, 'sleepTotalHours'),
    sleepAsleepHours,
    sleepInBedHours,
    sleepCoreHours: sumFields(rows, 'sleepCoreHours'),
    sleepDeepHours: sumFields(rows, 'sleepDeepHours'),
    sleepRemHours: sumFields(rows, 'sleepRemHours'),
    sleepAwakeHours: sumFields(rows, 'sleepAwakeHours'),
    sleepEfficiencyPct,
    respiratoryDisturbances: sumFields(rows, 'respiratoryDisturbances'),
    activeEnergyKcal: sumFields(rows, 'activeEnergyKcal'),
    restingEnergyKcal: meanFields(rows, 'restingEnergyKcal'),
    heartRateMin: meanFields(rows, 'heartRateMin'),
    heartRateMax: meanFields(rows, 'heartRateMax'),
    heartRateMean: meanFields(rows, 'heartRateMean'),
    restingHeartRate: meanFields(rows, 'restingHeartRate'),
    spo2: meanFields(rows, 'spo2'),
    respiratoryRate: meanFields(rows, 'respiratoryRate'),
    pulseTemperatureC: meanFields(rows, 'pulseTemperatureC'),
    exerciseMinutes: sumFields(rows, 'exerciseMinutes'),
    standingMinutes: sumFields(rows, 'standingMinutes'),
    daylightMinutes: sumFields(rows, 'daylightMinutes'),
    hrvSdnn: meanFields(rows, 'hrvSdnn'),
    // Fase 8A — Activity/Physiology
    steps: sumFields(rows, 'steps'),
    distanceKm: sumFields(rows, 'distanceKm'),
    physicalEffort: meanFields(rows, 'physicalEffort'),
    walkingHeartRateAvg: meanFields(rows, 'walkingHeartRateAvg'),
    walkingAsymmetryPct: meanFields(rows, 'walkingAsymmetryPct'),
    walkingSpeedKmh: meanFields(rows, 'walkingSpeedKmh'),
    runningSpeedKmh: meanFields(rows, 'runningSpeedKmh'),
    vo2Max: meanFields(rows, 'vo2Max'),
    sixMinuteWalkMeters: meanFields(rows, 'sixMinuteWalkMeters'),
    cardioRecoveryBpm: meanFields(rows, 'cardioRecoveryBpm'),
    recordCount: rows.length,
    placeholderRestingEnergyRows: rows.filter((row) => row.isPlaceholderRestingEnergy).length,
  }
}

function buildMoodMetrics(date: string, rows: MoodEntryRow[]): DailyMoodMetrics {
  const valence = mean(rows.map((row) => row.valence))
  const valenceClass = valence == null ? null : classifyValence(valence)

  return {
    date,
    valence,
    valenceClass,
    entryCount: rows.length,
    labels: uniqueValues(rows.flatMap((row) => row.labels)),
    associations: uniqueValues(rows.flatMap((row) => row.associations)),
  }
}

function buildMedicationMetrics(date: string, rows: MedicationRow[]): DailyMedicationMetrics {
  return {
    date,
    count: rows.length,
    medications: uniqueValues(
      rows.flatMap((row) => [row.medication, row.nickname].filter((value): value is string => Boolean(value))),
    ),
  }
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function classifyValence(valence: number): string {
  if (valence >= 0.75) {
    return 'Muito Agradável'
  }
  if (valence >= 0.35) {
    return 'Agradável'
  }
  if (valence > 0.1) {
    return 'Levemente Agradável'
  }
  if (valence > -0.1) {
    return 'Neutro'
  }
  if (valence > -0.35) {
    return 'Levemente Desagradável'
  }
  if (valence > -0.75) {
    return 'Desagradável'
  }
  return 'Muito Desagradável'
}

export function buildDailySnapshots(bundle: Pick<AppleHealthBundle, 'healthRows' | 'moodRows' | 'medicationRows'>): DailySnapshot[] {
  const healthGroups = new Map<string, HealthAutoExportRow[]>()
  for (const row of bundle.healthRows) {
    const day = toDayKey(row.dateTime)
    if (!day) {
      continue
    }

    const existing = healthGroups.get(day) ?? []
    existing.push(row)
    healthGroups.set(day, existing)
  }

  const moodGroups = new Map<string, MoodEntryRow[]>()
  for (const row of bundle.moodRows) {
    const day = toDayKey(row.start)
    if (!day) {
      continue
    }

    const existing = moodGroups.get(day) ?? []
    existing.push(row)
    moodGroups.set(day, existing)
  }

  const medicationGroups = new Map<string, MedicationRow[]>()
  for (const row of bundle.medicationRows) {
    const day = toDayKey(row.date)
    if (!day) {
      continue
    }

    const existing = medicationGroups.get(day) ?? []
    existing.push(row)
    medicationGroups.set(day, existing)
  }

  const allDates = new Set<string>([
    ...healthGroups.keys(),
    ...moodGroups.keys(),
    ...medicationGroups.keys(),
  ])

  return [...allDates]
    .sort((left, right) => left.localeCompare(right))
    .map((date) => ({
      date,
      health: healthGroups.has(date) ? buildHealthMetrics(date, healthGroups.get(date) ?? []) : null,
      mood: moodGroups.has(date) ? buildMoodMetrics(date, moodGroups.get(date) ?? []) : null,
      medications: medicationGroups.has(date) ? buildMedicationMetrics(date, medicationGroups.get(date) ?? []) : null,
    }))
}

export function buildOverviewMetrics(snapshots: DailySnapshot[]): OverviewMetrics {
  const latestSnapshots = selectSnapshotRange(snapshots, '7d')

  return {
    sleep7dHours: averageNested(latestSnapshots, (snapshot) => snapshot.health?.sleepTotalHours),
    restingHeartRate7d: averageNested(latestSnapshots, (snapshot) => snapshot.health?.restingHeartRate),
    hrv7d: averageNested(latestSnapshots, (snapshot) => snapshot.health?.hrvSdnn),
    spo27d: averageNested(latestSnapshots, (snapshot) => snapshot.health?.spo2),
    mood7d: averageNested(latestSnapshots, (snapshot) => snapshot.mood?.valence),
    activeEnergy7dKcal: averageNested(latestSnapshots, (snapshot) => snapshot.health?.activeEnergyKcal),
    exercise7dMinutes: averageNested(latestSnapshots, (snapshot) => snapshot.health?.exerciseMinutes),
    daylight7dMinutes: averageNested(latestSnapshots, (snapshot) => snapshot.health?.daylightMinutes),
    medication7dCount: latestSnapshots.reduce(
      (total, snapshot) => total + (snapshot.medications?.count ?? 0),
      0,
    ),
  }
}

function averageNested(
  snapshots: DailySnapshot[],
  getter: (snapshot: DailySnapshot) => number | null | undefined,
): number | null {
  const values = snapshots.map((snapshot) => getter(snapshot))
  return mean(values)
}

export function buildMoodHeatmap(snapshots: DailySnapshot[]): MoodHeatmapDay[] {
  return snapshots.map((snapshot) => ({
    date: snapshot.date,
    valence: snapshot.mood?.valence ?? null,
    valenceClass: snapshot.mood?.valenceClass ?? null,
    entryCount: snapshot.mood?.entryCount ?? 0,
    labels: snapshot.mood?.labels ?? [],
    associations: snapshot.mood?.associations ?? [],
  }))
}

export function buildTimelineSeries(
  snapshots: DailySnapshot[],
  seriesKeys: TimelineSeriesKey[],
): TimelinePoint[] {
  return snapshots.map((snapshot) => {
    const values: Partial<Record<TimelineSeriesKey, number | null>> = {}
    for (const key of seriesKeys) {
      values[key] = getSeriesValue(snapshot, key)
    }

    return {
      date: snapshot.date,
      values,
      interpolated: snapshot.interpolated === true,
      forecasted: snapshot.forecasted === true,
      forecastConfidence: snapshot.forecastConfidence,
    }
  })
}

function getSeriesValue(snapshot: DailySnapshot, key: TimelineSeriesKey): number | null {
  const health = snapshot.health
  const mood = snapshot.mood
  switch (key) {
    case 'sleepTotalHours':
      return health?.sleepTotalHours ?? null
    case 'sleepEfficiencyPct':
      return health?.sleepEfficiencyPct ?? null
    case 'restingHeartRate':
      return health?.restingHeartRate ?? null
    case 'hrvSdnn':
      return health?.hrvSdnn ?? null
    case 'spo2':
      return health?.spo2 ?? null
    case 'activeEnergyKcal':
      return health?.activeEnergyKcal ?? null
    case 'exerciseMinutes':
      return health?.exerciseMinutes ?? null
    case 'standingMinutes':
      return health?.standingMinutes ?? null
    case 'daylightMinutes':
      return health?.daylightMinutes ?? null
    case 'valence':
      return mood?.valence ?? null
    // Fase 8A — novos plotáveis
    case 'steps':
      return health?.steps ?? null
    case 'vo2Max':
      return health?.vo2Max ?? null
    case 'walkingSpeedKmh':
      return health?.walkingSpeedKmh ?? null
    case 'walkingHeartRateAvg':
      return health?.walkingHeartRateAvg ?? null
    case 'respiratoryRate':
      return health?.respiratoryRate ?? null
    case 'pulseTemperatureC':
      return health?.pulseTemperatureC ?? null
    default:
      return null
  }
}

export function selectSnapshotRange(
  snapshots: DailySnapshot[],
  range: '7d' | '30d' | '90d' | '1y' | 'all' = '7d',
): DailySnapshot[] {
  const sorted = [...snapshots].sort((left, right) => left.date.localeCompare(right.date))
  if (range === 'all') {
    return sorted
  }

  const rangeMap: Record<'7d' | '30d' | '90d' | '1y', number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  }

  const validSnapshots = sorted.filter((snapshot) => isValid(parseISO(snapshot.date)))
  if (!validSnapshots.length) {
    return []
  }

  const todayKey = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const nonFutureSnapshots = validSnapshots.filter((snapshot) => snapshot.date <= todayKey)
  const anchor = nonFutureSnapshots.at(-1) ?? validSnapshots.at(-1)
  if (!anchor) {
    return []
  }

  const anchorDate = startOfDay(parseISO(anchor.date))
  const startKey = format(subDays(anchorDate, rangeMap[range] - 1), 'yyyy-MM-dd')

  return validSnapshots.filter((snapshot) => snapshot.date >= startKey && snapshot.date <= anchor.date)
}

export function calculateDayGapDays(left: string, right: string): number {
  return Math.abs(differenceInCalendarDays(parseISO(right), parseISO(left)))
}

export function dayLabel(date: string): string {
  return format(parseISO(date), 'd MMM', { locale: ptBR })
}
