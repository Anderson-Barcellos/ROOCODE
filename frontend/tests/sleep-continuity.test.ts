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
    sleepTotalHours: 7.5, sleepAsleepHours: 0, sleepInBedHours: 8.0,
    sleepCoreHours: 4.0, sleepDeepHours: 1.4, sleepRemHours: 1.5, sleepAwakeHours: 0.4,
    sleepEfficiencyPct: null,
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

// 1) Eficiência via InBed quando disponível: total ÷ inBed.
const effInBed = computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7.2, sleepInBedHours: 8.0 })]).at(-1)!
assert.ok(effInBed.efficiencyPct != null && Math.abs(effInBed.efficiencyPct - 90) < 1e-9, 'total 7.2 / inBed 8.0 = 90%')
assert.equal(effInBed.efficiencyBand, 'ideal', '90% = ideal')

// 2) Eficiência via End−Start quando InBed ausente (caso real: Watch sem Sleep Schedule).
const effEpisode = computeSleepContinuitySeries([snap(0, {
  sleepTotalHours: 7.6, sleepInBedHours: 0,
  sleepStartAt: '2026-06-09T23:00:00-03:00',
  sleepEndAt: '2026-06-10T09:00:00-03:00', // 10h de episódio
})]).at(-1)!
assert.ok(effEpisode.efficiencyPct != null && Math.abs(effEpisode.efficiencyPct - 76) < 0.5, 'total 7.6 / 10h episódio ≈ 76%')
assert.equal(effEpisode.efficiencyBand, 'limitrofe', '76% = limítrofe')

// 3) Noite-lixo (cochilo): Total Sleep < 1h → inválida (efficiency e WASO null, fora do latest).
const nap = computeSleepContinuitySeries([snap(0, {
  sleepTotalHours: 0, sleepInBedHours: 2.65, sleepAwakeHours: 0,
  sleepStartAt: '2026-06-09T23:08:00-03:00', sleepEndAt: '2026-06-10T01:47:00-03:00',
})]).at(-1)!
assert.equal(nap.efficiencyPct, null, 'cochilo não tem eficiência')
assert.equal(nap.wasoHours, null, 'cochilo não conta WASO')
assert.equal(nap.efficiencyBand, null)
assert.equal(nap.wasoBand, null)

// 4) Clamp 100: total maior que o episódio (dados de múltiplos episódios).
const over100 = computeSleepContinuitySeries([snap(0, { sleepTotalHours: 13, sleepInBedHours: 10 })]).at(-1)!
assert.equal(over100.efficiencyPct, 100, 'eficiência clampa em 100')

// 5) Bandas de eficiência (via inBed pra controle exato dos boundaries).
assert.equal(computeSleepContinuitySeries([snap(0, { sleepTotalHours: 8.5, sleepInBedHours: 10 })]).at(-1)!.efficiencyBand, 'ideal', '85% = ideal')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7.5, sleepInBedHours: 10 })]).at(-1)!.efficiencyBand, 'limitrofe', '75% = limítrofe')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7.0, sleepInBedHours: 10 })]).at(-1)!.efficiencyBand, 'pobre', '70% = pobre')

// 6) Bandas de WASO (noite válida).
assert.equal(computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7, sleepAwakeHours: 0.3 })]).at(-1)!.wasoBand, 'ideal', '<0.5h = ideal')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7, sleepAwakeHours: 0.5 })]).at(-1)!.wasoBand, 'limitrofe', '0.5h = limítrofe')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7, sleepAwakeHours: 1.0 })]).at(-1)!.wasoBand, 'limitrofe', '1.0h = limítrofe')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7, sleepAwakeHours: 1.4 })]).at(-1)!.wasoBand, 'fragmentado', '>1h = fragmentado')

// 7) Confidence interpolado (noite válida).
const interp = computeSleepContinuitySeries([snap(0, { sleepTotalHours: 7, sleepInBedHours: 8 }, { interpolated: true })]).at(-1)!
assert.ok(Math.abs(interp.confidence - 0.7) < 1e-9, 'interpolado tem confidence 0.7')

// 8) Summary respeita o período inteiro (sem slice de 14) e o latest pula o cochilo.
const dataset: DailySnapshot[] = []
for (let d = 19; d >= 1; d -= 1) dataset.push(snap(d, { sleepTotalHours: 7.5, sleepInBedHours: 9, sleepAwakeHours: 0.4 }))
dataset.push(snap(0, { sleepTotalHours: 0, sleepInBedHours: 2.65, sleepAwakeHours: 0 })) // cochilo de hoje
const summary = computeSleepContinuitySummary(dataset)
assert.equal(summary.nightsUsed, 19, 'usa todas as 19 noites válidas do período, não 14')
assert.ok(summary.latest != null && summary.latest.efficiencyPct != null, 'latest pula o cochilo de hoje')
assert.ok(summary.meanEfficiencyPct != null && Math.abs(summary.meanEfficiencyPct - (7.5 / 9) * 100) < 1e-6, 'média = 83.3%')
assert.ok(summary.meanWasoHours != null && Math.abs(summary.meanWasoHours - 0.4) < 1e-9, 'WASO médio 0.4h')

console.log('sleep-continuity.test.ts — all assertions passed')
