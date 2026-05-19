import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { computeFunctionalCapacity } from '../src/utils/functional-capacity'
import { computeMovementEfficiency } from '../src/utils/movement-efficiency'
import { computeRecoveryIndexSeries } from '../src/utils/recovery-index'

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-18T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function snapshot(daysBack: number, health: Partial<DailyHealthMetrics>, flags?: { interpolated?: boolean; forecasted?: boolean }): DailySnapshot {
  const date = isoDate(daysBack)
  return {
    date,
    interpolated: flags?.interpolated,
    forecasted: flags?.forecasted,
    health: {
      date,
      sleepStartAt: `${date}T23:00:00-03:00`,
      sleepEndAt: `${date}T07:00:00-03:00`,
      sleepTotalHours: 7.8,
      sleepAsleepHours: 7.2,
      sleepInBedHours: 8.0,
      sleepCoreHours: 4.1,
      sleepDeepHours: 1.4,
      sleepRemHours: 1.6,
      sleepAwakeHours: 0.4,
      sleepEfficiencyPct: 90,
      respiratoryDisturbances: 0,
      activeEnergyKcal: 420,
      restingEnergyKcal: 1600,
      heartRateMin: 48,
      heartRateMax: 122,
      heartRateMean: 72,
      restingHeartRate: 58,
      spo2: 97,
      respiratoryRate: 15,
      pulseTemperatureC: 34.1,
      exerciseMinutes: 40,
      standingMinutes: 420,
      daylightMinutes: 75,
      hrvSdnn: 52,
      steps: 9800,
      distanceKm: 6.2,
      physicalEffort: 3.3,
      walkingHeartRateAvg: 92,
      walkingAsymmetryPct: 2.1,
      walkingDoubleSupportPct: 29,
      walkingSpeedKmh: 5.1,
      walkingStepLengthCm: 73,
      runningSpeedKmh: null,
      runningGroundContactTimeMs: null,
      vo2Max: 39,
      sixMinuteWalkMeters: null,
      cardioRecoveryBpm: null,
      recordCount: 1,
      placeholderRestingEnergyRows: 0,
      ...health,
    },
    mood: null,
    medications: null,
  }
}

// Cenário A: dados completos -> score calculado e elegível
const completeRecoveryDataset = Array.from({ length: 30 }, (_, idx) => snapshot(29 - idx, {}))
const completeRecoveryPoint = computeRecoveryIndexSeries(completeRecoveryDataset).at(-1)!
assert.ok(completeRecoveryPoint.score != null, 'RecoveryIndex completo deve calcular score')
assert.equal(completeRecoveryPoint.evidence.eligible, true)
assert.equal(completeRecoveryPoint.evidence.reason, 'ok')

// Cenário C: abaixo do mínimo de readiness -> score null com reason explícita
const lowMovementDataset = [
  snapshot(1, { walkingAsymmetryPct: 2.2, walkingSpeedKmh: 5.0, walkingStepLengthCm: 72 }),
  snapshot(0, { walkingAsymmetryPct: 2.0, walkingSpeedKmh: 5.1, walkingStepLengthCm: 73 }),
]
const lowMovement = computeMovementEfficiency(lowMovementDataset)
assert.equal(lowMovement.score, null)
assert.equal(lowMovement.reason, 'insufficient_readiness')
assert.equal(lowMovement.evidence.reason, 'insufficient_readiness')

// Cenário D: visual_only -> dia interpolado não deve dirigir o score do FCI
const fciBase = Array.from({ length: 12 }, (_, idx) =>
  snapshot(12 - idx, {
    restingHeartRate: 58 + (idx % 3),
    walkingHeartRateAvg: 90 + (idx % 4),
    vo2Max: null,
  }),
)
const lastReal = snapshot(0, { restingHeartRate: 60, walkingHeartRateAvg: 93, sixMinuteWalkMeters: 560 })
const lastInterpolatedExtreme = snapshot(0, {
  restingHeartRate: 44,
  walkingHeartRateAvg: 140,
  sixMinuteWalkMeters: 900,
  vo2Max: 60,
}, { interpolated: true })
const fciWithInterpolation = computeFunctionalCapacity([...fciBase, lastReal, lastInterpolatedExtreme], [...fciBase, lastReal, lastInterpolatedExtreme])
assert.equal(fciWithInterpolation.date, lastReal.date, 'FCI deve usar último dia real para score')
assert.equal(fciWithInterpolation.evidence.usedInterpolated, false, 'visual_only não deve incorporar interpolado no score')

// Cenário E: score_with_penalty -> interpolado/proxy mantém score com penalidade mensurável
const recoveryInterpolated = computeRecoveryIndexSeries([
  ...Array.from({ length: 20 }, (_, idx) => snapshot(20 - idx, { hrvSdnn: 50 + (idx % 4), restingHeartRate: 58 + (idx % 2) })),
  snapshot(0, { hrvSdnn: 55, restingHeartRate: 56 }, { interpolated: true }),
]).at(-1)!
assert.ok(recoveryInterpolated.score != null, 'RecoveryIndex interpolado deve manter score no modo exploratório mínimo')
assert.equal(recoveryInterpolated.evidence.usedInterpolated, true)
assert.ok(recoveryInterpolated.evidence.confidencePenalty < 1, 'interpolado deve reduzir confiança')

console.log('index-evidence-behavior.test.ts — readiness/interpolation governance ok')
