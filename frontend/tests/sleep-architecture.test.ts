import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import {
  computeSleepArchitectureSeries,
  computeSleepArchitectureSummary,
} from '../src/utils/sleep-architecture'

function isoDate(dayOffset: number): string {
  const base = new Date('2026-05-18T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - dayOffset)
  return base.toISOString().slice(0, 10)
}

interface Stages {
  deep: number | null
  rem: number | null
  core: number | null
}

function snapshot(dayOffset: number, stages: Stages): DailySnapshot {
  const date = isoDate(dayOffset)
  const health: DailyHealthMetrics = {
    date,
    sleepStartAt: `${date}T23:10:00-03:00`,
    sleepEndAt: `${date}T07:05:00-03:00`,
    sleepTotalHours: 7.5,
    sleepAsleepHours: null,
    sleepInBedHours: null,
    sleepCoreHours: stages.core,
    sleepDeepHours: stages.deep,
    sleepRemHours: stages.rem,
    sleepAwakeHours: 0.4,
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
  return { date, health, mood: null, medications: null }
}

// Noite com estrutura ideal: deep 18%, REM 22%, core 60% (de 6h classificadas)
// deep=1.08, rem=1.32, core=3.6 -> soma 6.0
const idealNights = Array.from({ length: 14 }, (_, i) =>
  snapshot(13 - i, { deep: 1.08, rem: 1.32, core: 3.6 }),
)

const series = computeSleepArchitectureSeries(idealNights)
const last = series.at(-1)!
assert.ok(last.pctDeep != null && Math.abs(last.pctDeep - 18) < 0.5, 'pctDeep ~18%')
assert.ok(last.pctRem != null && Math.abs(last.pctRem - 22) < 0.5, 'pctRem ~22%')
assert.equal(last.deepBand, 'ideal')
assert.equal(last.remBand, 'ideal')
assert.ok(last.score != null && last.score >= 95, 'estrutura ideal pontua alto')

// Noite com deep insuficiente: deep 5%, REM 20%, core 75%
// deep=0.3, rem=1.2, core=4.5 -> soma 6.0. Janela de 14 p/ readiness robusto.
const lowDeepNights = Array.from({ length: 14 }, (_, i) =>
  snapshot(13 - i, { deep: 0.3, rem: 1.2, core: 4.5 }),
)
const lowDeep = computeSleepArchitectureSeries(lowDeepNights).at(-1)!
assert.equal(lowDeep.deepBand, 'baixo')
assert.ok(lowDeep.score != null && lowDeep.score < 75, 'deep baixo derruba o score')

// Noite sem estágios classificados -> score null, inputs_missing
const noStages = computeSleepArchitectureSeries([snapshot(0, { deep: null, rem: null, core: null })])[0]
assert.equal(noStages.score, null)
assert.equal(noStages.reason, 'inputs_missing')

// Estágios somando zero -> tratado como ausente
const zero = computeSleepArchitectureSeries([snapshot(0, { deep: 0, rem: 0, core: 0 })])[0]
assert.equal(zero.score, null)

// Summary sobre janela ideal: média alta, nightsUsed contabilizado
const summary = computeSleepArchitectureSummary(idealNights)
assert.ok(summary.latest != null)
assert.ok(summary.meanScore != null && summary.meanScore >= 95)
assert.ok(summary.meanPctDeep != null && Math.abs(summary.meanPctDeep - 18) < 0.5)
assert.equal(summary.nightsUsed, 14)

// Summary com poucas noites válidas -> médias null mas latest presente
const sparse = computeSleepArchitectureSummary([snapshot(0, { deep: 1.08, rem: 1.32, core: 3.6 })])
assert.ok(sparse.latest != null)
assert.equal(sparse.meanScore, null)

console.log('sleep-architecture.test.ts — all assertions passed')
