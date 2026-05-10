import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  RECOVERY_WEIGHTS,
  computeRecoveryBaselines,
  computeRecoveryScoreSeries,
} from '../src/utils/recovery-score'

// ─── Pesos somam 100 (sanity) ─────────────────────────────────────────────

const totalWeight =
  RECOVERY_WEIGHTS.hrv +
  RECOVERY_WEIGHTS.sleepEff +
  RECOVERY_WEIGHTS.rhr +
  RECOVERY_WEIGHTS.sleepDebt +
  RECOVERY_WEIGHTS.mood
assert.ok(Math.abs(totalWeight - 1) < 1e-9, `Pesos devem somar 1, somam ${totalWeight}`)

// ─── Helpers de fixture ───────────────────────────────────────────────────

interface FixtureOptions {
  hrv?: number | null
  rhr?: number | null
  sleepEff?: number | null
  sleepTotal?: number | null
  valence?: number | null
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
  // Coalesce só quando undefined — preservar null explícito permite simular
  // input ausente, que é uma das condições críticas do score (inputs_missing).
  const hrv = opts.hrv === undefined ? 50 : opts.hrv
  const rhr = opts.rhr === undefined ? 60 : opts.rhr
  const sleepEff = opts.sleepEff === undefined ? 90 : opts.sleepEff
  const sleepTotal = opts.sleepTotal === undefined ? 8 : opts.sleepTotal
  const valence = opts.valence === undefined ? 0 : opts.valence
  return {
    date,
    interpolated: opts.interpolated,
    forecasted: opts.forecasted,
    health: {
      date,
      sleepTotalHours: sleepTotal,
      sleepAsleepHours: null,
      sleepInBedHours: null,
      sleepCoreHours: null,
      sleepDeepHours: null,
      sleepRemHours: null,
      sleepAwakeHours: null,
      sleepEfficiencyPct: sleepEff,
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
    mood: {
      date,
      valence,
      valenceClass: null,
      entryCount: 1,
      labels: [],
      associations: [],
    },
    medications: null,
  }
}

/**
 * Constrói 16 dias: 14 baseline reais com HRV=50 / RHR=60 / sleepEff=90 +
 * variação ±2 (dá SD não-zero pros z-scores) + 2 dias-alvo configuráveis.
 */
function buildDataset(target1: FixtureOptions, target2: FixtureOptions): DailySnapshot[] {
  const snapshots: DailySnapshot[] = []
  for (let i = 15; i >= 2; i -= 1) {
    snapshots.push(
      fixture(i, {
        hrv: 50 + (i % 5) - 2,
        rhr: 60 + (i % 3) - 1,
        sleepEff: 88 + (i % 3),
        sleepTotal: 7.5,
        valence: 0,
      }),
    )
  }
  snapshots.push(fixture(1, target1))
  snapshots.push(fixture(0, target2))
  return snapshots
}

// ─── Baselines disponíveis quando há 14+ dias reais ──────────────────────

const baselineDataset = buildDataset({}, {})
const baselines = computeRecoveryBaselines(baselineDataset)
assert.ok(baselines.hrv, 'HRV baseline deve estar disponível com 14+ dias reais')
assert.ok(baselines.rhr, 'RHR baseline deve estar disponível com 14+ dias reais')
assert.ok(Math.abs(baselines.hrv.mean - 50) < 2, `HRV mean ~50, got ${baselines.hrv.mean}`)
assert.ok(Math.abs(baselines.rhr.mean - 60) < 1.5, `RHR mean ~60, got ${baselines.rhr.mean}`)

// ─── Score do dia "médio" (HRV/RHR no mean, sleep 90, debt baixo, mood neutra) ──

const meanDayDataset = buildDataset(
  {},
  {
    hrv: baselines.hrv.mean,
    rhr: baselines.rhr.mean,
    sleepEff: 90,
    sleepTotal: 7.5,
    valence: 0,
  },
)
const meanSeries = computeRecoveryScoreSeries(meanDayDataset)
const meanDay = meanSeries[meanSeries.length - 1]
assert.ok(meanDay.score != null, 'Dia médio deve ter score')
// HRV z=0→50, RHR z=0→50, sleepEff=90, debt~0→100, valence=0→50
// Expected: 0.30*50 + 0.25*90 + 0.20*50 + 0.15*100 + 0.10*50 = 15 + 22.5 + 10 + 15 + 5 = 67.5
assert.ok(
  Math.abs(meanDay.score - 67.5) < 1,
  `Dia médio esperava ~67.5, got ${meanDay.score}`,
)

// ─── Dia "perfeito" (todos no topo) → próximo de 100 ──────────────────────

const perfectDataset = buildDataset(
  {},
  {
    hrv: baselines.hrv.mean + 3 * baselines.hrv.sd, // z=+3 clampa em +2 → 100
    rhr: baselines.rhr.mean - 3 * baselines.rhr.sd, // z=-3 clampa em -2, invertido → 100
    sleepEff: 100,
    sleepTotal: 9,
    valence: 1,
  },
)
const perfectSeries = computeRecoveryScoreSeries(perfectDataset)
const perfectDay = perfectSeries[perfectSeries.length - 1]
assert.ok(perfectDay.score != null)
assert.ok(perfectDay.score >= 99, `Dia perfeito esperava ≥99, got ${perfectDay.score}`)

// ─── Dia "péssimo" (todos no fundo) → próximo de 0 ────────────────────────

const worstDataset = buildDataset(
  {},
  {
    hrv: baselines.hrv.mean - 3 * baselines.hrv.sd,
    rhr: baselines.rhr.mean + 3 * baselines.rhr.sd,
    sleepEff: 0,
    sleepTotal: 0, // debt 7d ≈ 7h+ → componente 0
    valence: -1,
  },
)
const worstSeries = computeRecoveryScoreSeries(worstDataset)
const worstDay = worstSeries[worstSeries.length - 1]
assert.ok(worstDay.score != null)
assert.ok(worstDay.score <= 5, `Dia péssimo esperava ≤5, got ${worstDay.score}`)

// ─── Componentes individuais corretos ─────────────────────────────────────

assert.equal(perfectDay.components?.hrv, 100)
assert.equal(perfectDay.components?.rhr, 100)
assert.equal(perfectDay.components?.sleepEff, 100)
assert.equal(perfectDay.components?.mood, 100)
assert.ok(perfectDay.components?.sleepDebt != null && perfectDay.components.sleepDebt >= 90)

// ─── Reason: interpolated → score null ───────────────────────────────────

const interpDataset = buildDataset({}, { interpolated: true })
const interpSeries = computeRecoveryScoreSeries(interpDataset)
const interpDay = interpSeries[interpSeries.length - 1]
assert.equal(interpDay.score, null)
assert.equal(interpDay.reason, 'interpolated')

// ─── Reason: forecasted → score null ──────────────────────────────────────

const forecastDataset = buildDataset({}, { forecasted: true })
const forecastSeries = computeRecoveryScoreSeries(forecastDataset)
const forecastDay = forecastSeries[forecastSeries.length - 1]
assert.equal(forecastDay.score, null)
assert.equal(forecastDay.reason, 'forecasted')

// ─── Reason: input missing (mood null) → score null ──────────────────────

const missingMoodDataset = buildDataset({}, { valence: null })
const missingMoodSeries = computeRecoveryScoreSeries(missingMoodDataset)
const missingMoodDay = missingMoodSeries[missingMoodSeries.length - 1]
assert.equal(missingMoodDay.score, null)
assert.equal(missingMoodDay.reason, 'inputs_missing')

// ─── Reason: input missing (HRV null) → score null ────────────────────────

const missingHrvDataset = buildDataset({}, { hrv: null })
const missingHrvSeries = computeRecoveryScoreSeries(missingHrvDataset)
const missingHrvDay = missingHrvSeries[missingHrvSeries.length - 1]
assert.equal(missingHrvDay.score, null)
assert.equal(missingHrvDay.reason, 'inputs_missing')

// ─── Reason: baseline_missing quando <14 dias reais ──────────────────────

const tinyDataset = [
  fixture(2, { hrv: 50, rhr: 60 }),
  fixture(1, { hrv: 52, rhr: 62 }),
  fixture(0, { hrv: 51, rhr: 61 }),
]
const tinySeries = computeRecoveryScoreSeries(tinyDataset)
for (const point of tinySeries) {
  assert.equal(point.score, null, `tiny dataset deveria não computar score`)
  assert.equal(point.reason, 'baseline_missing')
}

// ─── Baseline calculada SEMPRE filtra interpolated/forecasted ─────────────

const pollutedDataset: DailySnapshot[] = [
  ...buildDataset({}, {}).slice(0, 14),
  // Pollui com 5 dias forecasted que não devem entrar na baseline
  ...Array.from({ length: 5 }, (_, i) =>
    fixture(-i - 1, { hrv: 999, rhr: 999, forecasted: true }),
  ),
]
const pollutedBaselines = computeRecoveryBaselines(pollutedDataset)
assert.ok(pollutedBaselines.hrv && pollutedBaselines.hrv.mean < 100)
assert.ok(pollutedBaselines.rhr && pollutedBaselines.rhr.mean < 100)

// ─── Série mantém 1 ponto por snapshot ────────────────────────────────────

assert.equal(meanSeries.length, meanDayDataset.length)
