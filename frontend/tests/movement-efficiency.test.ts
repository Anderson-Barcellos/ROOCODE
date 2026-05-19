import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { computeMovementEfficiency } from '../src/utils/movement-efficiency'

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-11T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function fixture(daysBack: number, health: Partial<DailyHealthMetrics>): DailySnapshot {
  const date = isoDate(daysBack)
  return {
    date,
    health: {
      date,
      walkingAsymmetryPct: 2,
      walkingSpeedKmh: 5,
      walkingStepLengthCm: 75,
      walkingDoubleSupportPct: null,
      runningGroundContactTimeMs: null,
      ...health,
    } as DailyHealthMetrics,
    mood: null,
    medications: null,
  }
}

const partial = computeMovementEfficiency([
  fixture(2, { walkingDoubleSupportPct: null, runningGroundContactTimeMs: null }),
  fixture(1, { walkingDoubleSupportPct: null, runningGroundContactTimeMs: null }),
  fixture(0, { walkingDoubleSupportPct: null, runningGroundContactTimeMs: null }),
])

assert.equal(partial.score, null)
assert.equal(partial.reason, 'insufficient_readiness')
assert.equal(partial.evidence.reason, 'insufficient_readiness')

const persistentAsymmetry = computeMovementEfficiency(
  Array.from({ length: 14 }, (_, index) =>
    fixture(13 - index, {
      walkingAsymmetryPct: 6.2,
      walkingSpeedKmh: 4.6,
      walkingStepLengthCm: 70,
      walkingDoubleSupportPct: 32,
    }),
  ),
)

assert.equal(persistentAsymmetry.persistentAsymmetryAlert, true)
assert.match(persistentAsymmetry.verdict, /acompanhamento neurológico/)

const lowSpeed = computeMovementEfficiency(
  Array.from({ length: 14 }, (_, index) =>
    fixture(13 - index, {
      walkingAsymmetryPct: 2,
      walkingSpeedKmh: 3.2,
      walkingStepLengthCm: 58,
    }),
  ),
)

assert.equal(lowSpeed.lowSpeedAlert, true)

console.log('movement-efficiency.test.ts — all assertions passed')
