import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics, DailyMoodMetrics } from '../src/types/apple-health'
import { enrichSnapshotsWithDerivations } from '../src/utils/forecast-payload-enrichment'

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface FixtureOpts {
  hrv?: number | null
  rhr?: number | null
  sleepEff?: number | null
  sleepTotal?: number | null
  pulseTempC?: number | null
  valence?: number | null
  interpolated?: boolean
  forecasted?: boolean
}

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function buildHealth(date: string, opts: FixtureOpts): DailyHealthMetrics {
  return {
    date,
    sleepTotalHours: opts.sleepTotal ?? 7,
    sleepAsleepHours: null,
    sleepInBedHours: null,
    sleepCoreHours: null,
    sleepDeepHours: null,
    sleepRemHours: null,
    sleepAwakeHours: null,
    sleepEfficiencyPct: opts.sleepEff ?? 90,
    respiratoryDisturbances: null,
    activeEnergyKcal: null,
    restingEnergyKcal: null,
    heartRateMin: null,
    heartRateMax: null,
    heartRateMean: null,
    restingHeartRate: opts.rhr ?? 60,
    spo2: null,
    respiratoryRate: null,
    pulseTemperatureC: opts.pulseTempC ?? null,
    exerciseMinutes: null,
    standingMinutes: null,
    daylightMinutes: null,
    hrvSdnn: opts.hrv ?? 50,
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
}

function buildMood(date: string, valence: number | null): DailyMoodMetrics | null {
  if (valence == null) return null
  return {
    date,
    valence,
    valenceClass: 'Neutro',
    entryCount: 1,
    labels: [],
    associations: [],
  }
}

function fixture(daysBack: number, opts: FixtureOpts = {}): DailySnapshot {
  const date = isoDate(daysBack)
  return {
    date,
    interpolated: opts.interpolated,
    forecasted: opts.forecasted,
    health: buildHealth(date, opts),
    mood: buildMood(date, opts.valence ?? 0),
    medications: null,
  }
}

function buildDataset(): DailySnapshot[] {
  // 30 dias com jitter pra forçar SD>0 nas baselines
  const out: DailySnapshot[] = []
  for (let i = 30; i >= 1; i -= 1) {
    out.push(
      fixture(i, {
        hrv: 50 + (i % 5) - 2,
        rhr: 60 + (i % 3) - 1,
        pulseTempC: 36.0 + (i % 4) * 0.1 - 0.15,
        sleepEff: 88 + (i % 4),
        sleepTotal: 7 + (i % 3) * 0.2,
        valence: 0.1 * ((i % 5) - 2),
      }),
    )
  }
  return out
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// Smoke: Map tem 1 entry por snapshot
{
  const snapshots = buildDataset()
  const enriched = enrichSnapshotsWithDerivations(snapshots)
  assert.equal(enriched.size, snapshots.length, 'Map should have 1 entry per snapshot')
}

// Dia real com inputs completos: recovery, abi e wristTemp populated
{
  const snapshots = buildDataset()
  const enriched = enrichSnapshotsWithDerivations(snapshots)
  const day = enriched.get(isoDate(1))
  assert.ok(day, 'last day should be in the map')
  assert.notEqual(day.recoveryScore, null, 'recoveryScore should be computed')
  assert.notEqual(day.abi, null, 'abi should be computed')
  assert.notEqual(day.wristTempDeviation, null, 'wristTempDeviation should be computed')
  assert.equal(day.derivedFromInterpolated, false)
}

// Dia interp/forecast: derivedFromInterpolated true
{
  const snapshots = buildDataset()
  // Marca o último dia como interpolated
  const lastDate = isoDate(1)
  const lastIdx = snapshots.findIndex((s) => s.date === lastDate)
  snapshots[lastIdx] = { ...snapshots[lastIdx], interpolated: true }

  const enriched = enrichSnapshotsWithDerivations(snapshots)
  const day = enriched.get(lastDate)!
  assert.equal(day.derivedFromInterpolated, true, 'interp day must carry the flag')
  // Score ainda é computado (regra M6.1)
  assert.notEqual(day.recoveryScore, null)
  assert.notEqual(day.abi, null)
}

// Sem pulseTemperatureC: wristTempDeviation null
{
  const snapshots = buildDataset().map((s) => ({
    ...s,
    health: { ...s.health!, pulseTemperatureC: null },
  }))
  const enriched = enrichSnapshotsWithDerivations(snapshots)
  for (const day of enriched.values()) {
    assert.equal(day.wristTempDeviation, null, 'wristTemp null when no temp data')
  }
}

// Dataset pequeno (<14 dias reais): wristTempDeviation null por baseline insuficiente
{
  const snapshots = buildDataset().slice(-7) // só 7 dias
  const enriched = enrichSnapshotsWithDerivations(snapshots)
  for (const day of enriched.values()) {
    assert.equal(day.wristTempDeviation, null, 'wristTemp null when baseline insufficient')
  }
}

// Dataset vazio: Map vazio
{
  const enriched = enrichSnapshotsWithDerivations([])
  assert.equal(enriched.size, 0)
}

console.log('forecast-payload-enrichment.test.ts — all assertions passed')
