import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import {
  computeRestingHeartRateSeries,
  computeRestingHeartRateSummary,
} from '../src/utils/resting-heart-rate'

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
    heartRateMin: null, heartRateMax: null, heartRateMean: null, restingHeartRate: 70,
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

// 1) Bandas de FC repouso (boundaries: 65→normal, 75→elevada, 85→alta).
assert.equal(computeRestingHeartRateSeries([snap(0, { restingHeartRate: 60 })]).at(-1)!.band, 'otima', '<65 = ótima')
assert.equal(computeRestingHeartRateSeries([snap(0, { restingHeartRate: 65 })]).at(-1)!.band, 'normal', '65 = normal')
assert.equal(computeRestingHeartRateSeries([snap(0, { restingHeartRate: 75 })]).at(-1)!.band, 'elevada', '75 = elevada')
assert.equal(computeRestingHeartRateSeries([snap(0, { restingHeartRate: 85 })]).at(-1)!.band, 'alta', '85 = alta')
assert.equal(computeRestingHeartRateSeries([snap(0, { restingHeartRate: 84 })]).at(-1)!.band, 'elevada', '84 = elevada')

// 2) Dia sem dado: ponto inelegível.
const missing = computeRestingHeartRateSeries([snap(0, { restingHeartRate: null })]).at(-1)!
assert.equal(missing.bpm, null)
assert.equal(missing.band, null)
assert.equal(missing.confidence, 0)
assert.equal(missing.evidence.reason, 'inputs_missing')

// 3) Interpolado: confidence 0.7, e não entra nas médias do summary.
const interp = computeRestingHeartRateSeries([snap(0, { restingHeartRate: 70 }, { interpolated: true })]).at(-1)!
assert.ok(Math.abs(interp.confidence - 0.7) < 1e-9, 'interpolado tem confidence 0.7')

// 4) Summary: média do período, tendência subindo, e respeita o período inteiro.
const rising: DailySnapshot[] = []
for (let d = 9; d >= 5; d -= 1) rising.push(snap(d, { restingHeartRate: 70 }))   // 5 dias a 70
for (let d = 4; d >= 0; d -= 1) rising.push(snap(d, { restingHeartRate: 80 }))   // 5 dias a 80
const sumRising = computeRestingHeartRateSummary(rising)
assert.equal(sumRising.nightsUsed, 10, 'usa as 10 noites do período (sem slice)')
assert.ok(sumRising.meanBpm != null && Math.abs(sumRising.meanBpm - 75) < 1e-9, 'média 75')
assert.equal(sumRising.trend, 'subindo', 'metade recente (80) > antiga (70) = subindo')
assert.equal(sumRising.latest!.band, 'elevada', 'última leitura 80 = elevada')

// 5) Tendência estável quando o delta é pequeno.
const flat: DailySnapshot[] = []
for (let d = 7; d >= 0; d -= 1) flat.push(snap(d, { restingHeartRate: 72 }))
assert.equal(computeRestingHeartRateSummary(flat).trend, 'estavel', 'sem variação = estável')

console.log('resting-heart-rate.test.ts — all assertions passed')
