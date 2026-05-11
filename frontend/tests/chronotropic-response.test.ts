import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  computeChronotropicBaseline,
  computeChronotropicSeries,
} from '../src/utils/chronotropic-response'
import { INTERP_CONFIDENCE_MULTIPLIER } from '../src/utils/interp-policy'

// ─── Helpers de fixture ───────────────────────────────────────────────────────

interface FixtureOptions {
  walkingHR?: number | null
  rhr?: number | null
  interpolated?: boolean
  forecasted?: boolean
}

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-11T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function fixture(daysBack: number, opts: FixtureOptions = {}): DailySnapshot {
  const date = isoDate(daysBack)
  const walkingHR = opts.walkingHR === undefined ? 90 : opts.walkingHR
  const rhr = opts.rhr === undefined ? 60 : opts.rhr
  return {
    date,
    interpolated: opts.interpolated,
    forecasted: opts.forecasted,
    health: {
      date,
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
      restingHeartRate: rhr,
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
      walkingHeartRateAvg: walkingHR,
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

function buildDataset(target1: FixtureOptions, target2: FixtureOptions): DailySnapshot[] {
  const snapshots: DailySnapshot[] = []
  // 14 baseline days com jitter em ambos os campos pra garantir SD > 0
  for (let i = 15; i >= 2; i -= 1) {
    snapshots.push(
      fixture(i, {
        walkingHR: 90 + (i % 5) - 2,
        rhr: 60 + (i % 3) - 1,
      }),
    )
  }
  snapshots.push(fixture(1, target1))
  snapshots.push(fixture(0, target2))
  return snapshots
}

// ─── Baseline disponível com ≥14 dias reais válidos ──────────────────────────

const baselineDataset = buildDataset({}, {})
const baseline = computeChronotropicBaseline(baselineDataset)
assert.ok(baseline, 'Baseline cronotrópica deve estar disponível com 14+ dias reais')
// delta médio baseline: walkingHR 90±jitter − rhr 60±jitter ≈ 30
assert.ok(
  Math.abs(baseline.mean - 30) < 5,
  `Baseline mean ~30, got ${baseline.mean.toFixed(3)}`,
)
assert.ok(baseline.sd > 0, 'SD deve ser > 0 com jitter')

// ─── Dia "médio" (delta no centro da baseline) → z ≈ 0 ───────────────────────

const meanDataset = buildDataset({}, { walkingHR: 90, rhr: 60 })
const meanSeries = computeChronotropicSeries(meanDataset)
const meanDay = meanSeries[meanSeries.length - 1]
assert.ok(meanDay.zScore != null, 'Dia médio deve ter zScore')
assert.ok(
  Math.abs(meanDay.zScore) < 1,
  `Dia médio z deve ser próximo de 0, got ${meanDay.zScore}`,
)
assert.ok(meanDay.components != null)
assert.equal(meanDay.components.walkingHR, 90)
assert.equal(meanDay.components.rhr, 60)
assert.equal(meanDay.components.delta, 30)

// ─── Dia com delta expandido (walkingHR=110, rhr=55) → z > 0 ─────────────────

const expandedDataset = buildDataset({}, { walkingHR: 110, rhr: 55 })
const expandedSeries = computeChronotropicSeries(expandedDataset)
const expandedDay = expandedSeries[expandedSeries.length - 1]
assert.ok(expandedDay.zScore != null && expandedDay.zScore > 0, `Delta expandido z>0, got ${expandedDay.zScore}`)

// ─── Dia com delta comprimido (walkingHR=70, rhr=65) → z < 0 (comprimido) ────

const compressedDataset = buildDataset({}, { walkingHR: 70, rhr: 65 })
const compressedSeries = computeChronotropicSeries(compressedDataset)
const compressedDay = compressedSeries[compressedSeries.length - 1]
assert.ok(
  compressedDay.zScore != null && compressedDay.zScore < 0,
  `Delta comprimido z<0, got ${compressedDay.zScore}`,
)

// ─── interpolated=true → derivedFromInterpolated=true, confidence<1 ──────────

const interpDataset = buildDataset({}, { interpolated: true })
const interpDay = computeChronotropicSeries(interpDataset).at(-1)!
assert.ok(interpDay.zScore != null, 'interpolated deve ter zScore não-null')
assert.equal(interpDay.derivedFromInterpolated, true)
assert.ok(interpDay.confidence < 1, `interp confidence deve ser < 1, got ${interpDay.confidence}`)

// ─── forecasted=true → derivedFromInterpolated=true, confidence<1 ────────────

const forecastDataset = buildDataset({}, { forecasted: true })
const forecastDay = computeChronotropicSeries(forecastDataset).at(-1)!
assert.ok(forecastDay.zScore != null, 'forecasted deve ter zScore não-null')
assert.equal(forecastDay.derivedFromInterpolated, true)
assert.ok(forecastDay.confidence < 1, `forecast confidence deve ser < 1, got ${forecastDay.confidence}`)

// ─── Dia real → derivedFromInterpolated=false, confidence=1 ──────────────────

assert.equal(meanDay.derivedFromInterpolated, false)
assert.equal(meanDay.confidence, 1)

// ─── Confidence interp = INTERP_CONFIDENCE_MULTIPLIER ────────────────────────

const sameInputsReal = buildDataset({}, { walkingHR: 90, rhr: 60 })
const sameInputsInterp = buildDataset({}, { walkingHR: 90, rhr: 60, interpolated: true })
const realPoint = computeChronotropicSeries(sameInputsReal).at(-1)!
const interpPoint = computeChronotropicSeries(sameInputsInterp).at(-1)!
assert.equal(realPoint.confidence, 1, `real confidence deve ser 1, got ${realPoint.confidence}`)
assert.ok(
  Math.abs(interpPoint.confidence - INTERP_CONFIDENCE_MULTIPLIER) < 1e-9,
  `interp confidence deve ser ${INTERP_CONFIDENCE_MULTIPLIER}, got ${interpPoint.confidence}`,
)

// ─── Reason: inputs_missing (walkingHR null) ──────────────────────────────────

const missingWalkingHR = buildDataset({}, { walkingHR: null })
const missingWalkingHRDay = computeChronotropicSeries(missingWalkingHR).at(-1)!
assert.equal(missingWalkingHRDay.zScore, null)
assert.equal(missingWalkingHRDay.reason, 'inputs_missing')
assert.equal(missingWalkingHRDay.confidence, 0)

// ─── Reason: inputs_missing (RHR null) ───────────────────────────────────────

const missingRhr = buildDataset({}, { rhr: null })
const missingRhrDay = computeChronotropicSeries(missingRhr).at(-1)!
assert.equal(missingRhrDay.zScore, null)
assert.equal(missingRhrDay.reason, 'inputs_missing')
assert.equal(missingRhrDay.confidence, 0)

// ─── Reason: baseline_missing quando <14 dias reais ──────────────────────────

const tinyDataset = [
  fixture(2, { walkingHR: 90, rhr: 60 }),
  fixture(1, { walkingHR: 92, rhr: 62 }),
  fixture(0, { walkingHR: 91, rhr: 61 }),
]
const tinySeries = computeChronotropicSeries(tinyDataset)
for (const point of tinySeries) {
  assert.equal(point.zScore, null)
  assert.equal(point.reason, 'baseline_missing')
  assert.equal(point.confidence, 0)
}

// ─── Baseline filtra snapshots forecasted (dataset poluído) ──────────────────

const pollutedDataset: DailySnapshot[] = [
  ...buildDataset({}, {}).slice(0, 14),
  ...Array.from({ length: 5 }, (_, i) =>
    fixture(-i - 1, { walkingHR: 200, rhr: 10, forecasted: true }),
  ),
]
const pollutedBaseline = computeChronotropicBaseline(pollutedDataset)
assert.ok(pollutedBaseline, 'baseline existe mesmo com dados poluídos')
// Se forecasted entrasse, mean explodiria (delta=190). Como filtramos, fica ~30.
assert.ok(
  pollutedBaseline.mean < 50,
  `baseline pós-filtro deve ficar próxima de 30, got ${pollutedBaseline.mean.toFixed(3)}`,
)

// ─── Série mantém 1 ponto por snapshot ───────────────────────────────────────

assert.equal(meanSeries.length, meanDataset.length)
