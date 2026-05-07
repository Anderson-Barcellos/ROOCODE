import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { buildForecastPayload } from '../src/hooks/useForecast'

const BASE_HEALTH: Omit<DailyHealthMetrics, 'date' | 'sleepTotalHours' | 'hrvSdnn' | 'restingHeartRate' | 'activeEnergyKcal' | 'exerciseMinutes'> = {
  interpolated: false,
  sleepAsleepHours: null,
  sleepInBedHours: null,
  sleepCoreHours: null,
  sleepDeepHours: null,
  sleepRemHours: null,
  sleepAwakeHours: null,
  sleepEfficiencyPct: null,
  respiratoryDisturbances: null,
  restingEnergyKcal: null,
  heartRateMin: null,
  heartRateMax: null,
  heartRateMean: null,
  spo2: null,
  respiratoryRate: null,
  pulseTemperatureC: null,
  standingMinutes: null,
  daylightMinutes: null,
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

function snapshot(date: string, value: number, interpolated = false): DailySnapshot {
  return {
    date,
    interpolated,
    health: {
      ...BASE_HEALTH,
      date,
      interpolated,
      sleepTotalHours: value,
      hrvSdnn: value * 10,
      restingHeartRate: 60 + value,
      activeEnergyKcal: value * 100,
      exerciseMinutes: value * 5,
    },
    mood: {
      date,
      interpolated,
      valence: value / 10,
      valenceClass: 'Neutro',
      entryCount: 1,
      labels: [],
      associations: [],
    },
    medications: null,
  }
}

const snapshots = [
  snapshot('2026-04-01', 1),
  snapshot('2026-04-02', 2),
  snapshot('2026-04-03', 3),
  snapshot('2026-04-04', 4),
  snapshot('2026-04-05', 5),
  snapshot('2026-04-06', 6),
  snapshot('2026-04-07', 7),
  snapshot('2026-04-08', 8),
  snapshot('2026-04-09', 99, true),
]

const payload = buildForecastPayload(snapshots, 20)

assert.equal(payload.snapshots.length, 8)
assert.equal(payload.snapshots[0].date, '2026-04-01')
assert.equal(payload.snapshots[payload.snapshots.length - 1].date, '2026-04-08')
assert.equal(payload.rolling_summary.window_days, 7)
assert.equal(payload.rolling_summary.sample_days, 7)
assert.equal(payload.rolling_summary.means.sleepTotalHours, 5)
assert.equal(payload.rolling_summary.means.valence, 0.5)
