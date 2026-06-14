import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import { computeStimulantCardiacLoad } from '../src/utils/stimulant-cardiac-load'

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

// 1) Poucos dias com exposição (< 14 pares) → insufficient_data.
const fewSnaps: DailySnapshot[] = []
const fewExp = new Map<string, number>()
for (let d = 4; d >= 0; d -= 1) { fewSnaps.push(snap(d, 75)); fewExp.set(isoDate(d), 100) }
assert.equal(computeStimulantCardiacLoad(fewSnaps, fewExp).reason, 'insufficient_data')

// 2) Exposição constante (CV ~0 < 0.1) → insufficient_variance (a dose fixa do mundo real).
const flatSnaps: DailySnapshot[] = []
const flatExp = new Map<string, number>()
for (let d = 19; d >= 0; d -= 1) { flatSnaps.push(snap(d, 72)); flatExp.set(isoDate(d), 100) }
const flat = computeStimulantCardiacLoad(flatSnaps, flatExp)
assert.equal(flat.reason, 'insufficient_variance', 'exposição constante = variância insuficiente')
assert.ok(flat.exposureCv != null && flat.exposureCv < 0.1, 'CV ~0')

// 3) Exposição variável + FC correlacionada → ok, 8 células, correlação positiva forte.
const varSnaps: DailySnapshot[] = []
const varExp = new Map<string, number>()
for (let d = 19; d >= 0; d -= 1) {
  const high = d % 2 === 0
  varSnaps.push(snap(d, high ? 86 : 68))
  varExp.set(isoDate(d), high ? 300 : 50)
}
const ok = computeStimulantCardiacLoad(varSnaps, varExp)
assert.equal(ok.reason, 'ok', 'variância alta + 20 dias = ok')
assert.equal(ok.cells.length, 8, '2 alvos × 4 lags = 8 células')
assert.ok(ok.exposureCv != null && ok.exposureCv >= 0.1, 'CV de exposição alto')
assert.ok(ok.bestCell != null, 'tem bestCell')
assert.ok(ok.scatter.length >= 14, 'scatter com pontos suficientes')
const lag0Rhr = ok.cells.find((c) => c.target === 'restingHeartRate' && c.lag === 0)!
assert.ok(lag0Rhr.r != null && lag0Rhr.r > 0.5, 'FC repouso correlaciona positivo com exposição')

// 4) Sem exposição (map vazio) → insufficient_data.
assert.equal(computeStimulantCardiacLoad(varSnaps, new Map()).reason, 'insufficient_data')

console.log('stimulant-cardiac-load.test.ts — all assertions passed')
