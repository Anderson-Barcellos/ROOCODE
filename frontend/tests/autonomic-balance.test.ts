import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  ABI_BAND_THRESHOLD,
  computeAbiBaseline,
  computeAbiSeries,
} from '../src/utils/autonomic-balance'

// ─── Threshold de banda (sanity) ──────────────────────────────────────────

assert.equal(ABI_BAND_THRESHOLD, 1)

// ─── Helpers de fixture (mesmo padrão recovery-score.test.ts) ─────────────

interface FixtureOptions {
  hrv?: number | null
  rhr?: number | null
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

function buildDataset(target1: FixtureOptions, target2: FixtureOptions): DailySnapshot[] {
  const snapshots: DailySnapshot[] = []
  // 14 baseline days com pequeno jitter pra forçar SD > 0 no log-ratio
  for (let i = 15; i >= 2; i -= 1) {
    snapshots.push(
      fixture(i, {
        hrv: 50 + (i % 5) - 2,
        rhr: 60 + (i % 3) - 1,
      }),
    )
  }
  snapshots.push(fixture(1, target1))
  snapshots.push(fixture(0, target2))
  return snapshots
}

// ─── Baseline disponível com ≥14 dias reais válidos ──────────────────────

const baselineDataset = buildDataset({}, {})
const baseline = computeAbiBaseline(baselineDataset)
assert.ok(baseline, 'Baseline ABI deve estar disponível com 14+ dias reais')
// log(50/60) = ln(0.833) ≈ -0.182. Com jitter, mean fica próximo disso.
assert.ok(
  Math.abs(baseline.mean - Math.log(50 / 60)) < 0.05,
  `ABI baseline mean ~${Math.log(50 / 60).toFixed(3)}, got ${baseline.mean.toFixed(3)}`,
)
assert.ok(baseline.sd > 0, 'SD deve ser > 0 com jitter')

// ─── Dia "médio" (HRV/RHR no centro da baseline) → z ≈ 0 ─────────────────

const meanDataset = buildDataset({}, { hrv: 50, rhr: 60 })
const meanSeries = computeAbiSeries(meanDataset)
const meanDay = meanSeries[meanSeries.length - 1]
assert.ok(meanDay.abi != null, 'Dia médio deve ter ABI')
assert.ok(Math.abs(meanDay.abi) < 1, `Dia médio z deve ser próximo de 0, got ${meanDay.abi}`)
assert.ok(meanDay.components != null)
assert.equal(meanDay.components.hrv, 50)
assert.equal(meanDay.components.rhr, 60)
assert.ok(Math.abs(meanDay.components.ratio - 50 / 60) < 1e-9)

// ─── Dia com HRV alto + RHR baixo → z >> 0 (parassimpático) ──────────────

const parasympatheticDataset = buildDataset({}, { hrv: 90, rhr: 50 })
const paraSeries = computeAbiSeries(parasympatheticDataset)
const paraDay = paraSeries[paraSeries.length - 1]
assert.ok(paraDay.abi != null && paraDay.abi > ABI_BAND_THRESHOLD, `Para z>+1, got ${paraDay.abi}`)

// ─── Dia com HRV baixo + RHR alto → z << 0 (simpático) ───────────────────

const sympatheticDataset = buildDataset({}, { hrv: 30, rhr: 80 })
const sympSeries = computeAbiSeries(sympatheticDataset)
const sympDay = sympSeries[sympSeries.length - 1]
assert.ok(sympDay.abi != null && sympDay.abi < -ABI_BAND_THRESHOLD, `Symp z<-1, got ${sympDay.abi}`)

// ─── Reason: interpolated → abi=null ─────────────────────────────────────

const interpDataset = buildDataset({}, { interpolated: true })
const interpDay = computeAbiSeries(interpDataset).at(-1)!
assert.equal(interpDay.abi, null)
assert.equal(interpDay.reason, 'interpolated')

// ─── Reason: forecasted → abi=null ────────────────────────────────────────

const forecastDataset = buildDataset({}, { forecasted: true })
const forecastDay = computeAbiSeries(forecastDataset).at(-1)!
assert.equal(forecastDay.abi, null)
assert.equal(forecastDay.reason, 'forecasted')

// ─── Reason: inputs_missing (HRV null) ───────────────────────────────────

const missingHrv = buildDataset({}, { hrv: null })
const missingHrvDay = computeAbiSeries(missingHrv).at(-1)!
assert.equal(missingHrvDay.abi, null)
assert.equal(missingHrvDay.reason, 'inputs_missing')

// ─── Reason: inputs_missing (RHR null) ───────────────────────────────────

const missingRhr = buildDataset({}, { rhr: null })
const missingRhrDay = computeAbiSeries(missingRhr).at(-1)!
assert.equal(missingRhrDay.abi, null)
assert.equal(missingRhrDay.reason, 'inputs_missing')

// ─── Reason: baseline_missing quando <14 dias reais ──────────────────────

const tinyDataset = [
  fixture(2, { hrv: 50, rhr: 60 }),
  fixture(1, { hrv: 52, rhr: 62 }),
  fixture(0, { hrv: 51, rhr: 61 }),
]
const tinySeries = computeAbiSeries(tinyDataset)
for (const point of tinySeries) {
  assert.equal(point.abi, null)
  assert.equal(point.reason, 'baseline_missing')
}

// ─── Baseline filtra interpolated/forecasted ─────────────────────────────

const pollutedDataset: DailySnapshot[] = [
  ...buildDataset({}, {}).slice(0, 14),
  ...Array.from({ length: 5 }, (_, i) =>
    fixture(-i - 1, { hrv: 9999, rhr: 1, forecasted: true }),
  ),
]
const pollutedBaseline = computeAbiBaseline(pollutedDataset)
assert.ok(pollutedBaseline, 'baseline existe')
// Se forecasted entrasse, mean log-ratio iria explodir (ln(9999/1) ≈ 9.2).
// Como filtramos, deve ficar próximo do baseline normal (~-0.18).
assert.ok(pollutedBaseline.mean < 0, `baseline pós-filtro deve ficar negativa (próx ln(50/60)), got ${pollutedBaseline.mean.toFixed(3)}`)

// ─── HRV/RHR ≤ 0 → inputs_missing (proteção contra log inválido) ─────────

const zeroHrv = buildDataset({}, { hrv: 0, rhr: 60 })
const zeroHrvDay = computeAbiSeries(zeroHrv).at(-1)!
assert.equal(zeroHrvDay.abi, null)
assert.equal(zeroHrvDay.reason, 'inputs_missing')

// ─── Série mantém 1 ponto por snapshot ────────────────────────────────────

assert.equal(meanSeries.length, meanDataset.length)
