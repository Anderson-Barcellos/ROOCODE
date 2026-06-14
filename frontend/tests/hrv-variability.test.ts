import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  computeHrvVariabilitySeries,
} from '../src/utils/hrv-variability'
import { INTERP_CONFIDENCE_MULTIPLIER } from '../src/utils/interp-policy'

// ─── Helpers de fixture ────────────────────────────────────────────────────

interface FixtureOptions {
  hrv?: number | null
  interpolated?: boolean
  forecasted?: boolean
}

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function fixture(daysBack: number, opts: FixtureOptions = {}): DailySnapshot {
  const date = isoDate(daysBack)
  const hrv = opts.hrv === undefined ? 50 : opts.hrv
  return {
    date,
    interpolated: opts.interpolated,
    forecasted: opts.forecasted,
    health: {
      date,
      sleepStartAt: null,
      sleepEndAt: null,
      sleepTotalHours: null,
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
      hrvSdnn: hrv,
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
    },
    mood: null,
    medications: null,
  }
}

// ─── sma7 disponível após ~4 dias (floor(7/2)=3 → 4ª posição índice 3) ───

const tenSnapshots = Array.from({ length: 10 }, (_, i) => fixture(9 - i, { hrv: 50 + i }))
const tenSeries = computeHrvVariabilitySeries(tenSnapshots)
assert.equal(tenSeries[0].sma7, null, 'índice 0: sma7 null (< floor(7/2) válidos)')
assert.ok(tenSeries[3].sma7 != null, 'índice 3 (4ª posição): sma7 não null')

// ─── sma30 null com menos de 15 pontos válidos (floor(30/2)=15) ───────────

const fourteenSnapshots = Array.from({ length: 14 }, (_, i) => fixture(13 - i))
const fourteenSeries = computeHrvVariabilitySeries(fourteenSnapshots)
assert.equal(fourteenSeries.at(-1)?.sma30, null, 'sma30 null com < 15 pontos válidos')

const fifteenSnapshots = Array.from({ length: 15 }, (_, i) => fixture(14 - i))
const fifteenSeries = computeHrvVariabilitySeries(fifteenSnapshots)
assert.ok(fifteenSeries.at(-1)?.sma30 != null, 'sma30 não null com 15 pontos válidos')

// ─── rollingSd7 null com menos de 4 pontos válidos na janela ──────────────

const threeSnapshots = Array.from({ length: 3 }, (_, i) => fixture(2 - i))
const threeSeries = computeHrvVariabilitySeries(threeSnapshots)
assert.equal(threeSeries.at(-1)?.rollingSd7, null, 'rollingSd7 null com < 4 pontos')

const fourSnapshots = Array.from({ length: 4 }, (_, i) => fixture(3 - i))
const fourSeries = computeHrvVariabilitySeries(fourSnapshots)
assert.ok(fourSeries.at(-1)?.rollingSd7 != null, 'rollingSd7 não null com 4 pontos')

// ─── sdBandHigh = sma7 + rollingSd7 quando ambos não-null ─────────────────

const sevenSnapshots = Array.from({ length: 7 }, (_, i) => fixture(6 - i))
const sevenSeries = computeHrvVariabilitySeries(sevenSnapshots)
const lastSeven = sevenSeries.at(-1)!
if (lastSeven.sma7 != null && lastSeven.rollingSd7 != null) {
  assert.ok(
    Math.abs(lastSeven.sdBandHigh! - (lastSeven.sma7 + lastSeven.rollingSd7)) < 1e-9,
    `sdBandHigh deve ser sma7 + rollingSd7, got ${lastSeven.sdBandHigh}`,
  )
}

// ─── sdBandLow = max(0, sma7 - rollingSd7), nunca negativo ───────────────

