import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import {
  computeSleepContinuitySeries,
  computeSleepContinuitySummary,
} from '../src/utils/sleep-continuity'

function isoDate(daysBack: number): string {
  const base = new Date('2026-06-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function health(date: string, over: Partial<DailyHealthMetrics> = {}): DailyHealthMetrics {
  return {
    date,
    sleepStartAt: null, sleepEndAt: null,
    sleepTotalHours: 7.5, sleepAsleepHours: 7.0, sleepInBedHours: 8.0,
    sleepCoreHours: 4.0, sleepDeepHours: 1.4, sleepRemHours: 1.5, sleepAwakeHours: 0.4,
    sleepEfficiencyPct: 88,
    respiratoryDisturbances: 0.4, spo2: 97, respiratoryRate: 15,
    activeEnergyKcal: null, restingEnergyKcal: null,
    heartRateMin: null, heartRateMax: null, heartRateMean: null, restingHeartRate: null,
    pulseTemperatureC: null, exerciseMinutes: null, standingMinutes: null, daylightMinutes: null,
    hrvSdnn: null, steps: null, distanceKm: null, physicalEffort: null,
    walkingHeartRateAvg: null, walkingAsymmetryPct: null, walkingSpeedKmh: null,
    walkingStepLengthCm: null, runningSpeedKmh: null, vo2Max: null,
    sixMinuteWalkMeters: null, cardioRecoveryBpm: null,
    recordCount: 1, placeholderRestingEnergyRows: 0,
    ...over,
  }
}

function snap(daysBack: number, over: Partial<DailyHealthMetrics> = {}, flags: { interpolated?: boolean; forecasted?: boolean } = {}): DailySnapshot {
  const date = isoDate(daysBack)
  return { date, interpolated: flags.interpolated, forecasted: flags.forecasted, health: health(date, over), mood: null, medications: null }
}

// 1) Bandas AASM de eficiência.
const ideal = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 92 })]).at(-1)!
assert.equal(ideal.efficiencyBand, 'ideal', 'eff >=85 = ideal')
const limit = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 80 })]).at(-1)!
assert.equal(limit.efficiencyBand, 'limitrofe', '75-85 = limítrofe')
const poor = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 70 })]).at(-1)!
assert.equal(poor.efficiencyBand, 'pobre', '<75 = pobre')
// Boundaries de eficiência: 85 pertence a ideal (>=85).
assert.equal(computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 85 })]).at(-1)!.efficiencyBand, 'ideal', 'eff exatamente 85 = ideal')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 75 })]).at(-1)!.efficiencyBand, 'limitrofe', 'eff exatamente 75 = limítrofe')

// 2) Bandas de WASO.
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 0.3 })]).at(-1)!.wasoBand, 'ideal', '<0.5h = ideal')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 0.8 })]).at(-1)!.wasoBand, 'limitrofe', '0.5-1h = limítrofe')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 1.4 })]).at(-1)!.wasoBand, 'fragmentado', '>1h = fragmentado')
// Boundaries de WASO: 0.5 e 1.0 pertencem a limítrofe (<0.5 ideal, <=1.0 limítrofe).
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 0.5 })]).at(-1)!.wasoBand, 'limitrofe', 'WASO exatamente 0.5h = limítrofe')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 1.0 })]).at(-1)!.wasoBand, 'limitrofe', 'WASO exatamente 1.0h = limítrofe')

// 3) Fallback de eficiência: sem sleepEfficiencyPct, calcula de asleep/inBed.
const fallback = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: null, sleepAsleepHours: 7.2, sleepInBedHours: 8.0 })]).at(-1)!
assert.ok(fallback.efficiencyPct != null && Math.abs(fallback.efficiencyPct - 90) < 1e-9, 'eficiência derivada = 7.2/8.0 = 90%')

// 4) Dados faltantes: ponto sem eficiência nem WASO.
const missing = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: null, sleepAsleepHours: null, sleepInBedHours: null, sleepAwakeHours: null })]).at(-1)!
assert.equal(missing.efficiencyPct, null)
assert.equal(missing.efficiencyBand, null)
assert.equal(missing.wasoHours, null)
assert.equal(missing.wasoBand, null)

// 5) Confidence interpolado.
const interp = computeSleepContinuitySeries([snap(0, {}, { interpolated: true })]).at(-1)!
assert.ok(Math.abs(interp.confidence - 0.7) < 1e-9, 'interpolado tem confidence 0.7')

// 6) Summary médias da janela real.
const dataset: DailySnapshot[] = []
for (let d = 9; d >= 0; d -= 1) dataset.push(snap(d, { sleepEfficiencyPct: 86 + (d % 3), sleepAwakeHours: 0.4 }))
const summary = computeSleepContinuitySummary(dataset)
assert.ok(summary.latest != null)
assert.ok(summary.meanEfficiencyPct != null && summary.meanEfficiencyPct > 85, 'média de eficiência alta')
assert.ok(summary.meanWasoHours != null && Math.abs(summary.meanWasoHours - 0.4) < 1e-9, 'WASO médio 0.4h')

console.log('sleep-continuity.test.ts — all assertions passed')
