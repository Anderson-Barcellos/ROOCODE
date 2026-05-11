import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  HRR_BANDS,
  computeHeartRateReserveSeries,
  getHrrBand,
} from '../src/utils/heart-rate-reserve'
import { ANDERS_HRMAX_BPM } from '../src/utils/health-policies'
import { INTERP_CONFIDENCE_MULTIPLIER } from '../src/utils/interp-policy'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

interface FixtureOptions {
  rhr?: number | null
  walkingHR?: number | null
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
  const rhr = opts.rhr === undefined ? 60 : opts.rhr
  const walkingHR = opts.walkingHR === undefined ? 90 : opts.walkingHR
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

function buildSeries(opts: FixtureOptions = {}): ReturnType<typeof computeHeartRateReserveSeries> {
  return computeHeartRateReserveSeries([fixture(0, opts)])
}

// ─── HRR_BANDS sanity ─────────────────────────────────────────────────────────

assert.equal(HRR_BANDS.length, 4)
assert.equal(HRR_BANDS[0].label, 'Baixa')
assert.equal(HRR_BANDS[3].label, 'Excelente')

// ─── Test 1: Basic reserve computation ───────────────────────────────────────

const [basic] = buildSeries({ rhr: 60 })
assert.equal(basic.hrr, ANDERS_HRMAX_BPM - 60) // 182 - 60 = 122
assert.equal(basic.rhr, 60)

// ─── Test 2: Band classification ─────────────────────────────────────────────

assert.equal(getHrrBand(95)?.label, 'Baixa')
assert.equal(getHrrBand(110)?.label, 'Moderada')
assert.equal(getHrrBand(120)?.label, 'Boa')
assert.equal(getHrrBand(130)?.label, 'Excelente')

// ─── Test 3: Band boundaries (inclusive lower, exclusive upper) ───────────────

assert.equal(getHrrBand(100)?.label, 'Moderada')  // not 'Baixa' — 100 is the boundary
assert.equal(getHrrBand(115)?.label, 'Boa')        // not 'Moderada'
assert.equal(getHrrBand(125)?.label, 'Excelente')  // not 'Boa'

// ─── Test 4: getHrrBand(null) → null ─────────────────────────────────────────

assert.equal(getHrrBand(null), null)

// ─── Test 5: Walking reserve % ───────────────────────────────────────────────

const [walkingPoint] = buildSeries({ rhr: 60, walkingHR: 90 })
// hrr = 122, pct = (90 - 60) / 122 * 100 ≈ 24.59%
assert.ok(walkingPoint.walkingReservePct != null)
assert.ok(
  Math.abs(walkingPoint.walkingReservePct - (30 / 122) * 100) < 0.01,
  `Expected ~${((30 / 122) * 100).toFixed(2)}%, got ${walkingPoint.walkingReservePct?.toFixed(2)}%`,
)

// ─── Test 6: walkingReservePct null when walkingHR is null ───────────────────

const [noWalking] = buildSeries({ rhr: 60, walkingHR: null })
assert.equal(noWalking.walkingReservePct, null)
assert.equal(noWalking.walkingHR, null)

// ─── Test 7: walkingReservePct null when rhr is null ─────────────────────────

const [noRhr] = buildSeries({ rhr: null, walkingHR: 90 })
assert.equal(noRhr.walkingReservePct, null)
assert.equal(noRhr.hrr, null)

// ─── Test 8: walkingReservePct clamped at 0 (walkingHR < rhr) ────────────────

const [lowWalking] = buildSeries({ rhr: 60, walkingHR: 50 })
assert.ok(lowWalking.walkingReservePct != null)
assert.equal(lowWalking.walkingReservePct, 0)

// ─── Test 9: walkingReservePct can exceed 100% ───────────────────────────────

// rhr=60, walkingHR=190, hrr=122 → (190-60)/122*100 ≈ 106.56%
const [highWalking] = buildSeries({ rhr: 60, walkingHR: 190 })
assert.ok(highWalking.walkingReservePct != null)
assert.ok(
  highWalking.walkingReservePct > 100,
  `Expected >100%, got ${highWalking.walkingReservePct?.toFixed(2)}%`,
)
assert.ok(
  Math.abs(highWalking.walkingReservePct - (130 / 122) * 100) < 0.01,
  `Expected ~${((130 / 122) * 100).toFixed(2)}%, got ${highWalking.walkingReservePct?.toFixed(2)}%`,
)

// ─── Test 10: SMA-7 available after sufficient points ────────────────────────

const tenSnaps = Array.from({ length: 10 }, (_, i) => fixture(9 - i, { rhr: 60 + i }))
const tenSeries = computeHeartRateReserveSeries(tenSnaps)

// sma() requires floor(window/2) = 3 valid values in window before returning non-null
// First few points may be null, points from index 3+ should have a value
const laterPoints = tenSeries.slice(3)
assert.ok(
  laterPoints.some((p) => p.hrrSma7 != null),
  'SMA-7 deve estar disponível após alguns pontos',
)
// First point (only 1 in window of 7) — floor(7/2)=3 min required → null
assert.equal(tenSeries[0].hrrSma7, null)

// ─── Test 11: rhr=null → hrr=null, reason='inputs_missing', confidence=0 ──────

const [missingRhr] = buildSeries({ rhr: null })
assert.equal(missingRhr.hrr, null)
assert.equal(missingRhr.reason, 'inputs_missing')
assert.equal(missingRhr.confidence, 0)
assert.equal(missingRhr.band, null)

// ─── Test 12: interpolated=true → derivedFromInterpolated=true, confidence=INTERP ─

const [interpPoint] = buildSeries({ rhr: 60, interpolated: true })
assert.equal(interpPoint.derivedFromInterpolated, true)
assert.ok(
  Math.abs(interpPoint.confidence - INTERP_CONFIDENCE_MULTIPLIER) < 1e-9,
  `interp confidence deve ser ${INTERP_CONFIDENCE_MULTIPLIER}, got ${interpPoint.confidence}`,
)

// ─── Test 13: Real day → derivedFromInterpolated=false, confidence=1 ──────────

const [realPoint] = buildSeries({ rhr: 60 })
assert.equal(realPoint.derivedFromInterpolated, false)
assert.equal(realPoint.confidence, 1)

// ─── Test 14: Series length = snapshot count ──────────────────────────────────

const snaps = Array.from({ length: 7 }, (_, i) => fixture(6 - i))
const series = computeHeartRateReserveSeries(snaps)
assert.equal(series.length, snaps.length)
