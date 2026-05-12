import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { computeActivityReadiness } from '../src/utils/activity-readiness'

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
      steps: 10000,
      activeEnergyKcal: 450,
      walkingSpeedKmh: 5.2,
      walkingStepLengthCm: 74,
      walkingAsymmetryPct: 1.5,
      physicalEffort: 3.2,
      ...health,
    } as DailyHealthMetrics,
    mood: null,
    medications: null,
  }
}

const baseline = Array.from({ length: 20 }, (_, index) => fixture(20 - index, {}))

const preserved = computeActivityReadiness([
  ...baseline,
  fixture(0, { steps: 9800, activeEnergyKcal: 430, walkingSpeedKmh: 5.1, walkingStepLengthCm: 73.5 }),
])
assert.equal(preserved.klass, 'usar_energia')
assert.ok(preserved.score != null && preserved.score >= 75)

const lowReadiness = computeActivityReadiness([
  ...baseline,
  fixture(0, {
    steps: 4200,
    activeEnergyKcal: 180,
    walkingSpeedKmh: 3.2,
    walkingStepLengthCm: 58,
    walkingAsymmetryPct: 8.5,
    physicalEffort: 4.8,
  }),
])
assert.equal(lowReadiness.klass, 'poupar')
assert.ok(lowReadiness.score != null && lowReadiness.score < 55)

const insufficient = computeActivityReadiness([fixture(0, { steps: 8000 })])
assert.equal(insufficient.reason, 'insufficient_data')
assert.equal(insufficient.score, null)

console.log('activity-readiness.test.ts — all assertions passed')
