import assert from 'node:assert/strict'

import type { ConcentrationSeriesPoint } from '../src/lib/api'
import type { PKDose, PKMedication } from '../src/utils/pharmacokinetics'
import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import {
  analyzePkVariabilityVsMood,
  buildPkVariabilitySeries,
  evaluateDoseDerivedReliability,
  type DailyRangeExposure,
} from '../src/utils/pk-variability'

const BASE_HEALTH: Omit<DailyHealthMetrics, 'date'> = {
  interpolated: false,
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

const STUB_MED: PKMedication = {
  id: 'stub',
  name: 'Stub',
  category: 'SSRI',
  halfLife: 30,
  volumeOfDistribution: 12,
  bioavailability: 0.8,
  absorptionRate: 0.7,
  therapeuticRange: { min: 10, max: 80, unit: 'ng/mL' },
}

function isoDate(day: number): string {
  const base = new Date('2026-04-01T00:00:00Z').getTime()
  return new Date(base + day * 24 * 3600 * 1000).toISOString().slice(0, 10)
}

function snapshot(day: number, valence: number): DailySnapshot {
  const date = isoDate(day)
  return {
    date,
    health: { ...BASE_HEALTH, date },
    mood: { date, valence, valenceClass: null, entryCount: 1, labels: [], associations: [] },
    medications: null,
  }
}

function positiveSeries(days = 20): ConcentrationSeriesPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: isoDate(i),
    cmax_est: 45,
    cmin_est: 20,
    auc_est: 780,
  }))
}

function zeroSeries(days = 20): ConcentrationSeriesPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: isoDate(i),
    cmax_est: 0,
    cmin_est: 0,
    auc_est: 0,
  }))
}

const NO_DOSES: PKDose[] = []

function inRangeOverride(days = 20): DailyRangeExposure[] {
  return Array.from({ length: days }, () => ({
    inRangeHours: 24,
    outOfRangeHours: 0,
    belowRangeHours: 0,
    aboveRangeHours: 0,
    lowExitClass: 'in_range',
  }))
}

// Caso clássico de risco: backend série positiva sem dose local (fallback/regime)
{
  const reliability = evaluateDoseDerivedReliability('tir', positiveSeries(), NO_DOSES)
  assert.equal(reliability.reliable, false)
  assert.ok(reliability.warning?.includes('fallback'))
}

// Guard rail: métricas de range ficam null para não fingir paridade
{
  const tir = buildPkVariabilitySeries('tir', STUB_MED, NO_DOSES, positiveSeries(), 91)
  assert.ok(tir.every((value) => value == null), 'tir deve ser null quando série positiva não tem doses locais')
}

// Com override backend de exposição, TIR volta a ficar disponível mesmo sem dose local
{
  const series = positiveSeries(20)
  const override = inRangeOverride(20)
  const tir = buildPkVariabilitySeries('tir', STUB_MED, NO_DOSES, series, 91, override)
  assert.ok(tir.every((value) => value === 24), 'override de exposição deve liberar TIR com 24h em range')
}

// analyzePkVariabilityVsMood precisa carregar warning de coerência
{
  const series = positiveSeries(24)
  const snapshots = Array.from({ length: 24 }, (_, i) => snapshot(i, i % 2 === 0 ? 0.4 : 0.2))
  const hypothesis = analyzePkVariabilityVsMood(
    'lexapro',
    'Lexapro',
    'tir',
    snapshots,
    series,
    STUB_MED,
    NO_DOSES,
    91,
  )
  assert.equal(hypothesis.doseDerivedMetricsReliable, false)
  assert.ok(hypothesis.coherenceWarning != null)
  assert.ok(hypothesis.rows.every((row) => row.result == null), 'sem confiabilidade de dose, sem correlação de tir')
}

// Métrica não derivada de dose (cv) permanece analisável mesmo sem doses locais
{
  const series = positiveSeries(24)
  const snapshots = Array.from({ length: 24 }, (_, i) => snapshot(i, i * 0.01))
  const hypothesis = analyzePkVariabilityVsMood(
    'lexapro',
    'Lexapro',
    'cv',
    snapshots,
    series,
    STUB_MED,
    NO_DOSES,
    91,
  )
  assert.equal(hypothesis.doseDerivedMetricsReliable, true)
  assert.equal(hypothesis.coherenceWarning, null)
}

// analyze com override também deve marcar confiabilidade true
{
  const series = positiveSeries(24)
  const snapshots = Array.from({ length: 24 }, (_, i) => snapshot(i, i % 2 === 0 ? 0.4 : 0.2))
  const override = inRangeOverride(24)
  const hypothesis = analyzePkVariabilityVsMood(
    'lexapro',
    'Lexapro',
    'tir',
    snapshots,
    series,
    STUB_MED,
    NO_DOSES,
    91,
    override,
  )
  assert.equal(hypothesis.doseDerivedMetricsReliable, true)
  assert.equal(hypothesis.coherenceWarning, null)
}

// Sem dose local + série zerada é coerente (não fallback), então TIR pode ser calculado
{
  const reliability = evaluateDoseDerivedReliability('tir', zeroSeries(), NO_DOSES)
  assert.equal(reliability.reliable, true)
}

console.log('pk-variability-parity.test.ts — guard rails de paridade front/back ok')
