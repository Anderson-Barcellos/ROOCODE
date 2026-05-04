import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { buildMoodLagHypothesis } from '../src/utils/correlations'

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
  runningSpeedKmh: null,
  vo2Max: null,
  sixMinuteWalkMeters: null,
  cardioRecoveryBpm: null,
  recordCount: 1,
  placeholderRestingEnergyRows: 0,
}

function snapshot(index: number, metric: number, mood: number | null): DailySnapshot {
  const day = String(index + 1).padStart(2, '0')
  const date = `2026-04-${day}`
  return {
    date,
    health: {
      ...BASE_HEALTH,
      date,
      sleepTotalHours: metric,
    },
    mood: mood == null
      ? null
      : {
          date,
          valence: mood,
          valenceClass: null,
          entryCount: 1,
          labels: [],
          associations: [],
        },
    medications: null,
  }
}

const metric = [0.2, 1.1, 0.5, 1.6, 0.4, 1.3, 0.9, 1.8, 0.3, 1.4, 0.7, 1.5, 0.6, 1.7, 0.8]
const snapshots = metric.map((value, index) => {
  const source = metric[index - 2]
  return snapshot(index, value, source == null ? null : source * 0.5)
})

const hypothesis = buildMoodLagHypothesis(snapshots, 'sleepTotalHours')
const lag2 = hypothesis.rows.find((row) => row.lagDays === 2)

assert.equal(hypothesis.bestLagDays, 2)
assert.equal(lag2?.n, 13)
assert.equal(lag2?.quality, 'partial')
assert.ok(lag2?.result)
assert.ok(Math.abs(lag2.result.r - 1) < 1e-9)
assert.ok(lag2.aboveMeanMood != null)
assert.ok(lag2.belowMeanMood != null)
assert.ok((lag2.moodDelta ?? 0) > 0)