const narrowSnapshots = [
  fixture(6, { hrv: 50 }),
  fixture(5, { hrv: 50 }),
  fixture(4, { hrv: 50 }),
  fixture(3, { hrv: 50 }),
  fixture(2, { hrv: 50 }),
  fixture(1, { hrv: 50 }),
  fixture(0, { hrv: 50 }),
]
const narrowSeries = computeHrvVariabilitySeries(narrowSnapshots)
for (const point of narrowSeries) {
  if (point.sdBandLow != null) {
    assert.ok(point.sdBandLow >= 0, `sdBandLow nunca deve ser negativo, got ${point.sdBandLow}`)
  }
}

// Forçar rollingSd7 > sma7 para garantir que max(0,...) funciona
const lowHrvSnapshots = Array.from({ length: 4 }, (_, i) =>
  fixture(3 - i, { hrv: i === 3 ? 1 : 50 + i * 10 }),
)
const lowSeries = computeHrvVariabilitySeries(lowHrvSnapshots)
for (const point of lowSeries) {
  if (point.sdBandLow != null) {
    assert.ok(point.sdBandLow >= 0, 'sdBandLow >= 0 mesmo com SD alto')
  }
}

// ─── hrv=null → reason='inputs_missing', confidence=0 ────────────────────

const nullHrvDataset = [
  fixture(2, { hrv: 50 }),
  fixture(1, { hrv: 50 }),
  fixture(0, { hrv: null }),
]
const nullHrvSeries = computeHrvVariabilitySeries(nullHrvDataset)
const nullDay = nullHrvSeries.at(-1)!
assert.equal(nullDay.hrv, null, 'hrv null → hrv=null no point')
assert.equal(nullDay.reason, 'inputs_missing', 'hrv null → reason=inputs_missing')
assert.equal(nullDay.confidence, 0, 'hrv null → confidence=0')

// ─── interpolated=true → derivedFromInterpolated=true, confidence=0.7 ────

const interpDataset = [
  fixture(2),
  fixture(1),
  fixture(0, { interpolated: true }),
]
const interpSeries = computeHrvVariabilitySeries(interpDataset)
const interpDay = interpSeries.at(-1)!
assert.equal(interpDay.derivedFromInterpolated, true, 'interpolated → derivedFromInterpolated=true')
assert.ok(
  Math.abs(interpDay.confidence - INTERP_CONFIDENCE_MULTIPLIER) < 1e-9,
  `interpolated confidence deve ser ${INTERP_CONFIDENCE_MULTIPLIER}, got ${interpDay.confidence}`,
)

// ─── Dia real → derivedFromInterpolated=false, confidence=1 ──────────────

const realDataset = [fixture(1), fixture(0)]
const realSeries = computeHrvVariabilitySeries(realDataset)
const realDay = realSeries.at(-1)!
assert.equal(realDay.derivedFromInterpolated, false, 'dia real → derivedFromInterpolated=false')
assert.equal(realDay.confidence, 1, 'dia real → confidence=1')

// ─── Série mantém 1 ponto por snapshot ────────────────────────────────────

const twentySnapshots = Array.from({ length: 20 }, (_, i) => fixture(19 - i))
const twentySeries = computeHrvVariabilitySeries(twentySnapshots)
assert.equal(twentySeries.length, twentySnapshots.length, 'série tem 1 ponto por snapshot')

// ─── Dataset all-null: sem crash, todos points com hrv/sma7/rollingSd7 null

const allNullDataset = Array.from({ length: 10 }, (_, i) => fixture(9 - i, { hrv: null }))
let allNullSeries: ReturnType<typeof computeHrvVariabilitySeries>
assert.doesNotThrow(() => {
  allNullSeries = computeHrvVariabilitySeries(allNullDataset)
}, 'dataset all-null não deve lançar exceção')
for (const point of allNullSeries!) {
  assert.equal(point.hrv, null, 'all-null: hrv=null')
  assert.equal(point.sma7, null, 'all-null: sma7=null')
  assert.equal(point.rollingSd7, null, 'all-null: rollingSd7=null')
}
