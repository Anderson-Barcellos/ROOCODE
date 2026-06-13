import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import type { PKMedication, PKDose } from '../src/utils/pharmacokinetics'
import { computeStimulantCardiacLoad } from '../src/utils/stimulant-cardiac-load'

const WEIGHT = 91
const MED: PKMedication = {
  id: 'venvanse',
  name: 'Venvanse',
  category: 'Stimulant',
  halfLife: 10,
  volumeOfDistribution: 3.5,
  bioavailability: 0.96,
  absorptionRate: 2.0,
}

function isoDate(daysBack: number): string {
  const base = new Date('2026-06-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function health(date: string, rhr: number | null): DailyHealthMetrics {
  return {
    date,
    sleepStartAt: null, sleepEndAt: null,
    sleepTotalHours: null, sleepAsleepHours: null, sleepInBedHours: null,
    sleepCoreHours: null, sleepDeepHours: null, sleepRemHours: null, sleepAwakeHours: null,
    sleepEfficiencyPct: null,
    respiratoryDisturbances: null, spo2: null, respiratoryRate: null,
    activeEnergyKcal: null, restingEnergyKcal: null,
    heartRateMin: null, heartRateMax: null, heartRateMean: null, restingHeartRate: rhr,
    pulseTemperatureC: null, exerciseMinutes: null, standingMinutes: null, daylightMinutes: null,
    hrvSdnn: null, steps: null, distanceKm: null, physicalEffort: null,
    walkingHeartRateAvg: null, walkingAsymmetryPct: null, walkingSpeedKmh: null,
    walkingStepLengthCm: null, runningSpeedKmh: null, vo2Max: null,
    sixMinuteWalkMeters: null, cardioRecoveryBpm: null,
    systolicMmHg: null, diastolicMmHg: null,
    recordCount: 1, placeholderRestingEnergyRows: 0,
  }
}

function snap(daysBack: number, rhr: number | null): DailySnapshot {
  const date = isoDate(daysBack)
  return { date, health: health(date, rhr), mood: null, medications: null }
}

function doseAt(daysBack: number, mg: number): PKDose {
  const date = isoDate(daysBack)
  return { medicationId: 'venvanse', timestamp: new Date(`${date}T07:00:00`).getTime(), doseAmount: mg }
}

// 1) med ausente → med_unavailable.
assert.equal(computeStimulantCardiacLoad([snap(0, 70)], null, [], WEIGHT).reason, 'med_unavailable')

// 2) poucos dias (5 < 14 pares) → insufficient_data.
const fewSnaps: DailySnapshot[] = []
const fewDoses: PKDose[] = []
for (let d = 4; d >= 0; d -= 1) { fewSnaps.push(snap(d, 75)); fewDoses.push(doseAt(d, 200)) }
assert.equal(computeStimulantCardiacLoad(fewSnaps, MED, fewDoses, WEIGHT).reason, 'insufficient_data')

// 3) exposição com variância + FC correlacionada → ok, 8 células, bestCell presente.
const varSnaps: DailySnapshot[] = []
const varDoses: PKDose[] = []
for (let d = 19; d >= 0; d -= 1) {
  const high = d % 2 === 0
  varDoses.push(doseAt(d, high ? 400 : 70))
  varSnaps.push(snap(d, high ? 86 : 68))
}
const ok = computeStimulantCardiacLoad(varSnaps, MED, varDoses, WEIGHT)
assert.equal(ok.reason, 'ok', 'variância alta + 20 dias = ok')
assert.equal(ok.cells.length, 8, '2 alvos × 4 lags = 8 células')
assert.ok(ok.exposureCv != null && ok.exposureCv >= 0.1, 'CV de exposição alto')
assert.ok(ok.bestCell != null, 'tem bestCell')
assert.ok(ok.scatter.length >= 14, 'scatter com pontos suficientes')
// lag 0 de restingHeartRate deve ter correlação positiva forte (dose alta ↔ FC alta)
const lag0Rhr = ok.cells.find((c) => c.target === 'restingHeartRate' && c.lag === 0)!
assert.ok(lag0Rhr.r != null && lag0Rhr.r > 0.5, 'FC repouso correlaciona positivo com exposição')

console.log('stimulant-cardiac-load.test.ts — all assertions passed')
