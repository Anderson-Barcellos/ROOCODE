import assert from 'node:assert/strict'
import { addDays, format, startOfDay, subDays } from 'date-fns'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { selectSnapshotRange } from '../src/utils/aggregation'
import { toDayKey } from '../src/utils/date'

const BASE_HEALTH: Omit<DailyHealthMetrics, 'date' | 'sleepTotalHours'> = {
  interpolated: false,
  sleepAsleepHours: null,
  sleepInBedHours: null,
  sleepCoreHours: null,
  sleepDeepHours: null,
  sleepRemHours: null,
  sleepAwakeHours: null,
  sleepEfficiencyPct: null,
  respiratoryDisturbances: null,
  activeEnergyKcal: null,
  restingEnergyKcal: null,
  heartRateMin: null,
  heartRateMax: null,
  heartRateMean: null,
  restingHeartRate: null,
  spo2: null,
  respiratoryRate: null,
  pulseTemperatureC: null,
  exerciseMinutes: null,
  standingMinutes: null,
  daylightMinutes: null,
  hrvSdnn: null,
  steps: null,
  distanceKm: null,
  physicalEffort: null,
  walkingHeartRateAvg: null,
  walkingAsymmetryPct: null,
  walkingSpeedKmh: null,
  walkingStepLengthCm: null,
  runningSpeedKmh: null,
  vo2Max: null,
  sixMinuteWalkMeters: null,
  cardioRecoveryBpm: null,
  recordCount: 1,
  placeholderRestingEnergyRows: 0,
}

function snapshot(date: string, kind: 'health' | 'mood' = 'health'): DailySnapshot {
  return {
    date,
    health: kind === 'health'
      ? {
          ...BASE_HEALTH,
          date,
          sleepTotalHours: 7,
        }
      : null,
    mood: kind === 'mood'
      ? {
          date,
          valence: 0.2,
          valenceClass: 'Levemente Agradável',
          entryCount: 1,
          labels: [],
          associations: [],
        }
      : null,
    medications: null,
  }
}

function dayKey(date: Date): string {
  return format(startOfDay(date), 'yyyy-MM-dd')
}

assert.equal(toDayKey('18/04/2026'), '2026-04-18')
assert.equal(toDayKey('05/04/2026'), '2026-04-05')
assert.equal(toDayKey('2026-04-19 00:00:00'), '2026-04-19')
assert.equal(toDayKey('17-04-26'), '2026-04-17')

const fixedWeek = [
  '2026-04-13',
  '2026-04-14',
  '2026-04-15',
  '2026-04-16',
  '2026-04-17',
  '2026-04-18',
  '2026-04-19',
].map((date) => snapshot(date))
assert.deepEqual(
  selectSnapshotRange(fixedWeek, '7d').map((item) => item.date),
  fixedWeek.map((item) => item.date),
)

const today = startOfDay(new Date())
const currentWeek = Array.from({ length: 7 }, (_, index) => (
  snapshot(dayKey(subDays(today, 6 - index)))
))
const futureMoodOnly = Array.from({ length: 7 }, (_, index) => (
  snapshot(dayKey(addDays(today, index + 1)), 'mood')
))

assert.deepEqual(
  selectSnapshotRange([...currentWeek, ...futureMoodOnly], '7d').map((item) => item.date),
  currentWeek.map((item) => item.date),
)

assert.deepEqual(
  selectSnapshotRange([...futureMoodOnly, ...currentWeek], 'all').map((item) => item.date),
  [...currentWeek, ...futureMoodOnly].map((item) => item.date).sort(),
)
