import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import {
  classifyBloodPressure,
  computeBloodPressureSummary,
} from '../src/utils/blood-pressure'

function isoDate(daysBack: number): string {
  const base = new Date('2026-06-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function health(date: string, over: Partial<DailyHealthMetrics> = {}): DailyHealthMetrics {
  return {
    date,
    sleepStartAt: null, sleepEndAt: null,
    sleepTotalHours: null, sleepAsleepHours: null, sleepInBedHours: null,
    sleepCoreHours: null, sleepDeepHours: null, sleepRemHours: null, sleepAwakeHours: null,
    sleepEfficiencyPct: null,
    respiratoryDisturbances: null, spo2: null, respiratoryRate: null,
    activeEnergyKcal: null, restingEnergyKcal: null,
    heartRateMin: null, heartRateMax: null, heartRateMean: null, restingHeartRate: null,
    pulseTemperatureC: null, exerciseMinutes: null, standingMinutes: null, daylightMinutes: null,
    hrvSdnn: null, steps: null, distanceKm: null, physicalEffort: null,
    walkingHeartRateAvg: null, walkingAsymmetryPct: null, walkingSpeedKmh: null,
    walkingStepLengthCm: null, runningSpeedKmh: null, vo2Max: null,
    sixMinuteWalkMeters: null, cardioRecoveryBpm: null,
    systolicMmHg: null, diastolicMmHg: null,
    recordCount: 1, placeholderRestingEnergyRows: 0,
    ...over,
  }
}

function snap(daysBack: number, over: Partial<DailyHealthMetrics> = {}): DailySnapshot {
  const date = isoDate(daysBack)
  return { date, health: health(date, over), mood: null, medications: null }
}

// 1) Classificação ACC/AHA 2017 (boundaries).
assert.equal(classifyBloodPressure(118, 78), 'normal', '<120/80 = normal')
assert.equal(classifyBloodPressure(122, 78), 'elevada', '120-129 e <80 = elevada')
assert.equal(classifyBloodPressure(120, 82), 'has1', 'dia >=80 puxa pra HAS1')
assert.equal(classifyBloodPressure(135, 78), 'has1', 'sys 130-139 = HAS1')
assert.equal(classifyBloodPressure(142, 78), 'has2', 'sys >=140 = HAS2')
assert.equal(classifyBloodPressure(120, 92), 'has2', 'dia >=90 = HAS2')

// 2) Dormente: poucas medições (4 < collectingMin 10) → dormant, sem classificação.
const fewDays: DailySnapshot[] = []
for (let d = 3; d >= 0; d -= 1) fewDays.push(snap(d, { systolicMmHg: 125, diastolicMmHg: 76 }))
const dormant = computeBloodPressureSummary(fewDays)
assert.equal(dormant.dormant, true, '4 medições → dormente')
assert.equal(dormant.classification, null, 'dormente não classifica')
assert.equal(dormant.measurementsUsed, 4, 'conta as 4 medições')

// 3) Ativo: 12 medições (>= collectingMin 10) → acende com classificação.
const manyDays: DailySnapshot[] = []
for (let d = 11; d >= 0; d -= 1) manyDays.push(snap(d, { systolicMmHg: 124, diastolicMmHg: 78 }))
const active = computeBloodPressureSummary(manyDays)
assert.equal(active.dormant, false, '12 medições → ativo')
assert.equal(active.classification, 'elevada', 'média 124/78 = elevada')
assert.ok(active.meanSystolic != null && Math.abs(active.meanSystolic - 124) < 1e-9, 'média sistólica 124')
assert.equal(active.measurementsUsed, 12)

// 4) Sem nenhuma medição → dormente, contagem zero.
const empty = computeBloodPressureSummary([snap(0, {})])
assert.equal(empty.dormant, true)
assert.equal(empty.measurementsUsed, 0)

console.log('blood-pressure.test.ts — all assertions passed')
